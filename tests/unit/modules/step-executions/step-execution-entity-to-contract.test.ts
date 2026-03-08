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
        7,
      ),
    );

    expect(contract.pipelineRunId).toBe(7);
  });

  it("throws when pipelineRunId is missing", () => {
    expect(() =>
      stepExecutionEntityToContract(
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
          undefined as never,
        ),
      ),
    ).toThrow();
  });
});
