import { tool } from '@opencode-ai/plugin';
import { fetchUserCredentials } from './tch-fetch-user-credentials-by-emails';
import { withProdReadonlyDb } from './tch-prod-readonly-db';

async function fetchCompanyAdminEmails(
  companyId: string,
  limit: number,
  verbose?: boolean,
): Promise<{ id: string; email: string }[]> {
  return await withProdReadonlyDb(verbose, async (db) => {
    const result = await db.query<{ id: string; email: string | null }>(
      `
      select p.id, p.email
      from benefits.company as c
      join people.company_admin as ca on c.id = ca.company_id
      join people.person as p on ca.person_id = p.id
      where c.id = $1
      order by ca.created_at desc
      limit $2
      `,
      [companyId, limit],
    );

    return result.rows
      .map((row) => ({
        id: row.id,
        email: row.email ?? '',
      }))
      .filter((row) => row.email);
  });
}

export default tool({
  description: 'Fetch real company admin emails from prod and create login credentials for them',
  args: {
    companyId: tool.schema.uuid().describe('Company ID to fetch admins for'),
    limit: tool.schema
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of admins to fetch. Defaults to 10'),
    verbose: tool.schema
      .boolean()
      .optional()
      .describe('Enable verbose AWS tunnel and impersonation logging'),
  },
  async execute(args) {
    const limit = args.limit ?? 10;
    const admins = await fetchCompanyAdminEmails(args.companyId, limit, args.verbose);

    if (!admins.length) {
      return JSON.stringify(
        {
          companyId: args.companyId,
          admins: [],
          credentials: [],
        },
        null,
        2,
      );
    }

    const credentialArgs: { users: string[]; verbose?: boolean } = {
      users: admins.map((admin) => admin.email),
    };

    if (args.verbose !== undefined) {
      credentialArgs.verbose = args.verbose;
    }

    const credentialResult = await fetchUserCredentials(credentialArgs);

    return JSON.stringify(
      {
        companyId: args.companyId,
        admins,
        impersonation: JSON.parse(credentialResult) as unknown,
      },
      null,
      2,
    );
  },
});
