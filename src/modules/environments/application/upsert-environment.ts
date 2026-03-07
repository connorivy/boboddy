import { AppContext } from "@/lib/di";
import {
  EnvironmentAggregate,
  EnvironmentArea,
} from "../domain/environment-aggregate";
import { parseEnvironmentId } from "../contracts/environment-contracts";
import { EnvironmentRepo } from "./environment-repo";

export async function upsertEnvironment2(
  environmentId: string,
  area: EnvironmentArea,
  number: number,
  region: string,
  { environmentRepo } = AppContext,
) {
  const environment = new EnvironmentAggregate(
    environmentId,
    area,
    number,
    region,
  );
  await environmentRepo.save(environment);
}

export async function upsertEnvironment(
  environmentId: string,
  region: string,
  { environmentRepo }: { environmentRepo: EnvironmentRepo } = AppContext,
) {
  const { normalizedEnvironmentId, area, number } =
    parseEnvironmentId(environmentId);

  const environment = new EnvironmentAggregate(
    normalizedEnvironmentId,
    area,
    number,
    region,
  );
  await environmentRepo.save(environment);
}
