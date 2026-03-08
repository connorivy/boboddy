"use server";

import { randomUUID } from "node:crypto";
import {
  triggerTicketFailingTestFixStepRequestSchema,
  triggerTicketFailingTestFixStepResponseSchema,
  type TriggerTicketFailingTestFixStepRequest,
  type TriggerTicketFailingTestFixStepResponse,
} from "@/modules/step-executions/contracts/trigger-ticket-failing-test-fix-step-contracts";
import { completeTicketFailingTestFixStepRequestBodySchema } from "@/modules/step-executions/contracts/complete-ticket-failing-test-fix-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TERMINAL_STEP_EXECUTION_STATUSES,
} from "@/modules/step-executions/domain/step-execution.types";
import type { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";
import { TicketGithubIssueEntity } from "@/modules/tickets/domain/ticket-github-issue.entity";
import { AppContext } from "@/lib/di";
import {
  FailingTestFixStepExecutionEntity,
  FailingTestFixStepResultEntity,
  FailingTestReproStepExecutionEntity,
  TicketPipelineStepExecutionEntity,
} from "../domain/step-execution-entity";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { StepExecutionRepo } from "./step-execution-repo";
import z from "zod";

const WEBHOOK_PAYLOAD_PATH = "tmp/copilot-fix-webhook-payload.json";

function buildCustomInstructions(
  ticketId: string,
  pipelineRunId: string,
  stepExecutionId: number,
  failingTestPaths: string[],
): string {
  const hardcodedTicketIdAndPipelineIdSchema =
    completeTicketFailingTestFixStepRequestBodySchema
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

  return `You are fixing a bug described in the linked GitHub issue.

Existing failing tests that reproduce the linked issue have been created at the following paths in the repository:
${failingTestPaths.map((path) => `- ${path}`).join("\n")}

Goal:
- Fix the described issue by making existing failing test(s) pass.
- Prefer fixing production code; only modify the test if it is demonstrably incorrect.
- Keep changes minimal and aligned with existing code style.
- Always write the final payload JSON to ${WEBHOOK_PAYLOAD_PATH}.

Rules for fixOperationOutcome:
- "fixed": You fixed the issue and the target test now passes.
- "not_fixed": You were unable to produce a reliable fix after reasonable investigation.
- "agent_error": Tooling/runtime/repo constraints prevented completion.
- "cancelled": You were explicitly interrupted/cancelled.

Rules for fields:
- summaryOfFix: 1-2000 chars, concrete and evidence-based.
- fixConfidenceLevel: 0..1 when outcome is "fixed" or "not_fixed"; otherwise null.
- fixedTestPath: keep the original failing test path unless there is a justified reason to change it.
- ticketId, pipelineRunId, and stepExecutionId must match exactly.

Required final action:
- Overwrite ${WEBHOOK_PAYLOAD_PATH} with valid JSON matching this schema exactly:
${jsonSchemaText}
- No markdown, no comments, no trailing commas.
- Ensure the file is present even on failure paths.`;
}

export const triggerTicketFailingTestFixStep = async (
  rawInput: TriggerTicketFailingTestFixStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    githubService,
    }: {
      ticketRepo: TicketRepo;
      stepExecutionRepo: StepExecutionRepo;
      githubService: Pick<
        GithubApiService,
        "createIssue" | "assignCopilot" | "unassignCopilot"
      >;
    } = {
      ticketRepo: AppContext.ticketRepo,
      stepExecutionRepo: AppContext.stepExecutionRepo,
      githubService: AppContext.githubService,
    },
): Promise<TriggerTicketFailingTestFixStepResponse> => {
  const input = triggerTicketFailingTestFixStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId, {
    loadGithubIssue: true,
  });
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }
  const ticketId = ticket.id;
  if (!ticketId) {
    throw new Error(`Ticket with ID ${input.ticketId} is missing persistence metadata`);
  }

  const previousRuns = await stepExecutionRepo.loadByPipelineRunId(
    input.pipelineRunId,
  );
  const reproStep = previousRuns
    .filter(
      (run): run is FailingTestReproStepExecutionEntity =>
        run instanceof FailingTestReproStepExecutionEntity &&
        run.stepName === FAILING_TEST_REPRO_STEP_NAME &&
        run.pipelineRunId === input.pipelineRunId &&
        run.status === "succeeded",
    )
    .sort((a, b) => {
      const startedAtDiff = Date.parse(b.startedAt) - Date.parse(a.startedAt);
      if (startedAtDiff !== 0) {
        return startedAtDiff;
      }
      return (b.id ?? 0) - (a.id ?? 0);
    })[0];

  const failingTestPaths =
    reproStep?.result?.failingTestPaths?.filter(
      (path) => path.trim().length > 0,
    ) ?? [];
  if (failingTestPaths.length === 0) {
    throw new Error(
      `Could not find failing test paths from ${FAILING_TEST_REPRO_STEP_NAME} for pipeline run ${input.pipelineRunId}`,
    );
  }
  const baseBranch = reproStep?.result?.githubPrTargetBranch?.trim();
  if (!baseBranch) {
    throw new Error(
      `Could not determine target branch from ${FAILING_TEST_REPRO_STEP_NAME} for pipeline run ${input.pipelineRunId}`,
    );
  }

  const now = new Date().toISOString();
  const execution = new TicketPipelineStepExecutionEntity(
    ticketId,
    input.pipelineRunId,
    FAILING_TEST_FIX_STEP_NAME,
    "running",
    `${FAILING_TEST_FIX_STEP_NAME}:${ticketId}:${input.pipelineRunId}:${randomUUID()}`,
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
          ticketId,
          issue.issueNumber,
          issue.issueId,
        ),
      );
    } else {
      await githubService.unassignCopilot(githubIssue.githubIssueNumber);
    }

    await githubService.assignCopilot({
      issueNumber: githubIssue.githubIssueNumber,
      baseBranch,
      customInstructions: buildCustomInstructions(
        ticketId,
        input.pipelineRunId,
        savedExecution.id,
        failingTestPaths,
      ),
    });

    savedExecution = await stepExecutionRepo.save(
      new FailingTestFixStepExecutionEntity(
        savedExecution.ticketId,
        savedExecution.pipelineRunId,
        savedExecution.status,
        savedExecution.idempotencyKey,
        new FailingTestFixStepResultEntity(
          "draft",
          githubIssue.githubIssueNumber,
          githubIssue.githubIssueId,
          baseBranch,
          null,
          undefined,
          undefined,
          failingTestPaths[0],
        ),
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

  return triggerTicketFailingTestFixStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
