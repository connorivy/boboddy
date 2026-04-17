import { tool } from '@opencode-ai/plugin';
import { withProdReadonlyDb } from './tch-prod-readonly-db';

export default tool({
  description: 'Fetch user IDs from the prod readonly database for a list of email addresses',
  args: {
    emails: tool.schema
      .array(tool.schema.email())
      .min(1)
      .describe('Email addresses to look up in the prod readonly database'),
    verbose: tool.schema.boolean().optional().describe('Enable verbose AWS tunnel logging'),
  },
  async execute(args) {
    const inputEmails: string[] = args.emails;
    if (!inputEmails.length) {
      throw new Error('No emails provided');
    }

    const results = await withProdReadonlyDb(args.verbose, async (db) => {
      const lowered = inputEmails.map((email) => email.toLowerCase());
      const result = await db.query<{ email: string; id: string }>(
        `
        select lower(p.email) as email, p.id
        from people.person as p
        where lower(p.email) = any($1)
        `,
        [lowered],
      );

      const rowMap = new Map<string, string>();
      for (const row of result.rows) {
        rowMap.set(row.email, row.id);
      }

      return inputEmails.map((email) => ({
        email,
        id: rowMap.get(email.toLowerCase()) ?? null,
      }));
    });

    return JSON.stringify(results, null, 2);
  },
});
