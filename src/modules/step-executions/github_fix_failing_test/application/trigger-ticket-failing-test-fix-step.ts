"use server";
import {
  triggerTicketFailingTestFixStepRequestSchema,
  triggerTicketFailingTestFixStepResponseSchema,
  type TriggerTicketFailingTestFixStepRequest,
  type TriggerTicketFailingTestFixStepResponse,
} from "@/modules/step-executions/github_fix_failing_test/contracts/trigger-ticket-failing-test-fix-step-contracts";
import { completeTicketFailingTestFixStepRequestBodySchema } from "@/modules/step-executions/github_fix_failing_test/contracts/complete-ticket-failing-test-fix-step-contracts";
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
} from "@/modules/step-executions/domain/step-execution-entity";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { TicketGitEnvironmentRepo } from "@/modules/environments/application/ticket-git-environment-repo";
import z from "zod";

const WEBHOOK_PAYLOAD_PATH = "tmp/copilot-fix-webhook-payload.json";

function buildCustomInstructions(
  ticketId: string,
  pipelineId: string,
  failingTestPaths: string[],
): string {
  const hardcodedTicketIdAndPipelineIdSchema =
    completeTicketFailingTestFixStepRequestBodySchema
      .omit({
        ticketId: true,
        pipelineId: true,
      })
      .extend({
        ticketId: z.literal(ticketId),
        pipelineId: z.literal(pipelineId),
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
- ticketId and pipelineId must match exactly.

Required final action:
- Create ${WEBHOOK_PAYLOAD_PATH} with valid JSON matching this schema exactly:
${jsonSchemaText}
- No markdown, no comments, no trailing commas.
- Ensure the file is present even on failure paths.`;
}

export const triggerTicketFailingTestFixStep = async (
  rawInput: TriggerTicketFailingTestFixStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    ticketGitEnvironmentRepo,
    githubService,
  }: {
    ticketRepo: TicketRepo;
    stepExecutionRepo: StepExecutionRepo;
    ticketGitEnvironmentRepo: TicketGitEnvironmentRepo;
    githubService: GithubApiService;
  } = AppContext,
): Promise<TriggerTicketFailingTestFixStepResponse> => {
  const input = triggerTicketFailingTestFixStepRequestSchema.parse(rawInput);

  const ticketByNumber = await ticketRepo.loadByTicketNumbers([
    input.ticketNumber,
  ]);
  const ticketId = ticketByNumber[0]?.id;
  if (!ticketId) {
    throw new Error(`Ticket with number ${input.ticketNumber} not found`);
  }

  const ticket = await ticketRepo.loadById(ticketId, {
    loadGithubIssue: true,
  });
  if (!ticket) {
    throw new Error(`Ticket with ID ${ticketId} not found`);
  }

  const ticketGitEnvironment = await ticketGitEnvironmentRepo.loadById(
    input.ticketGitEnvironmentId,
  );
  if (!ticketGitEnvironment) {
    throw new Error(
      `Ticket Git environment with ID ${input.ticketGitEnvironmentId} not found`,
    );
  }

  if (ticketGitEnvironment.ticketId !== ticket.id) {
    throw new Error(
      `Ticket Git environment ${input.ticketGitEnvironmentId} does not belong to ticket ${ticket.id}`,
    );
  }

  const previousRuns = await stepExecutionRepo.loadByTicketId(ticket.id);
  const reproStep = previousRuns
    .filter(
      (run): run is FailingTestReproStepExecutionEntity =>
        run instanceof FailingTestReproStepExecutionEntity &&
        run.stepName === FAILING_TEST_REPRO_STEP_NAME &&
        run.result?.githubMergeStatus === "merged" &&
        run.result?.githubPrTargetBranch?.trim() ===
          ticketGitEnvironment.devBranch.trim(),
    )
    .sort((a, b) => {
      const startedAtDiff = Date.parse(b.startedAt) - Date.parse(a.startedAt);
      if (startedAtDiff !== 0) {
        return startedAtDiff;
      }
      return b.id.localeCompare(a.id);
    })[0];

  const failingTestPaths =
    reproStep?.result?.failingTestPaths?.filter(
      (path) => path.trim().length > 0,
    ) ?? [];
  if (failingTestPaths.length === 0) {
    throw new Error(
      `Could not find failing test paths from ${FAILING_TEST_REPRO_STEP_NAME} for branch ${ticketGitEnvironment.devBranch}`,
    );
  }

  const now = new Date().toISOString();
  const execution = new FailingTestFixStepExecutionEntity(
    ticket.id,
    ticket.id,
    "running",
    null,
    now,
  );
  let savedExecution = await stepExecutionRepo.save(execution);

  try {
    const pipelineId = savedExecution.id;

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
          ticket.id,
          issue.issueNumber,
          issue.issueId,
        ),
      );
    } else {
      await githubService.unassignCopilot(githubIssue.githubIssueNumber);
    }

    await githubService.upsertFile(
      "boboddy-state.json",
      ticketGitEnvironment.devBranch,
      `
{
  "pipelineId": "${savedExecution.pipelineId}",
  "stepName": "${FAILING_TEST_FIX_STEP_NAME}",
}
      `,
    );

    await githubService.assignCopilot({
      issueNumber: githubIssue.githubIssueNumber,
      baseBranch: ticketGitEnvironment.devBranch,
      customInstructions: buildCustomInstructions(
        ticket.id,
        pipelineId,
        failingTestPaths,
      ),
    });

    savedExecution = await stepExecutionRepo.save(
      new FailingTestFixStepExecutionEntity(
        savedExecution.pipelineId,
        savedExecution.ticketId,
        savedExecution.status,
        new FailingTestFixStepResultEntity(
          "draft",
          githubIssue.githubIssueNumber,
          githubIssue.githubIssueId,
          ticketGitEnvironment.devBranch,
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
      execution.status = "failed";
      execution.endedAt = new Date().toISOString();
      await stepExecutionRepo.save(execution);
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
