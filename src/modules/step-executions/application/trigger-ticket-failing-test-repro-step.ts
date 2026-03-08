"use server";

import { randomUUID } from "node:crypto";
import {
  triggerTicketFailingTestReproStepRequestSchema,
  triggerTicketFailingTestReproStepResponseSchema,
  type TriggerTicketFailingTestReproStepRequest,
  type TriggerTicketFailingTestReproStepResponse,
} from "@/modules/step-executions/contracts/trigger-ticket-failing-test-repro-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  FAILING_TEST_REPRO_STEP_NAME,
  TERMINAL_STEP_EXECUTION_STATUSES,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import type { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";
import { TicketGithubIssueEntity } from "@/modules/tickets/domain/ticket-github-issue.entity";
import { AppContext } from "@/lib/di";
import { completeTicketFailingTestReproStepRequestBodySchema } from "../contracts/complete-ticket-failing-test-repro-step-contracts";
import z from "zod";
import { TicketGitEnvironmentAggregate } from "@/modules/environments/domain/ticket-git-environment-aggregate";
import {
  TicketDescriptionEnrichmentStepExecutionEntity,
  FailingTestReproStepExecutionEntity,
  TicketPipelineStepExecutionEntity,
} from "../domain/step-execution-entity";
import { assignDefaultEnvironment } from "@/modules/environments/application/assign-environment";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { StepExecutionRepo } from "./step-execution-repo";
import { TicketGitEnvironmentRepo } from "@/modules/environments/application/ticket-git-environment-repo";
import { createTicketGitEnvironment } from "@/modules/environments/application/create-ticket-git-environment";

const WEBHOOK_PAYLOAD_PATH = "tmp/copilot-repro-webhook-payload.json";

function buildCustomInstructions(
  ticketId: string,
  pipelineRunId: string,
  stepExecutionId: number,
  enrichmentContext: string | null,
): string {
  const hardcodedTicketIdAndPipelineIdSchema =
    completeTicketFailingTestReproStepRequestBodySchema
      .omit({
        ticketId: true,
        pipelineRunId: true,
        stepExecutionId: true,
      })
      .extend({
        ticketId: z.literal(ticketId),
        pipelineRunId: z.literal(pipelineRunId),
        stepExecutionId: z.literal(stepExecutionId),
      });
  const jsonSchema = hardcodedTicketIdAndPipelineIdSchema.toJSONSchema();
  const jsonSchemaText = JSON.stringify(jsonSchema, null, 2);
  return `You are reproducing a bug from the linked GitHub issue.

Goal:
1. Write at least one failing automated test that reproduces the issue.
2. You can write multiple failing tests if needed.
3. Always write the final payload JSON to ${WEBHOOK_PAYLOAD_PATH}.

Ticket enrichment context:
${enrichmentContext ?? "No enrichment context is available yet. Use the ticket description and repository context."}

Rules for reproduceOperationOutcome:
- "reproduced": You created a failing test OR verified a reliable repro.
- "not_reproducible": You could not reproduce after reasonable investigation.
- "needs_user_feedback": The issue is ambiguous and user clarification is required before continuing.
- "agent_error": Tooling/runtime/repo constraints prevented completion.
- "cancelled": You were explicitly interrupted/cancelled.

Rules for fields:
- summaryOfFindings: 1-2000 chars, concrete and evidence-based.
- confidenceLevel: 0..1 when outcome is "reproduced" or "not_reproducible"; otherwise null.
- failingTestPaths: array of repo-relative failing test file paths when tests were written; null otherwise.
- feedbackRequest: required object when outcome is "needs_user_feedback"; otherwise null.
- feedbackRequest.reason should explain the blocking ambiguity.
- feedbackRequest.questions should contain concrete questions the user can answer asynchronously.
- feedbackRequest.assumptions should list assumptions you made so far (can be empty array).
- ticketId, pipelineRunId, and stepExecutionId must match exactly.

Required final action:
- Overwrite ${WEBHOOK_PAYLOAD_PATH} with valid JSON matching this schema exactly:
${jsonSchemaText}
- No markdown, no comments, no trailing commas.
- Ensure the file is present even on failure paths.
`;
}

export const triggerTicketFailingTestReproStep = async (
  rawInput: TriggerTicketFailingTestReproStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    ticketGitEnvironmentRepo,
    githubService,
    }: {
      ticketRepo: TicketRepo;
      stepExecutionRepo: StepExecutionRepo;
      ticketGitEnvironmentRepo: TicketGitEnvironmentRepo;
      githubService: Pick<
        GithubApiService,
        "createIssue" | "assignCopilot" | "unassignCopilot"
      >;
    } = {
      ticketRepo: AppContext.ticketRepo,
      stepExecutionRepo: AppContext.stepExecutionRepo,
      ticketGitEnvironmentRepo: AppContext.ticketGitEnvironmentRepo,
      githubService: AppContext.githubService,
    },
): Promise<TriggerTicketFailingTestReproStepResponse> => {
  const input = triggerTicketFailingTestReproStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId, {
    loadGithubIssue: true,
    loadTicketGitEnvironmentAggregate: true,
  });
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = new Date().toISOString();
  const execution = new TicketPipelineStepExecutionEntity(
    input.ticketId,
    input.pipelineRunId,
    FAILING_TEST_REPRO_STEP_NAME,
    "running",
    `${FAILING_TEST_REPRO_STEP_NAME}:${input.ticketId}:${randomUUID()}`,
    now,
  );

  let savedExecution = await stepExecutionRepo.save(execution);

  try {
    if (savedExecution.id === undefined) {
      throw new Error("Step execution ID missing after persistence");
    }

    let githubIssue = ticket.githubIssue;
    if (githubIssue === undefined) {
      throw new Error(
        "Ticket github issue relationship was expected to be loaded but was undefined",
      );
    }

    if (githubIssue === null) {
      const issue = await githubService.createIssue({
        title: ticket.title,
        body: ticket.description,
      });

      githubIssue = await ticketRepo.saveGithubIssue(
        new TicketGithubIssueEntity(
          input.ticketId,
          issue.issueNumber,
          issue.issueId,
        ),
      );
    } else {
      await githubService.unassignCopilot(githubIssue.githubIssueNumber);
    }

    let ticketGitEnvironment = ticket.ticketGitEnvironmentAggregate;
    if (ticketGitEnvironment === undefined) {
      throw new Error(
        "Ticket git environment relationship was expected to be loaded but was undefined",
      );
    }

    if (!ticketGitEnvironment) {
      const newEnvironment = await createTicketGitEnvironment({
        ticketId: input.ticketId,
      });
      await assignDefaultEnvironment(
        {
          ticketId: input.ticketId,
          ticketGitEnvironmentId: newEnvironment.id,
        },
        {
          ticketRepo,
          ticketGitEnvironmentRepo,
        },
      );
      ticketGitEnvironment = new TicketGitEnvironmentAggregate(
        input.ticketId,
        newEnvironment.baseEnvironmentId,
        newEnvironment.devBranch,
      );
    }

    const baseBranch = ticketGitEnvironment.devBranch;
    const pipelineExecutions =
      await stepExecutionRepo.loadByPipelineRunId(input.pipelineRunId);
    const latestEnrichmentStep = pipelineExecutions.find(
      (step) => step.stepName === TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
    );
    let enrichmentContext: string | null = null;
    if (
      latestEnrichmentStep instanceof TicketDescriptionEnrichmentStepExecutionEntity &&
      latestEnrichmentStep.status === "succeeded" &&
      latestEnrichmentStep.result
    ) {
      const result = latestEnrichmentStep.result;
      enrichmentContext = [
        `Summary: ${result.summaryOfEnrichment}`,
        `Datadog query terms: ${result.datadogQueryTerms.join(", ") || "none"}`,
        `Datadog time range: ${result.datadogTimeRange ?? "not provided"}`,
        `Key identifiers: ${result.keyIdentifiers.join(", ") || "none"}`,
        "Enriched ticket description:",
        result.enrichedTicketDescription,
      ].join("\n");
    }

    await githubService.assignCopilot({
      issueNumber: githubIssue.githubIssueNumber,
      baseBranch,
      customInstructions: buildCustomInstructions(
        input.ticketId,
        input.pipelineRunId,
        savedExecution.id,
        enrichmentContext,
      ),
    });

    savedExecution = await stepExecutionRepo.save(
      new FailingTestReproStepExecutionEntity(
        savedExecution.ticketId,
        savedExecution.pipelineRunId,
        savedExecution.status,
        savedExecution.idempotencyKey,
        null,
        savedExecution.startedAt,
        savedExecution.endedAt,
        savedExecution.createdAt,
        savedExecution.updatedAt,
        savedExecution.id,
      ),
    );
  } catch (error) {
    if (!TERMINAL_STEP_EXECUTION_STATUSES.has(savedExecution.status)) {
      await stepExecutionRepo.save(
        new TicketPipelineStepExecutionEntity(
          savedExecution.ticketId,
          savedExecution.pipelineRunId,
          savedExecution.stepName,
          "failed",
          savedExecution.idempotencyKey,
          savedExecution.startedAt,
          new Date().toISOString(),
          savedExecution.id,
          savedExecution.createdAt,
          savedExecution.updatedAt,
        ),
      );
    }

    throw error;
  }

  return triggerTicketFailingTestReproStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
