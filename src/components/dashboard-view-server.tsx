import { unstable_noStore as noStore } from "next/cache";
import { DashboardView } from "@/components/dashboard-view";
import { loadDashboardSummary } from "@/modules/dashboard/application/load-dashboard-summary";

export const DashboardViewServer = async () => {
  noStore();
  const summary = await loadDashboardSummary();

  return <DashboardView summary={summary} />;
};
