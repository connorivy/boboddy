import { tool } from '@opencode-ai/plugin';
import { fetchUserCredentials } from './tch-fetch-user-credentials-by-emails';

export default tool({
  description:
    'Create login credentials for an operator in the current ephemeral environment',
  args: {},
  async execute() {
    return await fetchUserCredentials({
      users: ['nalini@takecommandhealth.com'],
      verbose: true,
    });
  },
});
