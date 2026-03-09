import { beforeEach, describe, expect, it } from "vitest";
import { queueTicketDescriptionQualityStep } from "@/modules/step-executions/ticket_description_quality_rank/application/queue-ticket-description-quality-step";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import type { TicketIngestInput } from "@/modules/tickets/contracts/ticket-contracts";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { TICKET_DESCRIPTION_QUALITY_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import { truncateTestTables } from "../../helpers/pgvector-test-db";

const makeTicketAggregate = (
  overrides: Partial<TicketIngestInput> = {},
): TicketAggregate =>
  TicketAggregate.create({
    ticketNumber: "CV-388",
    title: "Description quality ticket",
    slackThread: null,
    status: "needs_triage",
    description: "Missing expected behavior details in support report.",
    companyNames: ["Acme Co"],
    employeeEmails: ["reporter@acme.test"],
    priority: "medium",
    ticketType: "bug",
    dueDate: null,
    reporter: "reporter@acme.test",
    assignee: "owner@acme.test",
    jiraCreatedAt: "2026-03-10T10:00:00.000Z",
    jiraUpdatedAt: "2026-03-10T10:05:00.000Z",
    ...overrides,
  });

describe("queueTicketDescriptionQualityStep (integration)", () => {
  const ticketRepo = new DrizzleTicketRepo();
  const stepExecutionRepo = new DrizzleStepExecutionRepo();

  beforeEach(async () => {
    await truncateTestTables();
  });

  it("creates a queued step without synthesizing a pipeline run", async () => {
    await ticketRepo.saveMany([makeTicketAggregate()]);

    const result = await queueTicketDescriptionQualityStep(
      { ticketId: "CV-388" },
      {
        ticketRepo,
        stepExecutionRepo,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data.stepExecution.stepName).toBe(
      TICKET_DESCRIPTION_QUALITY_STEP_NAME,
    );
    expect(result.data.stepExecution.status).toBe("queued");
    expect(result.data.stepExecution.pipelineId).toBeNull();

    const savedExecution = await stepExecutionRepo.load(
      result.data.stepExecution.id,
    );
    expect(savedExecution?.pipelineId).toBeNull();
    expect(savedExecution?.stepName).toBe(TICKET_DESCRIPTION_QUALITY_STEP_NAME);
    expect(savedExecution?.status).toBe("queued");
  });
});
