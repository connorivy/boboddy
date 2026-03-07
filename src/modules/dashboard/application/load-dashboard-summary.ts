import {
  type DashboardSummaryResponse,
  dashboardSummaryResponseSchema,
} from "@/modules/dashboard/contracts/dashboard-contracts";
import { getDashboardSummary } from "@/modules/dashboard/infra/drizzle-dashboard-repo";

export const loadDashboardSummary =
  async (): Promise<DashboardSummaryResponse> => {
    const summary = await getDashboardSummary();
    return dashboardSummaryResponseSchema.parse(summary);
  };
