import { tool } from '@opencode-ai/plugin';
import { completeTicketFailingTestFixStepRequestBodySchema } from '#boboddy/step-executions/github_fix_failing_test/contracts/complete-ticket-failing-test-fix-step-contracts';
import { writeJsonPayload } from './_shared/write-json-payload';

const FAILING_TEST_FIX_PAYLOAD_PATH = 'tmp/copilot-fix-webhook-payload.json';

export default tool({
  description: 'Write the validated failing test fix payload JSON file',
  args: completeTicketFailingTestFixStepRequestBodySchema.shape as never,
  async execute(args) {
    const payload = completeTicketFailingTestFixStepRequestBodySchema.parse(args);
    return await writeJsonPayload(FAILING_TEST_FIX_PAYLOAD_PATH, payload);
  },
});
