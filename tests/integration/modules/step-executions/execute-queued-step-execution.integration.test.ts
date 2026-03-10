import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppContext } from "@/lib/di";
import { assignDefaultEnvironment } from "@/modules/environments/application/assign-environment";
import { EnvironmentAggregate } from "@/modules/environments/domain/environment-aggregate";
import { TicketGitEnvironmentAggregate } from "@/modules/environments/domain/ticket-git-environment-aggregate";
import { executeQueuedStepExecution } from "@/modules/step-executions/application/execute-queued-step-execution";
import { getPipelineRun } from "@/modules/pipeline-runs/application/get-pipeline-run";
import { ingestTicketContracts } from "@/modules/tickets/application/batch-ingest";
import { loadTicketDetail } from "@/modules/tickets/application/get-tickets";
import { completeTicketDescriptionEnrichmentStep } from "@/modules/step-executions/ticket_description_enrichment/application/complete-ticket-description-enrichment-step";
import { completeTicketFailingTestReproStep } from "@/modules/step-executions/github_repro_failing_test/application/complete-ticket-failing-test-repro-step";
import { completeTicketFailingTestFixStep } from "@/modules/step-executions/github_fix_failing_test/application/complete-ticket-failing-test-fix-step";
import { FailingTestReproStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import type {
  IngestTicketsRequest,
  TicketIngestInput,
} from "@/modules/tickets/contracts/ticket-contracts";
import { truncateTestTables } from "../../helpers/pgvector-test-db";
import { createPipelineRuns } from "@/modules/pipeline-runs/application/create-pipeline-runs";

const hoisted = vi.hoisted(() => ({
  rankTicketDescriptionMock: vi.fn(),
  createIssueMock: vi.fn(),
  unassignCopilotMock: vi.fn(),
  assignCopilotMock: vi.fn(),
  upsertFileMock: vi.fn(),
}));

vi.mock(
  "@/modules/step-executions/ticket_description_quality_rank/infra/ticket-description-quality-ai",
  () => ({
    CodexCliTicketDescriptionQualityAi: class {
      rankTicketDescription = hoisted.rankTicketDescriptionMock;
    },
  }),
);

vi.spyOn(AppContext, "githubService", "get").mockReturnValue({
  createIssue: hoisted.createIssueMock,
  unassignCopilot: hoisted.unassignCopilotMock,
  assignCopilot: hoisted.assignCopilotMock,
  upsertFile: hoisted.upsertFileMock,
} as unknown as (typeof AppContext)["githubService"]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const makeTicket = (
  overrides: Partial<TicketIngestInput> = {},
): IngestTicketsRequest => ({
  tickets: [
    {
      ticketNumber: "CV-612",
      title: "Session restore misses expected state",
      slackThread: null,
      status: "needs_triage",
      description: "Restoring a saved session reopens tabs but loses filters.",
      companyNames: ["Acme Co"],
      employeeEmails: ["reporter@acme.test"],
      priority: "medium",
      ticketType: "bug",
      dueDate: null,
      reporter: "reporter@acme.test",
      assignee: "owner@acme.test",
      jiraCreatedAt: "2026-03-11T10:00:00.000Z",
      jiraUpdatedAt: "2026-03-11T10:05:00.000Z",
      ...overrides,
    },
  ],
});

function normalizeSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSnapshotValue(item));
  }

  if (typeof value === "string") {
    if (UUID_PATTERN.test(value)) {
      return "<uuid>";
    }

    if (ISO_TIMESTAMP_PATTERN.test(value)) {
      return "<iso-timestamp>";
    }
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeSnapshotValue(nestedValue),
      ]),
    );
  }

  return value;
}

async function ingestTicketAndLoadDetail() {
  const [ticket] = await ingestTicketContracts(makeTicket());
  expect(ticket).toBeDefined();

  await createPipelineRuns({
    pipelineRuns: [{ ticketId: ticket.id }],
  });
  const ticketDetail = await loadTicketDetail(ticket.id);
  const [firstStepExecution] = ticketDetail.pipeline.stepExecutions;

  expect(firstStepExecution).toBeDefined();
  expect(firstStepExecution.pipelineId).toBeTruthy();

  return {
    ticket,
    ticketDetail,
    firstStepExecution,
    pipelineId: firstStepExecution.pipelineId as string,
  };
}

async function provisionDefaultTicketEnvironment(ticketId: string) {
  await AppContext.environmentRepo.save(
    new EnvironmentAggregate(
      "adm-1",
      "adm",
      1,
      "us",
      "postgres://example.test:5432/app",
      0,
      new Date("2026-03-11T09:59:00.000Z"),
    ),
  );

  const ticketGitEnvironment = await AppContext.ticketGitEnvironmentRepo.save(
    new TicketGitEnvironmentAggregate(ticketId, "adm-1", "ticket-cv-612-dev"),
  );

  await assignDefaultEnvironment({
    ticketId,
    ticketGitEnvironmentId: ticketGitEnvironment.id!,
  });
}

