import { tool } from '@opencode-ai/plugin';
import { completeTicketDescriptionEnrichmentStepRequestBodySchema } from '#boboddy/step-executions/ticket_description_enrichment/contracts/complete-ticket-description-enrichment-step-contracts';
import { writeJsonPayload } from './_shared/write-json-payload';

const TICKET_INVESTIGATION_PAYLOAD_PATH =
  'tmp/copilot-ticket-investigation-webhook-payload.json';

export default tool({
  description: 'Write the validated ticket investigation payload JSON file',
  args: completeTicketDescriptionEnrichmentStepRequestBodySchema.shape as never,
  async execute(args) {
    const payload = completeTicketDescriptionEnrichmentStepRequestBodySchema.parse(args);
    return await writeJsonPayload(TICKET_INVESTIGATION_PAYLOAD_PATH, payload);
  },
});
