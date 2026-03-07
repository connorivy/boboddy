import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ticketGitEnvironments } from "@/lib/db/schema";
import { TicketGitEnvironmentAggregate } from "@/modules/environments/domain/ticket-git-environment-aggregate";
import type { TicketGitEnvironmentRepo } from "@/modules/environments/application/ticket-git-environment-repo";
import type { DbExecutor } from "@/lib/db/db-executor";

const rowToAggregate = (
  row: typeof ticketGitEnvironments.$inferSelect,
): TicketGitEnvironmentAggregate =>
  new TicketGitEnvironmentAggregate(
    row.ticketId,
    row.baseEnvironmentId,
    row.devBranch,
    row.id,
  );

export class DrizzleTicketGitEnvironmentRepo implements TicketGitEnvironmentRepo {
  async save(
    ticketGitEnvironment: TicketGitEnvironmentAggregate,
    dbExecutor?: DbExecutor,
  ): Promise<TicketGitEnvironmentAggregate> {
    if (ticketGitEnvironment.id) {
      throw new Error("Updating existing environments is not supported");
    }

    const db = dbExecutor ?? getDb();

    const [saved] = await db
      .insert(ticketGitEnvironments)
      .values({
        ticketId: ticketGitEnvironment.ticketId,
        baseEnvironmentId: ticketGitEnvironment.baseEnvironmentId,
        devBranch: ticketGitEnvironment.devBranch,
      })
      .returning();

    return rowToAggregate(saved);
  }

  async loadById(id: number): Promise<TicketGitEnvironmentAggregate | null> {
    const db = getDb();

    const [row] = await db
      .select()
      .from(ticketGitEnvironments)
      .where(eq(ticketGitEnvironments.id, id))
      .limit(1);

    return row ? rowToAggregate(row) : null;
  }

  async loadByTicketId(
    ticketId: string,
  ): Promise<TicketGitEnvironmentAggregate | null> {
    const db = getDb();

    const [row] = await db
      .select()
      .from(ticketGitEnvironments)
      .where(eq(ticketGitEnvironments.ticketId, ticketId))
      .limit(1);

    return row ? rowToAggregate(row) : null;
  }

  async loadManyByTicketId(
    ticketId: string,
  ): Promise<TicketGitEnvironmentAggregate[]> {
    const db = getDb();

    const rows = await db
      .select()
      .from(ticketGitEnvironments)
      .where(eq(ticketGitEnvironments.ticketId, ticketId))
      .orderBy(desc(ticketGitEnvironments.id));

    return rows.map(rowToAggregate);
  }
}

export const ticketGitEnvironmentRepo = new DrizzleTicketGitEnvironmentRepo();
