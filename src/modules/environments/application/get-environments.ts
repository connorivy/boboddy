"use server";

import { AppContext } from "@/lib/di";
import type { EnvironmentResponse } from "@/modules/environments/contracts/environment-contracts";
import type { EnvironmentRepo } from "./environment-repo";
import { environmentAggregateToContract } from "./environment-aggregate-to-contract";

export async function getEnvironments(
  maxFailures = 5,
  { environmentRepo }: { environmentRepo: EnvironmentRepo } = AppContext,
): Promise<EnvironmentResponse[]> {
  const environments = await environmentRepo.loadMany(maxFailures);
  return environments.map(environmentAggregateToContract);
}
