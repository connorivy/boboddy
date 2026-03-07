import { z } from "zod";
import {
  ticketPrioritySchema,
  ticketStatusSchema,
} from "@/modules/tickets/contracts/ticket-contracts";

export const dashboardSummaryResponseSchema = z.object({
  totals: z.object({
    totalTickets: z.number().int().nonnegative(),
    overdueTickets: z.number().int().nonnegative(),
    dueNext7Days: z.number().int().nonnegative(),
  }),
  byStatus: z.array(
    z.object({
      status: ticketStatusSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  byPriority: z.array(
    z.object({
      priority: ticketPrioritySchema,
      count: z.number().int().nonnegative(),
    }),
  ),
});

export type DashboardSummaryResponse = z.infer<
  typeof dashboardSummaryResponseSchema
>;
