import { startPgvectorTestDb, stopPgvectorTestDb } from "./integration/helpers/pgvector-test-db";

export default async function globalSetup() {
  await startPgvectorTestDb();

  return async () => {
    await stopPgvectorTestDb();
  };
}
