import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { getDb } from "@/lib/db";
import {
  pipelineRuns,
  ticketStepExecutionsTph,
  tickets,
} from "@/lib/db/schema";
import {
  FailingTestFixStepCompletionResultEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestFixStepResultEntity,
  FailingTestReproAgentErrorResultEntity,
  FailingTestReproNeedsUserFeedbackResultEntity,
  FailingTestReproStepExecutionEntity,
  FailingTestReproSucceededResultEntity,
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionEnrichmentStepResultEntity,
  TicketDescriptionQualityStepExecutionEntity,
  TicketDescriptionQualityStepResultEntity,
  TicketDuplicateCandidateResultItemEntity,
  TicketDuplicateCandidatesResultEntity,
  TicketDuplicateCandidatesStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { truncateTestTables } from "../helpers/pgvector-test-db";

const repo = new DrizzleStepExecutionRepo();

async function insertTicket(ticketId: string) {
  await getDb().insert(tickets).values({
    id: ticketId,
    ticketNumber: ticketId,
    title: `Ticket ${ticketId}`,
    slackThread: null,
    status: "needs_triage",
    description: `Description for ${ticketId}`,
    companyNames: [],
    employeeEmails: [],
    priority: "medium",
    ticketType: "bug",
    dueDate: null,
    reporter: "reporter@example.com",
    assignee: "owner@example.com",
    jiraCreatedAt: new Date("2026-03-11T10:00:00.000Z"),
    jiraUpdatedAt: new Date("2026-03-11T10:05:00.000Z"),
  });
}

async function insertPipelineRun(pipelineId: string, ticketId: string) {
  await getDb().insert(pipelineRuns).values({
    id: pipelineId,
    ticketId,
  });
}

describe("DrizzleStepExecutionRepo TPH integration", () => {
  beforeEach(async () => {
    await truncateTestTables();
  });

  it("saveMany round-trips every supported step execution type", async () => {
    const ticketId = "CV-1001";
    const pipelineId = uuidv7();
    await insertTicket(ticketId);
    await insertPipelineRun(pipelineId, ticketId);

    const qualityExecution = new TicketDescriptionQualityStepExecutionEntity(
      pipelineId,
      ticketId,
      "succeeded",
      new TicketDescriptionQualityStepResultEntity(
        0.8,
        0.6,
        0.9,
        "The ticket is precise enough to begin work.",
        "{ raw: true }",
      ),
      "2026-03-11T10:00:00.000Z",
      "2026-03-11T10:01:00.000Z",
    );
    const enrichmentExecution = new TicketDescriptionEnrichmentStepExecutionEntity(
      pipelineId,
      ticketId,
      "succeeded",
      new TicketDescriptionEnrichmentStepResultEntity(
        "The cache invalidation race is isolated to restore flow.",
        "Investigation report",
        "State restore bypasses one invalidation path.",
        ["service:session-api", "restoreSession"],
        "2026-03-11T09:00:00Z/2026-03-11T10:00:00Z",
        ["ticket:CV-1001", "session_id=abc"],
        ["2026-03-11T09:13:11.000Z"],
        [
          {
            kind: "function",
            name: "restoreSession",
            filePath: "src/session/restore.ts",
            symbol: "restoreSession",
            relevance: "Responsible for the missing invalidation call.",
            evidence: ["call stack points here"],
            notes: [],
          },
        ],
        [
          {
            entityType: "session",
            relationToTicket: "Stale session state matched the broken restore path.",
            identifiers: ["session_id=abc"],
            records: [{ id: "abc", filter_state: "stale" }],
            comparisonNotes: [],
            notes: [],
          },
        ],
        [
          {
            source: "application_log",
            routeOrCodePath: "restoreSession",
            queryOrFilter: "session_id:abc",
            timestamp: "2026-03-11T09:13:11.000Z",
            message: "restore request completed without invalidation step",
            identifiers: ["session_id=abc"],
            evidence: ["log line 42"],
            notes: [],
          },
        ],
        [
          {
            userIdentifier: "reporter@example.com",
            sessionId: "abc",
            timeWindow: "2026-03-11T09:10:00Z/2026-03-11T09:15:00Z",
            events: [
              {
                timestamp: "2026-03-11T09:13:11.000Z",
                type: "restore",
                description: "Restore completes without refresh.",
                route: "/sessions/restore",
                metadata: { sessionId: "abc" },
              },
            ],
            notes: ["Refresh never followed restore"],
          },
        ],
        ["No local reproduction yet"],
        ["query logs by session_id=abc"],
        0.72,
        {
          investigationReport: "Investigation report",
          whatHappened: "State restore bypasses one invalidation path.",
          datadogQueryTerms: ["service:session-api", "restoreSession"],
          datadogTimeRange: "2026-03-11T09:00:00Z/2026-03-11T10:00:00Z",
          keyIdentifiers: ["ticket:CV-1001", "session_id=abc"],
          exactEventTimes: ["2026-03-11T09:13:11.000Z"],
          codeUnitsInvolved: [
            {
              kind: "function",
              name: "restoreSession",
              filePath: "src/session/restore.ts",
              symbol: "restoreSession",
              relevance: "Responsible for the missing invalidation call.",
              evidence: ["call stack points here"],
              notes: [],
            },
          ],
          databaseFindings: [
            {
              entityType: "session",
              relationToTicket:
                "Stale session state matched the broken restore path.",
              identifiers: ["session_id=abc"],
              records: [{ id: "abc", filter_state: "stale" }],
              comparisonNotes: [],
              notes: [],
            },
          ],
          logFindings: [
            {
              source: "application_log",
              routeOrCodePath: "restoreSession",
              queryOrFilter: "session_id:abc",
              timestamp: "2026-03-11T09:13:11.000Z",
              message: "restore request completed without invalidation step",
              identifiers: ["session_id=abc"],
              evidence: ["log line 42"],
              notes: [],
            },
          ],
          datadogSessionFindings: [
            {
              userIdentifier: "reporter@example.com",
              sessionId: "abc",
              timeWindow: "2026-03-11T09:10:00Z/2026-03-11T09:15:00Z",
              events: [
                {
                  timestamp: "2026-03-11T09:13:11.000Z",
                  type: "restore",
                  description: "Restore completes without refresh.",
                  route: "/sessions/restore",
                  metadata: { sessionId: "abc" },
                },
              ],
              notes: ["Refresh never followed restore"],
            },
          ],
          investigationGaps: ["No local reproduction yet"],
          recommendedNextQueries: ["query logs by session_id=abc"],
          operationOutcome: "findings_recorded",
        },
        "complete",
        "copilot/fix-cv-1001",
        "findings_recorded",
      ),
      "2026-03-11T10:02:00.000Z",
      "2026-03-11T10:10:00.000Z",
    );
    const reproExecution = new FailingTestReproStepExecutionEntity(
      pipelineId,
      ticketId,
      "succeeded",
      new FailingTestReproSucceededResultEntity(
        "open",
        123,
        "ISSUE_123",
        "complete",
        "copilot/repro-cv-1001",
        "A failing test reproduces the race.",
        0.91,
        ["tests/session/restore.test.ts", "tests/session/filter.test.ts"],
        "run_123",
        "abc123",
        { reproduction: "found" },
      ),
      "main",
      "2026-03-11T10:11:00.000Z",
      "2026-03-11T10:20:00.000Z",
    );
    const fixExecution = new FailingTestFixStepExecutionEntity(
      pipelineId,
      ticketId,
      "succeeded",
      new FailingTestFixStepResultEntity(
        "draft",
        123,
        "ISSUE_123",
        "main",
        new FailingTestFixStepCompletionResultEntity(
          "complete",
          "copilot/fix-cv-1001",
          "fixed",
          "Added the missing invalidation call.",
          0.86,
          "tests/session/restore.test.ts",
          undefined,
          { patch: "applied" },
        ),
        "run_456",
        "Implementation looks safe.",
        "tests/session/restore.test.ts",
        "def456",
      ),
      "2026-03-11T10:21:00.000Z",
      "2026-03-11T10:30:00.000Z",
    );
    const duplicateExecution = new TicketDuplicateCandidatesStepResultEntity(
      pipelineId,
      ticketId,
      "succeeded",
      new TicketDuplicateCandidatesResultEntity(
        [
          new TicketDuplicateCandidateResultItemEntity("CV-998", 0.98),
          new TicketDuplicateCandidateResultItemEntity("CV-997", 0.76),
        ],
        [new TicketDuplicateCandidateResultItemEntity("CV-120", 0.41)],
        [new TicketDuplicateCandidateResultItemEntity("CV-555", 0.88)],
      ),
      "2026-03-11T10:31:00.000Z",
      "2026-03-11T10:32:00.000Z",
    );

    await repo.saveMany([
      qualityExecution,
      enrichmentExecution,
      reproExecution,
      fixExecution,
      duplicateExecution,
    ]);

    expect(await repo.count()).toBe(5);

    const loaded = await repo.loadByPipelineId(pipelineId);
    expect(loaded).toHaveLength(5);

    const [loadedDuplicate, loadedFix, loadedRepro, loadedEnrichment, loadedQuality] =
      loaded;

    expect(loadedDuplicate).toBeInstanceOf(TicketDuplicateCandidatesStepResultEntity);
    expect(loadedDuplicate.result).toMatchObject({
      proposed: [
        { candidateTicketId: "CV-998", score: 0.98 },
        { candidateTicketId: "CV-997", score: 0.76 },
      ],
      dismissed: [{ candidateTicketId: "CV-120", score: 0.41 }],
      promoted: [{ candidateTicketId: "CV-555", score: 0.88 }],
    });

    expect(loadedFix).toBeInstanceOf(FailingTestFixStepExecutionEntity);
    expect(loadedFix.result).toMatchObject({
      githubIssueNumber: 123,
      githubIssueId: "ISSUE_123",
      githubPrTargetBranch: "main",
      completionResult: {
        fixOperationOutcome: "fixed",
        summaryOfFix: "Added the missing invalidation call.",
        fixedTestPath: "tests/session/restore.test.ts",
      },
    });

    expect(loadedRepro).toBeInstanceOf(FailingTestReproStepExecutionEntity);
    expect(loadedRepro.result).toMatchObject({
      outcome: "reproduced",
      githubMergeStatus: "open",
      failingTestPaths: [
        "tests/session/restore.test.ts",
        "tests/session/filter.test.ts",
      ],
      confidenceLevel: 0.91,
    });

    expect(loadedEnrichment).toBeInstanceOf(
      TicketDescriptionEnrichmentStepExecutionEntity,
    );
    expect(loadedEnrichment.result).toMatchObject({
      summaryOfInvestigation:
        "The cache invalidation race is isolated to restore flow.",
      investigationReport: "Investigation report",
      whatHappened: "State restore bypasses one invalidation path.",
      agentBranch: "copilot/fix-cv-1001",
      operationOutcome: "findings_recorded",
    });

    expect(loadedQuality).toBeInstanceOf(TicketDescriptionQualityStepExecutionEntity);
    expect(loadedQuality.result).toMatchObject({
      stepsToReproduceScore: 0.8,
      expectedBehaviorScore: 0.6,
      observedBehaviorScore: 0.9,
      reasoning: "The ticket is precise enough to begin work.",
    });

    const page = await repo.loadPage({ page: 1, pageSize: 2 });
    expect(page).toHaveLength(2);
    expect(page[0].id).toBe(duplicateExecution.id);
    expect(page[1].id).toBe(fixExecution.id);
  });

  it("updates failing test repro rows and clears stale discriminator fields", async () => {
    const ticketId = "CV-1002";
    const pipelineId = uuidv7();
    await insertTicket(ticketId);
    await insertPipelineRun(pipelineId, ticketId);

    const execution = new FailingTestReproStepExecutionEntity(
      pipelineId,
      ticketId,
      "succeeded",
      new FailingTestReproSucceededResultEntity(
        "open",
        77,
        "ISSUE_77",
        "complete",
        "copilot/repro-cv-1002",
        "Original reproduction succeeded.",
        0.94,
        ["tests/original.test.ts"],
        "run_success",
        "sha_success",
        { stage: "initial" },
      ),
      "release/2026.03",
      "2026-03-11T11:00:00.000Z",
      "2026-03-11T11:05:00.000Z",
    );

    await repo.save(execution);

    execution.setResult({
      status: "waiting_for_user_feedback",
      endedAt: "2026-03-11T11:20:00.000Z",
      result: new FailingTestReproNeedsUserFeedbackResultEntity(
        "open",
        77,
        "ISSUE_77",
        "complete",
        "copilot/repro-cv-1002",
        "Need environment details before continuing.",
        {
          requestId: "feedback-1",
          reason: "The failure depends on tenant-specific data.",
          questions: ["Which tenant reproduces this most reliably?"],
          assumptions: ["Using production-like seed data"],
        },
        "run_feedback",
        "sha_feedback",
        {
          feedbackRequest: {
            requestId: "feedback-1",
            reason: "The failure depends on tenant-specific data.",
            questions: ["Which tenant reproduces this most reliably?"],
            assumptions: ["Using production-like seed data"],
          },
        },
      ),
      githubPrTargetBranch: "release/2026.03",
    });

    await repo.save(execution);

    const [row] = await getDb()
      .select()
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.id, execution.id));

    expect(row.outcome).toBe("needs_user_feedback");
    expect(row.confidenceLevel).toBeNull();
    expect(row.failingTestPath).toBeNull();
    expect(row.failureReason).toBeNull();
    expect(row.summaryOfFindings).toBe(
      "Need environment details before continuing.",
    );

    const loaded = await repo.load(execution.id);
    expect(loaded).toBeInstanceOf(FailingTestReproStepExecutionEntity);
    expect(loaded?.status).toBe("waiting_for_user_feedback");
    expect(loaded?.result).toMatchObject({
      outcome: "needs_user_feedback",
      feedbackRequest: {
        requestId: "feedback-1",
        reason: "The failure depends on tenant-specific data.",
        questions: ["Which tenant reproduces this most reliably?"],
        assumptions: ["Using production-like seed data"],
      },
    });
  });

  it("maps legacy failing test fix values from the tph row", async () => {
    const ticketId = "CV-1003";
    const pipelineId = uuidv7();
    await insertTicket(ticketId);
    await insertPipelineRun(pipelineId, ticketId);

    const now = new Date("2026-03-11T12:00:00.000Z");
    const executionId = uuidv7();
    await getDb().insert(ticketStepExecutionsTph).values({
      id: executionId,
      pipelineId,
      ticketId,
      stepName: "github_fix_failing_test",
      type: "github_fix_failing_test",
      status: "succeeded",
      idempotencyKey: executionId,
      startedAt: now,
      endedAt: new Date("2026-03-11T12:10:00.000Z"),
      createdAt: now,
      updatedAt: now,
      githubIssueNumber: 88,
      githubIssueId: "ISSUE_88",
      githubAgentRunId: "run_fix_88",
      githubMergeStatus: "open",
      githubPrTargetBranch: "main",
      agentStatus: "complete",
      agentBranch: "copilot/fix-cv-1003",
      agentSummary: "Fix branch prepared",
      failingTestPath: "tests/legacy.test.ts",
      failingTestCommitSha: "legacysha",
      summaryOfFix: "Legacy row reported reproduced instead of fixed.",
      fixConfidenceLevel: 0.67,
      fixOperationOutcome: "reproduced",
      rawResultJson: { source: "legacy" },
    });

    const loaded = await repo.load(executionId);

    expect(loaded).toBeInstanceOf(FailingTestFixStepExecutionEntity);
    expect(loaded?.result).toMatchObject({
      githubIssueNumber: 88,
      githubIssueId: "ISSUE_88",
      githubPrTargetBranch: "main",
      completionResult: {
        fixOperationOutcome: "fixed",
        fixedTestPath: "tests/legacy.test.ts",
        summaryOfFix: "Legacy row reported reproduced instead of fixed.",
      },
    });
  });

  it("loads queued executions in ascending order and only claims queued rows", async () => {
    const ticketId = "CV-1004";
    const pipelineId = uuidv7();
    await insertTicket(ticketId);
    await insertPipelineRun(pipelineId, ticketId);

    const first = new TicketDescriptionQualityStepExecutionEntity(
      pipelineId,
      ticketId,
      "queued",
      null,
      "2026-03-11T13:00:00.000Z",
    );
    const second = new TicketDescriptionQualityStepExecutionEntity(
      pipelineId,
      ticketId,
      "queued",
      null,
      "2026-03-11T13:02:00.000Z",
    );
    const third = new TicketDescriptionQualityStepExecutionEntity(
      pipelineId,
      ticketId,
      "queued",
      null,
      "2026-03-11T13:01:00.000Z",
    );
    const running = new TicketDescriptionQualityStepExecutionEntity(
      pipelineId,
      ticketId,
      "running",
      null,
      "2026-03-11T13:03:00.000Z",
    );

    await repo.saveMany([first, second, third, running]);

    const queued = await repo.loadQueued(500);
    expect(queued.map((execution) => execution.id)).toEqual([
      first.id,
      third.id,
      second.id,
    ]);

    const claimed = await repo.claimQueued(third.id);
    expect(claimed?.status).toBe("running");

    const reloadedClaimed = await repo.load(third.id);
    expect(reloadedClaimed?.status).toBe("running");
    expect(reloadedClaimed?.endedAt).toBeUndefined();

    await expect(repo.claimQueued(third.id)).resolves.toBeNull();
    await expect(repo.claimQueued(running.id)).resolves.toBeNull();
  });

  it("groups executions by pipeline ids and preserves per-pipeline ordering", async () => {
    const ticketA = "CV-1005";
    const ticketB = "CV-1006";
    const pipelineA = uuidv7();
    const pipelineB = uuidv7();
    await insertTicket(ticketA);
    await insertTicket(ticketB);
    await insertPipelineRun(pipelineA, ticketA);
    await insertPipelineRun(pipelineB, ticketB);

    const aOlder = new FailingTestReproStepExecutionEntity(
      pipelineA,
      ticketA,
      "failed",
      new FailingTestReproAgentErrorResultEntity(
        "draft",
        501,
        "ISSUE_501",
        "error",
        "copilot/repro-cv-1005",
        "The agent failed after cloning the repo.",
        "git clone failed",
      ),
      "main",
      "2026-03-11T14:00:00.000Z",
      "2026-03-11T14:05:00.000Z",
    );
    const aNewer = new TicketDescriptionQualityStepExecutionEntity(
      pipelineA,
      ticketA,
      "succeeded",
      new TicketDescriptionQualityStepResultEntity(
        0.4,
        0.3,
        0.7,
        "Still usable but under-specified.",
        "{ raw: false }",
      ),
      "2026-03-11T14:10:00.000Z",
      "2026-03-11T14:11:00.000Z",
    );
    const bOnly = new TicketDuplicateCandidatesStepResultEntity(
      pipelineB,
      ticketB,
      "succeeded",
      new TicketDuplicateCandidatesResultEntity(
        [new TicketDuplicateCandidateResultItemEntity("CV-1001", 0.9)],
        [],
        [],
      ),
      "2026-03-11T14:20:00.000Z",
      "2026-03-11T14:21:00.000Z",
    );

    await repo.saveMany([aOlder, aNewer, bOnly]);

    const grouped = await repo.loadByPipelineIds([pipelineA, pipelineB]);

    expect(grouped.get(pipelineA)?.map((execution) => execution.id)).toEqual([
      aNewer.id,
      aOlder.id,
    ]);
    expect(grouped.get(pipelineB)?.map((execution) => execution.id)).toEqual([
      bOnly.id,
    ]);

    const byTicket = await repo.getByTicketId(ticketA);
    expect(byTicket.map((execution) => execution.id)).toEqual([
      aNewer.id,
      aOlder.id,
    ]);
  });

  it("throws when a tph row is corrupt", async () => {
    const ticketId = "CV-1007";
    const pipelineId = uuidv7();
    await insertTicket(ticketId);
    await insertPipelineRun(pipelineId, ticketId);

    const executionId = uuidv7();
    const now = new Date("2026-03-11T15:00:00.000Z");
    await getDb().insert(ticketStepExecutionsTph).values({
      id: executionId,
      pipelineId,
      ticketId,
      stepName: "ticket_description_quality_rank",
      type: "github_repro_failing_test",
      status: "queued",
      idempotencyKey: executionId,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(repo.load(executionId)).rejects.toThrow(
      `Corrupt step execution row ${executionId}: stepName 'ticket_description_quality_rank' does not match type 'github_repro_failing_test'`,
    );
  });
});
