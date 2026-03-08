import { describe, expect, it, vi } from "vitest";
import { TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

const hoisted = vi.hoisted(() => ({
  completeTicketDescriptionEnrichmentStep: vi.fn(),
  handleAiWebhookBadRequest: vi.fn(),
}));

vi.mock(
  "@/modules/step-executions/ticket_description_enrichment/application/complete-ticket-description-enrichment-step",
  () => ({
    completeTicketDescriptionEnrichmentStep:
      hoisted.completeTicketDescriptionEnrichmentStep,
  }),
);

vi.mock(
  "@/modules/step-executions/application/handle-ai-webhook-bad-request",
  () => ({
    handleAiWebhookBadRequest: hoisted.handleAiWebhookBadRequest,
  }),
);

import { PUT } from "@/app/api/webhooks/ticket-description-enrichment-step-output/route";

describe("ticket description enrichment webhook route", () => {
  it("invokes bad-request handler when zod validation fails", async () => {
    process.env.BOBODDY_API_KEY = "test-api-key";
    hoisted.completeTicketDescriptionEnrichmentStep.mockReset();
    hoisted.handleAiWebhookBadRequest.mockReset();
    hoisted.handleAiWebhookBadRequest.mockResolvedValue(undefined);

    const request = new Request(
      "http://localhost/api/webhooks/ticket-description-enrichment-step-output?agentStatus=complete&agentBranch=ephemeral-ADM01",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-api-key": "test-api-key",
        },
        body: JSON.stringify({
          ticketId: "CV-100",
          pipelineId: "018f47ac-7f5a-7cc1-b54a-6f91d5b8e017",
        }),
      },
    );

    const response = await PUT(request);

    expect(response.status).toBe(400);
    expect(
      hoisted.completeTicketDescriptionEnrichmentStep,
    ).not.toHaveBeenCalled();
    expect(hoisted.handleAiWebhookBadRequest).toHaveBeenCalledTimes(1);
    expect(hoisted.handleAiWebhookBadRequest).toHaveBeenCalledWith(
      TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
      expect.objectContaining({
        ticketId: "CV-100",
        pipelineId: "018f47ac-7f5a-7cc1-b54a-6f91d5b8e017",
        agentStatus: "complete",
        agentBranch: "ephemeral-ADM01",
      }),
    );
  });
});
