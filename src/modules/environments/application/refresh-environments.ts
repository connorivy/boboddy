import { DrizzleEnvironmentRepo } from "../infra/drizzle-environment-repo";

export async function refreshEnvironments({
  drizzleEnvironmentRepo,
}: {
  drizzleEnvironmentRepo: DrizzleEnvironmentRepo;
}) {
  const environments = await drizzleEnvironmentRepo.loadMany(10);
  for (const environment of environments) {
    await environment.checkHealth();
    await drizzleEnvironmentRepo.save(environment);
  }
}
