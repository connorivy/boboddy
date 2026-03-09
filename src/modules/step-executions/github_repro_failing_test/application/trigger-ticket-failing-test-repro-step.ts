"use server";
import {
  triggerTicketFailingTestReproStepRequestSchema,
  triggerTicketFailingTestReproStepResponseSchema,
  type TriggerTicketFailingTestReproStepRequest,
  type TriggerTicketFailingTestReproStepResponse,
} from "@/modules/step-executions/github_repro_failing_test/contracts/trigger-ticket-failing-test-repro-step-contracts";
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
} from "@/modules/step-executions/domain/step-execution-entity";
import { assignDefaultEnvironment } from "@/modules/environments/application/assign-environment";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { TicketGitEnvironmentRepo } from "@/modules/environments/application/ticket-git-environment-repo";
import { createTicketGitEnvironment } from "@/modules/environments/application/create-ticket-git-environment";
import { EnvironmentRepo } from "@/modules/environments/application/environment-repo";

const WEBHOOK_PAYLOAD_PATH = "tmp/copilot-repro-webhook-payload.json";

function buildCustomInstructions(enrichmentContext: string | null): string {
  const jsonSchema =
    completeTicketFailingTestReproStepRequestBodySchema.toJSONSchema();
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
- ticketId and pipelineId must match exactly.

Required final action:
- Create ${WEBHOOK_PAYLOAD_PATH} with valid JSON matching this schema exactly:
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
    environmentRepo,
    ticketGitEnvironmentRepo,
    githubService,
  }: {
    ticketRepo: TicketRepo;
    stepExecutionRepo: StepExecutionRepo;
    environmentRepo: EnvironmentRepo;
    ticketGitEnvironmentRepo: TicketGitEnvironmentRepo;
    githubService: GithubApiService;
  } = AppContext,
): Promise<TriggerTicketFailingTestReproStepResponse> => {
  const input = triggerTicketFailingTestReproStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId, {
    loadGithubIssue: true,
    loadTicketGitEnvironmentAggregate: true,
    loadTicketPipeline: true,
  });
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = new Date().toISOString();
  const execution = new FailingTestReproStepExecutionEntity(
    null,
    input.ticketId,
    "running",
    null,
    now,
  );

  let savedExecution = await stepExecutionRepo.save(execution);

  try {
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

    const baseEnvironment = await environmentRepo.loadById(
      ticketGitEnvironment.baseEnvironmentId,
    );
    if (!baseEnvironment) {
      throw new Error(
        `Base environment ${ticketGitEnvironment.baseEnvironmentId} not found`,
      );
    }

    const baseBranch = ticketGitEnvironment.devBranch;
    const latestEnrichmentStep = ticket.getLatestPipelineStep(
      TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
    );
    let enrichmentContext: string | null = null;
    if (
      latestEnrichmentStep instanceof
        TicketDescriptionEnrichmentStepExecutionEntity &&
      latestEnrichmentStep.status === "succeeded" &&
      latestEnrichmentStep.result
    ) {
      const result = latestEnrichmentStep.result;
      enrichmentContext = [
        `Summary: ${result.summaryOfInvestigation}`,
        `Datadog query terms: ${result.datadogQueryTerms.join(", ") || "none"}`,
        `Datadog time range: ${result.datadogTimeRange ?? "not provided"}`,
        `Key identifiers: ${result.keyIdentifiers.join(", ") || "none"}`,
        "Investigation report:",
        result.investigationReport,
      ].join("\n");
    }

    await githubService.upsertFile(
      "boboddy-state.json",
      baseBranch,
      `
{
  "stepExecutionId": "${savedExecution.id}",
  "stepName": "${FAILING_TEST_REPRO_STEP_NAME}",
  "dbHost": "${baseEnvironment.databaseHostUrl}"
}
      `,
    );

    await githubService.assignCopilot({
      issueNumber: githubIssue.githubIssueNumber,
      baseBranch,
      customInstructions: buildCustomInstructions(enrichmentContext),
    });

    savedExecution = await stepExecutionRepo.save(
      new FailingTestReproStepExecutionEntity(
        savedExecution.pipelineId,
        savedExecution.ticketId,
        savedExecution.status,
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
        new FailingTestReproStepExecutionEntity(
          savedExecution.pipelineId,
          savedExecution.ticketId,
          "failed",
          null,
          savedExecution.startedAt,
          new Date().toISOString(),
          savedExecution.createdAt,
          savedExecution.updatedAt,
          savedExecution.id,
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