async function runStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AI pipeline happy path] ${label} failed:`, error);
    throw error;
  }
}

async function loadPipelineStepExecutions(pipelineId: string) {
  const pipeline = await getPipelineRun(pipelineId);
  expect(pipeline).not.toBeNull();
  expect(pipeline?.stepExecutions).not.toBeNull();

  return pipeline!.stepExecutions!;
}

function assertNamedStepExecutionSnapshot(
  stepExecution: unknown,
  snapshotName: string,
) {
  expect(normalizeSnapshotValue(stepExecution)).toMatchSnapshot(snapshotName);
}

async function assertInitialQueuedStepSnapshot(ticketDetail: {
  pipeline: { stepExecutions: unknown[] };
}) {
  expect(ticketDetail.pipeline.stepExecutions).toHaveLength(1);
  assertNamedStepExecutionSnapshot(
    ticketDetail.pipeline.stepExecutions[0],
    "initial queued description step",
  );

  expect(normalizeSnapshotValue(ticketDetail)).toMatchInlineSnapshot(`
    {
      "pipeline": {
        "stepExecutions": [
          {
            "createdAt": "<iso-timestamp>",
            "endedAt": null,
            "failureReason": null,
            "id": "<uuid>",
            "pipelineId": "<uuid>",
            "result": null,
            "startedAt": "<iso-timestamp>",
            "status": "queued",
            "stepName": "ticket_description_quality_rank",
            "ticketId": "CV-612",
            "updatedAt": "<iso-timestamp>",
          },
        ],
      },
      "ticket": {
        "assignee": "owner@acme.test",
        "companyNames": [
          "Acme Co",
        ],
        "createdAt": "<iso-timestamp>",
        "defaultGitEnvironment": undefined,
        "defaultGitEnvironmentId": undefined,
        "description": "Restoring a saved session reopens tabs but loses filters.",
        "dueDate": null,
        "employeeEmails": [
          "reporter@acme.test",
        ],
        "id": "CV-612",
        "jiraCreatedAt": "<iso-timestamp>",
        "jiraUpdatedAt": "<iso-timestamp>",
        "pipelineSteps": undefined,
        "priority": "medium",
        "reporter": "reporter@acme.test",
        "slackThread": null,
        "status": "needs_triage",
        "ticketNumber": "CV-612",
        "ticketType": "bug",
        "title": "Session restore misses expected state",
        "updatedAt": "<iso-timestamp>",
      },
    }
  `);
}

async function assertDescriptionStepAndQueuedInvestigation(pipelineId: string) {
  const stepExecutions = await loadPipelineStepExecutions(pipelineId);
  expect(stepExecutions).toHaveLength(2);

  assertNamedStepExecutionSnapshot(
    stepExecutions[0],
    "queued investigation step after description completion",
  );
  assertNamedStepExecutionSnapshot(
    stepExecutions[1],
    "completed description step result",
  );
}

async function assertInvestigationStepRunning(pipelineId: string) {
  const stepExecutions = await loadPipelineStepExecutions(pipelineId);
  expect(stepExecutions).toHaveLength(2);

  assertNamedStepExecutionSnapshot(
    stepExecutions[0],
    "running investigation step",
  );
}

async function assertCompletedInvestigationAndQueuedRepro(pipelineId: string) {
  const stepExecutions = await loadPipelineStepExecutions(pipelineId);
  expect(stepExecutions).toHaveLength(3);

  assertNamedStepExecutionSnapshot(
    stepExecutions[0],
    "queued repro step after investigation completion",
  );
  assertNamedStepExecutionSnapshot(
    stepExecutions[1],
    "completed investigation step result",
  );
}

async function assertReproStepRunning(pipelineId: string) {
  const stepExecutions = await loadPipelineStepExecutions(pipelineId);
  expect(stepExecutions).toHaveLength(3);

  assertNamedStepExecutionSnapshot(stepExecutions[0], "running repro step");
}

async function assertCompletedReproAndQueuedFix(pipelineId: string) {
  const stepExecutions = await loadPipelineStepExecutions(pipelineId);
  expect(stepExecutions).toHaveLength(4);

  assertNamedStepExecutionSnapshot(
    stepExecutions[0],
    "queued fix step after repro completion",
  );
  assertNamedStepExecutionSnapshot(
    stepExecutions[1],
    "completed repro step result",
  );
}

async function assertFixStepRunning(pipelineId: string) {
  const stepExecutions = await loadPipelineStepExecutions(pipelineId);
  expect(stepExecutions).toHaveLength(4);

  assertNamedStepExecutionSnapshot(stepExecutions[0], "running fix step");
}

async function assertCompletedFixStep(pipelineId: string) {
  const stepExecutions = await loadPipelineStepExecutions(pipelineId);
  expect(stepExecutions).toHaveLength(4);

  assertNamedStepExecutionSnapshot(
    stepExecutions[0],
    "completed fix step result",
  );
}

async function completeInvestigationStepAndAssert(
  stepExecutionId: string,
  pipelineId: string,
) {
  await completeTicketDescriptionEnrichmentStep({
    stepExecutionId,
    agentStatus: "complete",
    agentBranch: "ticket/CV-612-investigation",
    operationOutcome: "findings_recorded",
    summaryOfInvestigation:
      "Session restore reopens tabs but does not restore filters.",
    investigationReport:
      "Investigation found filter state is not persisted during session restore.",
    whatHappened:
      "The restore flow rehydrates tabs but omits the saved filter payload.",
    datadogQueryTerms: ["CV-612", "session restore", "filters"],
    datadogTimeRange: "2026-03-11T10:00:00.000Z/2026-03-11T10:05:10.000Z",
    keyIdentifiers: ["CV-612", "session-restore"],
    exactEventTimes: ["2026-03-11T10:05:00.000Z"],
    codeUnitsInvolved: [
      {
        kind: "function",
        name: "restoreSession",
        filePath: "src/modules/session/restore-session.ts",
        symbol: "restoreSession",
        relevance: "Restores tab state but not filters.",
        evidence: ["Tab restoration occurs without filter payload hydration."],
        notes: [],
      },
    ],
    databaseFindings: [
      {
        entityType: "saved_session",
        relationToTicket:
          "Captured session state for the affected restore flow.",
        identifiers: ["CV-612", "session-restore"],
        records: [{ id: "session-restore", filters: null }],
        comparisonNotes: ["Saved session record did not contain filter data."],
        notes: [],
      },
    ],
    logFindings: [
      {
        source: "application_log",
        routeOrCodePath: "/session/restore",
        queryOrFilter: "ticket:CV-612",
        timestamp: "2026-03-11T10:05:00.000Z",
        message: "restoreSession completed without filter state",
        identifiers: ["CV-612"],
        evidence: ["Log confirms filter payload was empty at restore time."],
        notes: [],
      },
    ],
    datadogSessionFindings: [
      {
        userIdentifier: "reporter@acme.test",
        sessionId: "session-restore",
        timeWindow: "2026-03-11T10:04:00.000Z/2026-03-11T10:05:10.000Z",
        events: [
          {
            timestamp: "2026-03-11T10:05:00.000Z",
            type: "action",
            description:
              "User restored a saved session and filters were absent.",
            route: "/session/restore",
            metadata: { ticketId: "CV-612" },
          },
        ],
        notes: [],
      },
    ],
    investigationGaps: [],
    recommendedNextQueries: ["Inspect filter serialization during save flow."],
    confidenceLevel: 0.87,
    rawResultJson: {
      mocked: true,
      ticketId: "CV-612",
    },
  });

  await assertCompletedInvestigationAndQueuedRepro(pipelineId);
}

async function markReproStepAsMerged(stepExecutionId: string) {
  const stepExecution =
    await AppContext.stepExecutionRepo.load(stepExecutionId);
  expect(stepExecution).toBeDefined();
  expect(stepExecution?.result).toBeDefined();

  if (
    !stepExecution ||
    !(stepExecution instanceof FailingTestReproStepExecutionEntity) ||
    !stepExecution.result
  ) {
    throw new Error("Expected repro step to have a result payload");
  }

  stepExecution.result.githubMergeStatus = "merged";
  await AppContext.stepExecutionRepo.save(stepExecution);
}

describe("AI pipeline flow (integration)", () => {
  beforeEach(async () => {
    await truncateTestTables();
    hoisted.rankTicketDescriptionMock.mockReset();
    hoisted.createIssueMock.mockReset();
    hoisted.unassignCopilotMock.mockReset();
    hoisted.assignCopilotMock.mockReset();
    hoisted.upsertFileMock.mockReset();
    hoisted.createIssueMock.mockResolvedValue({
      issueNumber: 123,
      issueId: "issue_123",
    });
    hoisted.unassignCopilotMock.mockResolvedValue(undefined);
    hoisted.assignCopilotMock.mockResolvedValue(undefined);
    hoisted.upsertFileMock.mockResolvedValue(undefined);
  });

  it("walks through the AI pipeline happy path from ticket ingest through pipeline advancement", async () => {
    const initialState = await runStep(
      "assert initial queued step snapshot",
      async () => {
        const state = await ingestTicketAndLoadDetail();
        await provisionDefaultTicketEnvironment(state.ticket.id);
        await assertInitialQueuedStepSnapshot(state.ticketDetail);
        return state;
      },
    );

    await runStep("execute description step", async () => {
      const stepExecutionId = await getPipelineRun(
        initialState.pipelineId,
      ).then((pipeline) => pipeline?.stepExecutions?.[0]?.id);
      if (!stepExecutionId) {
        throw new Error("No step execution found for description step");
      }
      hoisted.rankTicketDescriptionMock.mockResolvedValue({
        stepsToReproduceScore: 0.8,
        expectedBehaviorScore: 0.45,
        observedBehaviorScore: 0.9,
        reasoning: "Observed behavior is clear, but expected behavior is thin.",
        rawResponse: '{"mocked":true}',
      });

      await executeQueuedStepExecution({
        stepExecutionId,
      });
      await assertDescriptionStepAndQueuedInvestigation(
        initialState.pipelineId,
      );
    });

    // await runStep("execute duplicate candidates step", async () => {
    // });

    await runStep("execute investigation step", async () => {
      const stepExecutionId = await getPipelineRun(
        initialState.pipelineId,
      ).then((pipeline) => pipeline?.stepExecutions?.[0]?.id);
      if (!stepExecutionId) {
        throw new Error("No step execution found for investigation step");
      }
      await executeQueuedStepExecution({
        stepExecutionId,
      });
      expect(hoisted.createIssueMock).toHaveBeenCalledTimes(1);
      expect(hoisted.upsertFileMock).toHaveBeenCalledTimes(1);
      expect(hoisted.assignCopilotMock).toHaveBeenCalledTimes(1);

      await assertInvestigationStepRunning(initialState.pipelineId);
      await completeInvestigationStepAndAssert(
        stepExecutionId,
        initialState.pipelineId,
      );
    });

    await runStep("execute repro step", async () => {
      const stepExecutionId = await getPipelineRun(
        initialState.pipelineId,
      ).then((pipeline) => pipeline?.stepExecutions?.[0]?.id);
      if (!stepExecutionId) {
        throw new Error("No step execution found for repro step");
      }

      await executeQueuedStepExecution({
        stepExecutionId,
      });

      expect(hoisted.createIssueMock).toHaveBeenCalledTimes(1);
      expect(hoisted.unassignCopilotMock).toHaveBeenCalledTimes(1);
      expect(hoisted.upsertFileMock).toHaveBeenCalledTimes(2);
      expect(hoisted.assignCopilotMock).toHaveBeenCalledTimes(2);

      await assertReproStepRunning(initialState.pipelineId);

      await completeTicketFailingTestReproStep({
        stepExecutionId,
        agentStatus: "complete",
        agentBranch: "ticket/CV-612-repro",
        reproduceOperationOutcome: "reproduced",
        summaryOfFindings:
          "Added a failing integration test that confirms session restore drops saved filters.",
        confidenceLevel: 0.91,
        failingTestPaths: [
          "tests/integration/modules/session/restore-session.integration.test.ts",
        ],
        feedbackRequest: null,
      });

      await assertCompletedReproAndQueuedFix(initialState.pipelineId);

      await markReproStepAsMerged(stepExecutionId);
    });

    await runStep("execute fix step", async () => {
      const stepExecutionId = await getPipelineRun(
        initialState.pipelineId,
      ).then((pipeline) => pipeline?.stepExecutions?.[0]?.id);
      if (!stepExecutionId) {
        throw new Error("No step execution found for fix step");
      }

      await executeQueuedStepExecution({
        stepExecutionId,
      });

      expect(hoisted.createIssueMock).toHaveBeenCalledTimes(1);
      expect(hoisted.unassignCopilotMock).toHaveBeenCalledTimes(2);
      expect(hoisted.upsertFileMock).toHaveBeenCalledTimes(3);
      expect(hoisted.assignCopilotMock).toHaveBeenCalledTimes(3);

      await assertFixStepRunning(initialState.pipelineId);

      await completeTicketFailingTestFixStep({
        stepExecutionId,
        agentStatus: "complete",
        agentBranch: "ticket/CV-612-fix",
        fixOperationOutcome: "fixed",
        summaryOfFix:
          "Updated session restore to rehydrate saved filters before rendering restored tabs, which makes the reproduced integration test pass.",
        fixConfidenceLevel: 0.89,
        fixedTestPath:
          "tests/integration/modules/session/restore-session.integration.test.ts",
      });

      await assertCompletedFixStep(initialState.pipelineId);
    });
  });
});
