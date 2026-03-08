import { describe, expect, it } from "vitest";
import {
  PIPELINE_RUN_STATUSES,
  PipelineRunAggregate,
} from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";

describe("PipelineRunAggregate", () => {
  it("creates a new aggregate with the required fields", () => {
    const aggregate = PipelineRunAggregate.create({
      ticketId: "ticket-123",
      pipelineName: "description-enrichment",
      status: "queued",
      failureReason: "waiting on capacity",
    });

    expect(aggregate.ticketId).toBe("ticket-123");
    expect(aggregate.pipelineName).toBe("description-enrichment");
    expect(aggregate.status).toBe("queued");
    expect(aggregate.failureReason).toBe("waiting on capacity");
    expect(aggregate.id).toBeUndefined();
  });

  it("rehydrates persisted aggregates", () => {
    const createdAt = new Date("2026-03-08T00:00:00.000Z");
    const updatedAt = new Date("2026-03-08T01:00:00.000Z");

    const aggregate = PipelineRunAggregate.rehydrate({
      id: 123,
      ticketId: "ticket-123",
      pipelineName: "failing-test-fix",
      status: "failed",
      failureReason: "agent error",
      createdAt,
      updatedAt,
    });

    expect(aggregate.id).toBe(123);
    expect(aggregate.status).toBe("failed");
    expect(aggregate.failureReason).toBe("agent error");
    expect(aggregate.createdAt).toBe(createdAt);
    expect(aggregate.updatedAt).toBe(updatedAt);
  });

  it("exposes the supported pipeline run statuses", () => {
    expect(PIPELINE_RUN_STATUSES).toEqual([
      "queued",
      "running",
      "succeeded",
      "failed",
      "timed_out",
      "cancelled",
      "skipped",
    ]);
  });
});
