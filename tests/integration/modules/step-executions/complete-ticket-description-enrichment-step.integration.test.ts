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
        "running",
        "ticket_description_enrichment:CV-952:run-1",
        null,
        new Date("2026-03-01T12:00:00.000Z").toISOString(),
      ),
    );

    const result = await completeTicketDescriptionEnrichmentStep(
      {
        ticketId: "CV-952",
        pipelineId: runningExecution.id!,
        operationOutcome: "enriched",
        summaryOfEnrichment:
          "Errors spike on /api/auth/refresh for Acme users in us-east-1.",
        enrichedTicketDescription:
          "Symptoms: refresh 401s. Impact: Acme users. Evidence: Datadog logs include request_id=req-123 and trace_id=trace-456.",
        confidenceLevel: 0.88,
        datadogQueryTerms: ["service:api", "route:/api/auth/refresh", "status:error"],
        datadogTimeRange: "last_60m",
        keyIdentifiers: ["company:Acme", "request_id:req-123", "trace_id:trace-456"],
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
      operationOutcome: "enriched",
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
  });
});
