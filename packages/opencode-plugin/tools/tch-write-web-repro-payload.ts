import { tool } from '@opencode-ai/plugin';
import { completeWebReproStepRequestBodySchema } from '#boboddy/step-executions/web_repro/contracts/complete-web-repro-step-contracts';
import { writeJsonPayload } from './_shared/write-json-payload';

const WEB_REPRO_PAYLOAD_PATH = 'tmp/web-repro-webhook-payload.json';

export default tool({
  description: 'Write the validated web repro payload JSON file',
  args: Object.assign(
    {},
    ...completeWebReproStepRequestBodySchema.options.map((schema) => schema.shape),
  ) as never,
  async execute(args) {
    const payload = completeWebReproStepRequestBodySchema.parse(args);
    return await writeJsonPayload(WEB_REPRO_PAYLOAD_PATH, payload);
  },
});
