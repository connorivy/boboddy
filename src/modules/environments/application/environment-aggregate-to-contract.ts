import type { EnvironmentResponse } from "@/modules/environments/contracts/environment-contracts";
import type { EnvironmentAggregate } from "@/modules/environments/domain/environment-aggregate";

export const environmentAggregateToContract = (
  environment: EnvironmentAggregate,
): EnvironmentResponse => {
  if (!environment.lastChecked) {
    throw new Error("Environment aggregate is missing lastChecked timestamp");
  }

  return {
    environmentId: environment.environmentId,
    area: environment.area,
    number: environment.number,
    region: environment.region,
    databaseHostUrl: environment.databaseHostUrl,
    numConsecutiveFailures: environment.numConsecutiveFailures,
    lastChecked: environment.lastChecked.toISOString(),
  };
};
