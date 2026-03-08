import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let sqlClient: postgres.Sql | undefined;
let dbClient: ReturnType<typeof drizzle<typeof schema>> | undefined;

export const getDb = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!sqlClient) {
    sqlClient = postgres(process.env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  if (!dbClient) {
    dbClient = drizzle(sqlClient, { schema });
  }

  return dbClient;
};

export const closeDb = async () => {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = undefined;
    dbClient = undefined;
  }
};

export const resetDbForTests = async () => {
  await closeDb();
};
