import { tool } from '@opencode-ai/plugin';
import { completeTicketFailingTestReproStepRequestBodySchema } from '#boboddy/step-executions/github_repro_failing_test/contracts/complete-ticket-failing-test-repro-step-contracts';
import { writeJsonPayload } from './_shared/write-json-payload';

const FAILING_TEST_REPRO_PAYLOAD_PATH = 'tmp/copilot-repro-webhook-payload.json';

export default tool({
  description: 'Write the validated failing test repro payload JSON file',
  args: Object.assign(
    {},
    ...completeTicketFailingTestReproStepRequestBodySchema.options.map((schema) => schema.shape),
  ) as never,
  async execute(args) {
    const payload = completeTicketFailingTestReproStepRequestBodySchema.parse(args);
    return await writeJsonPayload(FAILING_TEST_REPRO_PAYLOAD_PATH, payload);
  },
});
