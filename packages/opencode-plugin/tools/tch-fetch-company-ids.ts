import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { tool } from '@opencode-ai/plugin';

type BoboddyState = {
  dbHost?: string;
};

function getRequiredValue(
  record: Record<string, string | undefined>,
  key: string,
): string {
  const value = record[key]?.trim();

  if (!value) {
    throw new Error(`Missing required value for ${key}`);
  }

  return value;
}

function resolveStateFilePath(directory: string, worktree: string): string {
  const candidates = [
    path.resolve(directory, 'boboddy-state.json'),
    path.resolve(worktree, 'boboddy-state.json'),
  ];

  const existing = candidates.find((candidate) => existsSync(candidate));
  return existing ?? candidates[0]!;
}

function getDatabaseHost(directory: string, worktree: string): string {
  const stateFilePath = resolveStateFilePath(directory, worktree);

  if (!existsSync(stateFilePath)) {
    throw new Error(
      `State file not found at ${stateFilePath}. Ensure boboddy-state.json exists in the repo.`,
    );
  }

  const boboddyState = JSON.parse(readFileSync(stateFilePath, 'utf8')) as BoboddyState;

  return getRequiredValue({ dbHost: boboddyState.dbHost?.trim() }, 'dbHost');
}

export default tool({
  description: 'Fetch company IDs by company name from Postgres',
  args: {
    companyName: tool.schema
      .string()
      .min(1)
      .describe('Company name or partial company name to search for'),
    limit: tool.schema
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of matching companies to return. Defaults to 10'),
  },
  async execute(args, context) {
    const db = new Client({
      host: getDatabaseHost(context.directory, context.worktree),
      port: Number.parseInt(getRequiredValue(process.env, 'POSTGRES_PORT'), 10),
      database: getRequiredValue(process.env, 'POSTGRES_DATABASE'),
      user: getRequiredValue(process.env, 'POSTGRES_USERNAME'),
      password: getRequiredValue(process.env, 'POSTGRES_PASSWORD'),
      ssl: {
        rejectUnauthorized: true,
      },
    });

    await db.connect();

    try {
      const result = await db.query<{ id: string; name: string }>(
        `
        select c.id, c.name
        from benefits.company as c
        where c.name ilike $1
        limit $2
        `,
        [`%${args.companyName}%`, args.limit ?? 10],
      );

      return JSON.stringify(
        {
          companies: result.rows.map((row) => ({
            id: row.id,
            name: row.name,
          })),
        },
        null,
        2,
      );
    } finally {
      await db.end();
    }
  },
});
