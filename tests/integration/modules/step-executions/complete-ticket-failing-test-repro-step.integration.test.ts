import { beforeEach, describe, expect, it } from "vitest";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import type { TicketIngestInput } from "@/modules/tickets/contracts/ticket-contracts";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { FAILING_TEST_REPRO_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import { completeTicketFailingTestReproStep } from "@/modules/step-executions/application/complete-ticket-failing-test-repro-step";
import {
  truncateTestTables,
} from "../../helpers/pgvector-test-db";
import {
  FailingTestReproStepExecutionEntity,
  TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { TicketGithubIssueEntity } from "@/modules/tickets/domain/ticket-github-issue.entity";
import { getDb } from "@/lib/db";
import { ticketStepExecutionsTph } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const makeTicketAggregate = (
  overrides: Partial<TicketIngestInput> = {},
): TicketAggregate =>
  TicketAggregate.create({
    ticketNumber: "CV-902",
    title: "Preferences page fails to load",
    slackThread: null,
    status: "needs_triage",
    description: "Opening preferences returns a 500 error.",
    companyNames: ["Acme Co"],
    employeeEmails: ["reporter@acme.test"],
    priority: "high",
    ticketType: "bug",
    dueDate: null,
    reporter: "reporter@acme.test",
    assignee: "owner@acme.test",
    jiraCreatedAt: "2026-02-20T10:00:00.000Z",
    jiraUpdatedAt: "2026-02-20T11:00:00.000Z",
    ...overrides,
  });

describe("completeTicketFailingTestReproStep (integration)", () => {
  const ticketRepo = new DrizzleTicketRepo();
  const stepExecutionRepo = new DrizzleStepExecutionRepo();

  beforeEach(async () => {
    await truncateTestTables();
  });

  it("marks the failing-test execution as succeeded and stores webhook output", async () => {
    await ticketRepo.createMany([makeTicketAggregate()]);
    await ticketRepo.saveGithubIssue(
      new TicketGithubIssueEntity("CV-902", 777, "I_kwDOFAKE777"),
    );

    const runningExecution = await stepExecutionRepo.save(
      new TicketPipelineStepExecutionEntity(
        "CV-902",
        FAILING_TEST_REPRO_STEP_NAME,
        "running",
        "github_repro_failing_test:CV-902:run-1",
        new Date("2026-03-01T12:00:00.000Z").toISOString(),
      ),
    );

    expect(runningExecution.id).toBeDefined();

    const result = await completeTicketFailingTestReproStep(
      {
        ticketId: "CV-902",
        pipelineId: runningExecution.id!,
        reproduceOperationOutcome: "reproduced",
        summaryOfFindings:
          "Added a profile-save regression test and confirmed it fails with 500.",
        confidenceLevel: 0.92,
        agentStatus: "complete",
        agentBranch: "ephemeral-ADM01",
        failingTestPaths: [
          "apps/web/test/profile-save.test.ts",
          "apps/web/test/profile-save-validation.test.ts",
        ],
        feedbackRequest: null,
      },
      { ticketRepo, stepExecutionRepo },
    );

    expect(result.ok).toBe(true);
    expect(result.data.stepExecution.id).toBe(runningExecution.id);
    expect(result.data.stepExecution.status).toBe("succeeded");
    expect(result.data.stepExecution.endedAt).not.toBeNull();
    expect(result.data.stepExecution.result).toMatchObject({
      stepName: FAILING_TEST_REPRO_STEP_NAME,
      githubMergeStatus: "draft",
      githubPrTargetBranch: "ephemeral-ADM01",
    });

    const [savedExecution] = await stepExecutionRepo.loadByTicketId("CV-902");
    expect(savedExecution).toBeInstanceOf(FailingTestReproStepExecutionEntity);

    const typedExecution = savedExecution as FailingTestReproStepExecutionEntity;
    expect(typedExecution.result?.outcome).toBe("reproduced");
    expect(typedExecution.result?.agentStatus).toBe("complete");
    expect(typedExecution.result?.githubMergeStatus).toBe("draft");
    expect(typedExecution.result?.githubPrTargetBranch).toBe(
      "ephemeral-ADM01",
    );
    expect(typedExecution.result?.agentBranch).toBe("ephemeral-ADM01");
    expect(typedExecution.result?.failingTestPaths).toEqual([
      "apps/web/test/profile-save.test.ts",
      "apps/web/test/profile-save-validation.test.ts",
    ]);
    expect(typedExecution.result?.summaryOfFindings).toBe(
      "Added a profile-save regression test and confirmed it fails with 500.",
    );
    expect(typedExecution.result?.confidenceLevel).toBe(0.92);

    const db = getDb();
    const [savedRow] = await db
      .select({ failingTestPath: ticketStepExecutionsTph.failingTestPath })
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.id, runningExecution.id!))
      .limit(1);
    expect(savedRow?.failingTestPath).toBe(
      "apps/web/test/profile-save.test.ts,apps/web/test/profile-save-validation.test.ts",
    );
  });

  it("returns 404 semantics when pipeline execution does not exist for ticket", async () => {
    await ticketRepo.createMany([makeTicketAggregate()]);

    await expect(
      completeTicketFailingTestReproStep(
        {
          ticketId: "CV-902",
          pipelineId: 999999,
          reproduceOperationOutcome: "agent_error",
          summaryOfFindings: "Could not reproduce after multiple attempts.",
          confidenceLevel: null,
          agentStatus: "error",
          agentBranch: "ephemeral-ADM01",
          failingTestPaths: null,
          feedbackRequest: null,
        },
        { ticketRepo, stepExecutionRepo },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("marks execution as waiting_for_user_feedback and stores feedback request", async () => {
    await ticketRepo.createMany([makeTicketAggregate()]);
    await ticketRepo.saveGithubIssue(
      new TicketGithubIssueEntity("CV-902", 778, "I_kwDOFAKE778"),
    );

    const runningExecution = await stepExecutionRepo.save(
      new TicketPipelineStepExecutionEntity(
        "CV-902",
        FAILING_TEST_REPRO_STEP_NAME,
        "running",
        "github_repro_failing_test:CV-902:run-feedback",
        new Date("2026-03-01T12:00:00.000Z").toISOString(),
      ),
    );

    const result = await completeTicketFailingTestReproStep(
      {
        ticketId: "CV-902",
        pipelineId: runningExecution.id!,
        reproduceOperationOutcome: "needs_user_feedback",
        summaryOfFindings:
          "Observed two conflicting expected behaviors in issue comments.",
        confidenceLevel: null,
        agentStatus: "complete",
        agentBranch: "ephemeral-ADM02",
        failingTestPaths: null,
        feedbackRequest: {
          requestId: "repro-q-001",
          reason: "Expected behavior is ambiguous",
          questions: [
            "Should submitting an empty nickname be allowed?",
            "Should the API return 400 or 422 on invalid nickname?",
          ],
          assumptions: ["Current 500 response is not expected behavior"],
        },
      },
      { ticketRepo, stepExecutionRepo },
    );

    expect(result.ok).toBe(true);
    expect(result.data.stepExecution.status).toBe("waiting_for_user_feedback");
    expect(result.data.stepExecution.endedAt).toBeNull();
    expect(result.data.stepExecution.result).toMatchObject({
      stepName: FAILING_TEST_REPRO_STEP_NAME,
      outcome: "needs_user_feedback",
      feedbackRequest: {
        requestId: "repro-q-001",
      },
    });
  });
});
