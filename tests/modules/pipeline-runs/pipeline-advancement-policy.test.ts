import { describe, expect, it } from "vitest";
import { PipelineAdvancementPolicy } from "@/modules/pipeline-runs/domain/pipeline-advancement-policy";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import {
  FailingTestFixStepExecutionEntity,
  FailingTestReproNeedsUserFeedbackResultEntity,
  FailingTestReproStepExecutionEntity,
  FailingTestReproSucceededResultEntity,
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionQualityStepExecutionEntity,
  TicketDescriptionQualityStepResultEntity,
  TicketDuplicateCandidateResultItemEntity,
  TicketDuplicateCandidatesResultEntity,
  TicketDuplicateCandidatesStepResultEntity,
  type TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";

class TestablePipelineAdvancementPolicy extends PipelineAdvancementPolicy {
  public exposedShouldAdvance(
    latestStepExecution: TicketPipelineStepExecutionEntity,
    pipelineRun: PipelineRunEntity,
  ): boolean {
    return this.shouldAdvance(latestStepExecution, pipelineRun);
  }
}

const policy = new TestablePipelineAdvancementPolicy();

function buildPipelineRun(step: TicketPipelineStepExecutionEntity) {
  return new PipelineRunEntity("pipeline-1", "CV-1001", true, [step]);
}

describe("PipelineAdvancementPolicy.shouldAdvance", () => {
  it("advances past description quality when the average score meets the threshold", () => {
    const step = new TicketDescriptionQualityStepExecutionEntity(
      "pipeline-1",
      "CV-1001",
      "succeeded",
      new TicketDescriptionQualityStepResultEntity(
        0.8,
        0.45,
        0.9,
        "Enough detail to continue.",
        "{}",
      ),
      "2026-03-12T10:00:00.000Z",
      "2026-03-12T10:01:00.000Z",
    );

    expect(policy.exposedShouldAdvance(step, buildPipelineRun(step))).toBe(true);
  });

  it("blocks advancement when description quality average is below the threshold", () => {
    const step = new TicketDescriptionQualityStepExecutionEntity(
      "pipeline-1",
      "CV-1001",
      "succeeded",
      new TicketDescriptionQualityStepResultEntity(
        0.4,
        0.5,
        0.6,
        "Ticket details are still too sparse.",
        "{}",
      ),
      "2026-03-12T10:00:00.000Z",
      "2026-03-12T10:01:00.000Z",
    );

    expect(policy.exposedShouldAdvance(step, buildPipelineRun(step))).toBe(false);
  });

  it("blocks advancement when duplicate detection finds a high-confidence candidate", () => {
    const step = new TicketDuplicateCandidatesStepResultEntity(
      "pipeline-1",
      "CV-1001",
      "succeeded",
      new TicketDuplicateCandidatesResultEntity(
        [new TicketDuplicateCandidateResultItemEntity("CV-999", 0.9)],
        [],
        [],
      ),
      "2026-03-12T10:00:00.000Z",
      "2026-03-12T10:01:00.000Z",
    );

    expect(policy.exposedShouldAdvance(step, buildPipelineRun(step))).toBe(false);
  });

  it("allows advancement when duplicate detection has no high-confidence candidates", () => {
    const step = new TicketDuplicateCandidatesStepResultEntity(
      "pipeline-1",
      "CV-1001",
      "succeeded",
      new TicketDuplicateCandidatesResultEntity(
        [new TicketDuplicateCandidateResultItemEntity("CV-998", 0.62)],
        [],
        [new TicketDuplicateCandidateResultItemEntity("CV-997", 0.84)],
      ),
      "2026-03-12T10:00:00.000Z",
      "2026-03-12T10:01:00.000Z",
    );

    expect(policy.exposedShouldAdvance(step, buildPipelineRun(step))).toBe(true);
  });

  it("requires a succeeded investigation step", () => {
    const step = new TicketDescriptionEnrichmentStepExecutionEntity(
      "pipeline-1",
      "CV-1001",
      "failed",
      null,
      "2026-03-12T10:00:00.000Z",
      "2026-03-12T10:01:00.000Z",
    );

    expect(policy.exposedShouldAdvance(step, buildPipelineRun(step))).toBe(false);
  });

  it("advances past repro only when confidence meets the threshold", () => {
    const step = new FailingTestReproStepExecutionEntity(
      "pipeline-1",
      "CV-1001",
      "succeeded",
      new FailingTestReproSucceededResultEntity(
        "open",
        101,
        "ISSUE_101",
        "complete",
        "copilot/repro-cv-1001",
        "Found a stable failing test.",
        0.85,
        ["tests/repro.test.ts"],
      ),
      "main",
      "2026-03-12T10:00:00.000Z",
      "2026-03-12T10:01:00.000Z",
    );

    expect(policy.exposedShouldAdvance(step, buildPipelineRun(step))).toBe(true);
  });

  it("blocks repro advancement when there is no numeric confidence level", () => {
    const step = new FailingTestReproStepExecutionEntity(
      "pipeline-1",
      "CV-1001",
      "succeeded",
      new FailingTestReproNeedsUserFeedbackResultEntity(
        "open",
        101,
        "ISSUE_101",
        "complete",
        "copilot/repro-cv-1001",
        "Need more details from the reporter.",
        {
          requestId: "req-1",
          reason: "Need environment specifics.",
          questions: ["What browser were you using?"],
          assumptions: [],
        },
      ),
      "main",
      "2026-03-12T10:00:00.000Z",
      "2026-03-12T10:01:00.000Z",
    );

    expect(policy.exposedShouldAdvance(step, buildPipelineRun(step))).toBe(false);
  });

  it("requires the fix step to succeed", () => {
    const step = new FailingTestFixStepExecutionEntity(
      "pipeline-1",
      "CV-1001",
      "failed",
      null,
      "2026-03-12T10:00:00.000Z",
      "2026-03-12T10:01:00.000Z",
    );

    expect(policy.exposedShouldAdvance(step, buildPipelineRun(step))).toBe(false);
  });
});
