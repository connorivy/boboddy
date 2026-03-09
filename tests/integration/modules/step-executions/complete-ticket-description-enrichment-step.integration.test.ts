import { beforeEach, describe, expect, it } from "vitest";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import type { TicketIngestInput } from "@/modules/tickets/contracts/ticket-contracts";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import { completeTicketDescriptionEnrichmentStep } from "@/modules/step-executions/ticket_description_enrichment/application/complete-ticket-description-enrichment-step";
import {
  truncateTestTables,
} from "../../helpers/pgvector-test-db";
import {
  TicketDescriptionEnrichmentStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";

const makeTicketAggregate = (
  overrides: Partial<TicketIngestInput> = {},
): TicketAggregate =>
  TicketAggregate.create({
    ticketNumber: "CV-952",
    title: "Intermittent auth refresh failures",
    slackThread: null,
    status: "needs_triage",
    description: "Some users report random 401s after token refresh.",
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

describe("completeTicketDescriptionEnrichmentStep (integration)", () => {
  const ticketRepo = new DrizzleTicketRepo();
  const stepExecutionRepo = new DrizzleStepExecutionRepo();

  beforeEach(async () => {
    await truncateTestTables();
  });

  it("marks enrichment step as succeeded and stores payload", async () => {
    await ticketRepo.saveMany([makeTicketAggregate()]);

    const runningExecution = await stepExecutionRepo.save(
      new TicketDescriptionEnrichmentStepExecutionEntity(
        "CV-952",
        "CV-952",
        "running",
        null,
        new Date("2026-03-01T12:00:00.000Z").toISOString(),
      ),
    );

    const result = await completeTicketDescriptionEnrichmentStep(
      {
        ticketId: "CV-952",
        pipelineId: runningExecution.id!,
        operationOutcome: "findings_recorded",
        summaryOfInvestigation:
          "Errors spike on /api/auth/refresh for Acme users in us-east-1.",
        investigationReport:
          "Symptoms: refresh 401s. Impact: Acme users. Evidence: Datadog logs include request_id=req-123 and trace_id=trace-456.",
        whatHappened:
          "Acme users hit /api/auth/refresh and received 401 responses during token refresh attempts.",
        confidenceLevel: 0.88,
        datadogQueryTerms: ["service:api", "route:/api/auth/refresh", "status:error"],
        datadogTimeRange: "last_60m",
        keyIdentifiers: ["company:Acme", "request_id:req-123", "trace_id:trace-456"],
        exactEventTimes: ["2026-03-01T12:03:12.000Z"],
        codeUnitsInvolved: [
          {
            kind: "api_route",
            name: "/api/auth/refresh",
            filePath: "src/app/api/auth/refresh/route.ts",
            symbol: "POST",
            relevance: "Handles the refresh request that returned 401.",
            evidence: ["request_id=req-123", "trace_id=trace-456"],
            notes: [],
          },
          {
            kind: "frontend_component",
            name: "RefreshSessionBoundary",
            filePath: "frontend-web/src/components/auth/refresh-session-boundary.tsx",
            symbol: "RefreshSessionBoundary",
            relevance: "Initiates the client-side refresh flow.",
            evidence: ["user reported refresh failure after app action"],
            notes: [],
          },
        ],
        databaseFindings: [
          {
            entityType: "auth_session",
            relationToTicket: "Session used by the affected refresh flow",
            identifiers: ["request_id:req-123"],
            records: [{ sessionId: "sess_123", updatedAt: "2026-03-01T12:03:10.000Z" }],
            comparisonNotes: [],
            notes: [],
          },
        ],
        logFindings: [
          {
            source: "application_log",
            routeOrCodePath: "/api/auth/refresh",
            queryOrFilter: "service:api route:/api/auth/refresh request_id:req-123",
            timestamp: "2026-03-01T12:03:12.000Z",
            message: "refresh failed with 401",
            identifiers: ["request_id:req-123"],
            evidence: ["trace_id=trace-456"],
            notes: [],
          },
        ],
        datadogSessionFindings: [
          {
            userIdentifier: "reporter@acme.test",
            sessionId: "rum-session-1",
            timeWindow: "2026-03-01T12:02:12.000Z -> 2026-03-01T12:03:22.000Z",
            events: [
              {
                timestamp: "2026-03-01T12:03:12.000Z",
                type: "error",
                description: "401 during refresh",
                route: "/api/auth/refresh",
                metadata: { traceId: "trace-456" },
              },
            ],
            notes: [],
          },
        ],
        investigationGaps: [],
        recommendedNextQueries: ["trace_id:trace-456"],
        rawResultJson: {
          hits: 42,
        },
        agentStatus: "complete",
        agentBranch: "ephemeral-MEM9-dev1",
      },
      { stepExecutionRepo },
    );

    expect(result.ok).toBe(true);
    expect(result.data.stepExecution.id).toBe(runningExecution.id);
    expect(result.data.stepExecution.status).toBe("succeeded");
    expect(result.data.stepExecution.result).toMatchObject({
      stepName: TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
      operationOutcome: "findings_recorded",
      agentBranch: "ephemeral-MEM9-dev1",
    });

    const [savedExecution] = await stepExecutionRepo.loadByTicketId("CV-952");
    expect(savedExecution).toBeInstanceOf(
      TicketDescriptionEnrichmentStepExecutionEntity,
    );

    const typedExecution =
      savedExecution as TicketDescriptionEnrichmentStepExecutionEntity;
    expect(typedExecution.result?.datadogQueryTerms).toEqual([
      "service:api",
      "route:/api/auth/refresh",
      "status:error",
    ]);
    expect(typedExecution.result?.confidenceLevel).toBe(0.88);
    expect(typedExecution.result?.whatHappened).toContain("/api/auth/refresh");
    expect(typedExecution.result?.codeUnitsInvolved[0]?.symbol).toBe("POST");
  });
});
