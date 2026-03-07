import { describe, expect, it, vi } from "vitest";
import { FAILING_TEST_REPRO_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

const hoisted = vi.hoisted(() => ({
  completeTicketFailingTestReproStep: vi.fn(),
  handleAiWebhookBadRequest: vi.fn(),
}));

vi.mock(
  "@/modules/step-executions/application/complete-ticket-failing-test-repro-step",
  () => ({
    completeTicketFailingTestReproStep: hoisted.completeTicketFailingTestReproStep,
  }),
);

vi.mock(
  "@/modules/step-executions/application/handle-ai-webhook-bad-request",
  () => ({
    handleAiWebhookBadRequest: hoisted.handleAiWebhookBadRequest,
  }),
);

import { PUT } from "@/app/api/webhooks/failing-test-repro-step-output/route";

describe("failing-test repro webhook route", () => {
  it("invokes bad-request handler when zod validation fails", async () => {
    process.env.BOBODDY_API_KEY = "test-api-key";
    hoisted.completeTicketFailingTestReproStep.mockReset();
    hoisted.handleAiWebhookBadRequest.mockReset();
    hoisted.handleAiWebhookBadRequest.mockResolvedValue(undefined);

    const request = new Request(
      "http://localhost/api/webhooks/failing-test-repro-step-output?agentStatus=complete&agentBranch=ephemeral-ADM01",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-api-key": "test-api-key",
        },
        body: JSON.stringify({
          ticketId: "CV-100",
          pipelineId: 17,
        }),
      },
    );

    const response = await PUT(request);

    expect(response.status).toBe(400);
    expect(hoisted.completeTicketFailingTestReproStep).not.toHaveBeenCalled();
    expect(hoisted.handleAiWebhookBadRequest).toHaveBeenCalledTimes(1);
    expect(hoisted.handleAiWebhookBadRequest).toHaveBeenCalledWith(
      FAILING_TEST_REPRO_STEP_NAME,
      expect.objectContaining({
        ticketId: "CV-100",
        pipelineId: 17,
        agentStatus: "complete",
        agentBranch: "ephemeral-ADM01",
      }),
    );
  });
});
