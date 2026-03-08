import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import type { TicketIngestInput } from "@/modules/tickets/contracts/ticket-contracts";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import {
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { triggerTicketDescriptionEnrichmentStep } from "@/modules/step-executions/ticket_description_enrichment/application/trigger-ticket-description-enrichment-step";
import {
  truncateTestTables,
} from "../../helpers/pgvector-test-db";

const hoisted = vi.hoisted(() => ({
  enrichTicketDescription: vi.fn(),
}));

vi.mock("@/modules/step-executions/ticket_description_enrichment/infra/ticket-description-enrichment-ai", () => ({
  CodexCliTicketDescriptionEnrichmentAi: class {
    enrichTicketDescription = hoisted.enrichTicketDescription;
  },
}));

const makeTicketAggregate = (
  overrides: Partial<TicketIngestInput> = {},
): TicketAggregate =>
  TicketAggregate.create({
    ticketNumber: "CV-951",
    title: "Random 500 while loading session history",
    slackThread: null,
    status: "needs_triage",
    description: "Users intermittently hit 500 on /api/session/history.",
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

describe("triggerTicketDescriptionEnrichmentStep (integration)", () => {
  const ticketRepo = new DrizzleTicketRepo();
  const stepExecutionRepo = new DrizzleStepExecutionRepo();

  beforeEach(async () => {
    await truncateTestTables();
    hoisted.enrichTicketDescription.mockReset();
  });

  it("runs local codex enrichment and marks the step succeeded", async () => {
    await ticketRepo.createMany([makeTicketAggregate()]);

    hoisted.enrichTicketDescription.mockResolvedValue({
      operationOutcome: "enriched",
      summaryOfEnrichment:
        "Errors spike on /api/session/history for Acme users in us-east-1.",
      enrichedTicketDescription:
        "Symptoms: 500 on /api/session/history. Impact: Acme users. Evidence: request_id=req-123 trace_id=trace-456.",
      confidenceLevel: 0.86,
      datadogQueryTerms: ["service:api", "route:/api/session/history"],
      datadogTimeRange: "last_60m",
      keyIdentifiers: ["company:Acme", "request_id:req-123", "trace_id:trace-456"],
      rawResultJson: { hits: 32 },
      rawResponse: "{\"ok\":true}",
    });

    const result = await triggerTicketDescriptionEnrichmentStep(
      { ticketId: "CV-951" },
      {
        ticketRepo,
        stepExecutionRepo,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data.stepExecution.stepName).toBe(
      TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
    );
    expect(result.data.stepExecution.status).toBe("succeeded");
    expect(result.data.stepExecution.result).toMatchObject({
      stepName: TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
      operationOutcome: "enriched",
      agentBranch: "local-codex",
      datadogQueryTerms: ["service:api", "route:/api/session/history"],
    });

    expect(hoisted.enrichTicketDescription).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: "CV-951",
        ticketNumber: "CV-951",
      }),
    );

    const [savedExecution] = await stepExecutionRepo.loadByTicketId("CV-951");
    expect(savedExecution.stepName).toBe(TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME);
    expect(savedExecution.status).toBe("succeeded");
  });
});
