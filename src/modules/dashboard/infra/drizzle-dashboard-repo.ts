import { sql } from "drizzle-orm";
import type { DashboardSummaryResponse } from "@/modules/dashboard/contracts/dashboard-contracts";
import { getDb } from "@/lib/db";
import { tickets } from "@/lib/db/schema";

export const getDashboardSummary =
  async (): Promise<DashboardSummaryResponse> => {
    const db = getDb();

    const [totalsResult] = await db
      .select({
        totalTickets: sql<number>`count(*)::int`,
        overdueTickets: sql<number>`count(*) filter (where ${tickets.dueDate} < CURRENT_DATE and ${tickets.status} <> 'done')::int`,
        dueNext7Days: sql<number>`count(*) filter (where ${tickets.dueDate} >= CURRENT_DATE and ${tickets.dueDate} <= CURRENT_DATE + interval '7 days' and ${tickets.status} <> 'done')::int`,
      })
      .from(tickets);

    const byStatusRows = await db
      .select({
        status: tickets.status,
        count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .groupBy(tickets.status)
      .orderBy(sql`count(*) desc`);

    const byPriorityRows = await db
      .select({
        priority: tickets.priority,
        count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .groupBy(tickets.priority)
      .orderBy(sql`count(*) desc`);

    return {
      totals: {
        totalTickets: totalsResult?.totalTickets ?? 0,
        overdueTickets: totalsResult?.overdueTickets ?? 0,
        dueNext7Days: totalsResult?.dueNext7Days ?? 0,
      },
      byStatus: byStatusRows.map((row) => ({
        status: row.status,
        count: row.count,
      })),
      byPriority: byPriorityRows.map((row) => ({
        priority: row.priority,
        count: row.count,
      })),
    };
  };
