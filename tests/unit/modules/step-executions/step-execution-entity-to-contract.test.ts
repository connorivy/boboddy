import { describe, expect, it } from "vitest";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";

describe("stepExecutionEntityToContract", () => {
  it("includes pipelineRunId when mapping a step execution", () => {
    const contract = stepExecutionEntityToContract(
      new TicketPipelineStepExecutionEntity(
        "ticket-123",
        "custom-step",
        "queued",
        "idempotency-key",
        "2026-03-08T00:00:00.000Z",
        undefined,
        42,
        "2026-03-08T00:00:00.000Z",
        "2026-03-08T00:00:00.000Z",
        "run-123",
      ),
    );

    expect(contract.pipelineRunId).toBe("run-123");
  });

  it("maps an absent pipelineRunId to null", () => {
    const contract = stepExecutionEntityToContract(
      new TicketPipelineStepExecutionEntity(
        "ticket-123",
        "custom-step",
        "queued",
        "idempotency-key",
        "2026-03-08T00:00:00.000Z",
        undefined,
        42,
        "2026-03-08T00:00:00.000Z",
        "2026-03-08T00:00:00.000Z",
      ),
    );

    expect(contract.pipelineRunId).toBeNull();
  });
});
