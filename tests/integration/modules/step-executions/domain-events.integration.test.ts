import { beforeEach, describe, expect, it } from "vitest";
import { AppContext } from "@/lib/di";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import type { TicketIngestInput } from "@/modules/tickets/contracts/ticket-contracts";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { TicketDescriptionEnrichmentStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import {
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { completeTicketDescriptionEnrichmentStep } from "@/modules/step-executions/ticket_description_enrichment/application/complete-ticket-description-enrichment-step";
import { truncateTestTables } from "../../helpers/pgvector-test-db";

const makeTicketAggregate = (
  overrides: Partial<TicketIngestInput> = {},
): TicketAggregate =>
  TicketAggregate.create({
    ticketNumber: "CV-970",
    title: "Refresh failures for enterprise users",
    slackThread: null,
    status: "needs_triage",
    description: "Users intermittently hit 401s during session refresh.",
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

describe("step execution domain events (integration)", () => {
  const ticketRepo = new DrizzleTicketRepo();

  beforeEach(async () => {
    await truncateTestTables();
  });

  it("queues the next pipeline step when a pipeline step succeeds", async () => {
    await ticketRepo.saveMany([makeTicketAggregate()]);
    await AppContext.pipelineRunRepo.save(
      new PipelineRunEntity("pipeline-970", "CV-970"),
    );

    const runningExecution = await AppContext.stepExecutionRepo.save(
      new TicketDescriptionEnrichmentStepExecutionEntity(
        "pipeline-970",
        "CV-970",
        "running",
        null,
        new Date("2026-03-01T12:00:00.000Z").toISOString(),
      ),
    );

    await completeTicketDescriptionEnrichmentStep(
      {
        stepExecutionId: runningExecution.id,
        operationOutcome: "findings_recorded",
        summaryOfInvestigation: "Investigated 401s on refresh endpoint.",
        investigationReport: "Evidence points to invalidated sessions.",
        whatHappened: "The refresh endpoint rejected stale session tokens.",
        confidenceLevel: 0.84,
        datadogQueryTerms: ["service:api", "route:/api/auth/refresh"],
        datadogTimeRange: "last_60m",
        keyIdentifiers: ["request_id:req-970"],
        exactEventTimes: ["2026-03-01T12:03:12.000Z"],
        codeUnitsInvolved: [],
        databaseFindings: [],
        logFindings: [],
        datadogSessionFindings: [],
        investigationGaps: [],
        recommendedNextQueries: [],
        rawResultJson: {},
        agentStatus: "complete",
        agentBranch: "ephemeral-CV970",
      },
      { stepExecutionRepo: AppContext.stepExecutionRepo },
    );

    const pipelineSteps = await AppContext.stepExecutionRepo.loadByPipelineId(
      "pipeline-970",
    );

    expect(pipelineSteps).toHaveLength(2);
    expect(pipelineSteps.map((step) => step.stepName)).toEqual([
      TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
      TICKET_INVESTIGATION_STEP_NAME,
    ]);
    expect(pipelineSteps[0]?.status).toBe("queued");
    expect(pipelineSteps[1]?.status).toBe("succeeded");
  });
});
