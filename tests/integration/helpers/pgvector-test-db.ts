import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { closeDb, getDb, resetDbForTests } from "@/lib/db";

const PGVECTOR_IMAGE =
  process.env.TEST_PGVECTOR_IMAGE ?? "pgvector/pgvector:pg17";

let container: StartedPostgreSqlContainer | null = null;

const applyDrizzleMigrations = async (connectionUri: string) => {
  const sqlClient = postgres(connectionUri, { max: 1 });
  const migrationsDir = path.resolve(process.cwd(), "drizzle");
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    const migrationSql = await readFile(migrationPath, "utf8");
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sqlClient.unsafe(statement);
    }
  }

  await sqlClient.end({ timeout: 5 });
};

export const startPgvectorTestDb = async () => {
  if (container) {
    return;
  }

  container = await new PostgreSqlContainer(PGVECTOR_IMAGE)
    .withDatabase("boboddy")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();
  await resetDbForTests();
  await applyDrizzleMigrations(process.env.DATABASE_URL);
};

export const stopPgvectorTestDb = async () => {
  await closeDb();

  if (container) {
    await container.stop();
    container = null;
  }
};

export const truncateTestTables = async () => {
  const db = getDb();

  await db.execute(sql`
    TRUNCATE TABLE
      failing_test_repro_attempts,
      ticket_description_quality_assessments,
      ticket_duplicate_candidates,
      ticket_github_issues,
      ticket_git_environments,
      ticket_embeddings,
      ticket_step_executions_tph,
      ticket_step_executions,
      tickets,
      environments
    RESTART IDENTITY CASCADE
  `);
};
