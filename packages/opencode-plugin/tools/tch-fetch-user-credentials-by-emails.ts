import { tool } from '@opencode-ai/plugin';
import { impersonateUsers } from '@boboddy/tch';

export async function fetchUserCredentials(args: {
  users: string[];
  verbose?: boolean;
}): Promise<string> {
  const output: string[] = [];
  const capture = (...values: unknown[]) => {
    output.push(values.map((value) => String(value)).join(' '));
  };

  const originalLog = console.log;
  const originalError = console.error;
  const logToolEvent = (...values: unknown[]) => {
    originalLog('[tch-fetch-user-credentials-by-emails]', ...values);
  };
  const logToolError = (...values: unknown[]) => {
    originalError('[tch-fetch-user-credentials-by-emails]', ...values);
  };

  logToolEvent('starting credential fetch for users:', args.users.join(', '));

  console.log = capture;
  console.error = capture;

  try {
    const users = await impersonateUsers(args.users, args.verbose ?? false);

    logToolEvent(
      'credential fetch succeeded for users:',
      users.map((user) => user.email).join(', '),
    );

    return JSON.stringify(
      {
        users,
        output,
      },
      null,
      2,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logToolError('credential fetch failed:', message);
    throw error;
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

export default tool({
  description:
    'Create login credentials for one or more users in the current ephemeral environment',
  args: {
    users: tool.schema
      .array(tool.schema.string())
      .min(1)
      .describe('Email addresses to provision in the current ephemeral environment'),
    verbose: tool.schema
      .boolean()
      .optional()
      .describe('Enable verbose impersonation logging while creating credentials'),
  },
  async execute(args) {
    const options: { users: string[]; verbose?: boolean } = {
      users: args.users,
    };

    if (args.verbose !== undefined) {
      options.verbose = args.verbose;
    }

    return await fetchUserCredentials(options);
  },
});
