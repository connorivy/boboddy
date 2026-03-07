import { EnvironmentAggregate } from "../domain/environment-aggregate";

export type EnvironmentRepo = {
  save(environment: EnvironmentAggregate): Promise<EnvironmentAggregate>;
  loadMany(maxFailures: number): Promise<EnvironmentAggregate[]>;
  pickMostRecentlyUpdatedHealthyEnvironment(): Promise<EnvironmentAggregate>;
  loadById(environmentId: string): Promise<EnvironmentAggregate | null>;
  loadByTicketIdKeyOrMostRecentlyUpdatedHealthy(
    ticketId: string,
  ): Promise<EnvironmentAggregate>;
};
