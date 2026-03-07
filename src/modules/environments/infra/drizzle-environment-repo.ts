import { asc, desc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { environments } from "@/lib/db/schema";
import { EnvironmentAggregate } from "@/modules/environments/domain/environment-aggregate";
import { parseEnvironmentId } from "@/modules/environments/contracts/environment-contracts";
import { EnvironmentRepo } from "../application/environment-repo";

type LoadEnvironmentByIdInput = {
  environmentId: string;
};

type LoadTrackedEnvironmentsInput = {
  tracked: true;
  maxConsecutiveFailures?: number;
};

const rowToAggregate = (
  row: typeof environments.$inferSelect,
): EnvironmentAggregate =>
  new EnvironmentAggregate(
    row.environmentKey,
    row.area,
    row.number,
    row.region,
    row.consecutiveFailures,
    row.updatedAt,
  );

export class DrizzleEnvironmentRepo implements EnvironmentRepo {
  async save(environment: EnvironmentAggregate): Promise<EnvironmentAggregate> {
    const db = getDb();
    const parsed = parseEnvironmentId(environment.environmentId);

    if (parsed.area !== environment.area) {
      throw new Error(
        `Environment area (${environment.area}) does not match environment id (${environment.environmentId})`,
      );
    }

    if (parsed.number !== environment.number) {
      throw new Error(
        `Environment number (${environment.number}) does not match environment id (${environment.environmentId})`,
      );
    }

    const [saved] = await db
      .insert(environments)
      .values({
        environmentKey: environment.environmentId,
        area: environment.area,
        number: environment.number,
        region: environment.region,
        consecutiveFailures: environment.numConsecutiveFailures,
        updatedAt: environment.lastChecked,
      })
      .onConflictDoUpdate({
        target: environments.environmentKey,
        set: {
          updatedAt: environment.lastChecked ?? new Date(),
        },
      })
      .returning();

    return rowToAggregate(saved);
  }

  load(input: LoadEnvironmentByIdInput): Promise<EnvironmentAggregate | null>;
  load(input: LoadTrackedEnvironmentsInput): Promise<EnvironmentAggregate[]>;
  async load(
    input: LoadEnvironmentByIdInput | LoadTrackedEnvironmentsInput,
  ): Promise<EnvironmentAggregate | EnvironmentAggregate[] | null> {
    const db = getDb();

    if ("environmentId" in input) {
      const { normalizedEnvironmentId } = parseEnvironmentId(
        input.environmentId,
      );
      const [row] = await db
        .select()
        .from(environments)
        .where(eq(environments.environmentKey, normalizedEnvironmentId))
        .limit(1);

      return row ? rowToAggregate(row) : null;
    }

    const maxConsecutiveFailures = input.maxConsecutiveFailures ?? 5;
    const rows = await db
      .select()
      .from(environments)
      .where(lte(environments.consecutiveFailures, maxConsecutiveFailures))
      .orderBy(
        asc(environments.consecutiveFailures),
        asc(environments.area),
        asc(environments.number),
      );

    return rows.map(rowToAggregate);
  }

  async loadMany(maxFailures: number): Promise<EnvironmentAggregate[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(environments)
      .where(lte(environments.consecutiveFailures, maxFailures))
      .orderBy(
        asc(environments.consecutiveFailures),
        asc(environments.updatedAt),
      );

    return rows.map(rowToAggregate);
  }

  async pickMostRecentlyUpdatedHealthyEnvironment(): Promise<EnvironmentAggregate> {
    const db = getDb();
    const [environment] = await db
      .select()
      .from(environments)
      .where(lte(environments.consecutiveFailures, 0))
      .orderBy(
        // Treat null as oldest so checked environments are preferred.
        desc(sql`coalesce(${environments.updatedAt}, to_timestamp(0))`),
        asc(environments.area),
        asc(environments.number),
      )
      .limit(1);

    if (!environment) {
      throw new Error("No healthy environments available");
    }
    return rowToAggregate(environment);
  }

  async loadByTicketIdKeyOrMostRecentlyUpdatedHealthy(
    ticketId: string,
  ): Promise<EnvironmentAggregate> {
    const db = getDb();
    const parsedId = parseEnvironmentId(ticketId);
    const [environment] = await db
      .select()
      .from(environments)
      .where(eq(environments.environmentKey, parsedId.normalizedEnvironmentId))
      .limit(1);

    if (!environment) {
      return this.pickMostRecentlyUpdatedHealthyEnvironment();
    }

    return rowToAggregate(environment);
  }

  async loadById(environmentId: string): Promise<EnvironmentAggregate | null> {
    const db = getDb();
    const { normalizedEnvironmentId } = parseEnvironmentId(environmentId);
    const [row] = await db
      .select()
      .from(environments)
      .where(eq(environments.environmentKey, normalizedEnvironmentId))
      .limit(1);

    return row ? rowToAggregate(row) : null;
  }
}

export const environmentRepo = new DrizzleEnvironmentRepo();
