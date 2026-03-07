"use client";

import {
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { useMemo } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import type { DashboardSummaryResponse } from "@/modules/dashboard/contracts/dashboard-contracts";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Legend, Tooltip);

type DashboardViewProps = {
  summary: DashboardSummaryResponse;
};

export const DashboardView = ({ summary }: DashboardViewProps) => {

  const statusData = useMemo(
    () => ({
      labels: summary?.byStatus.map((item) => item.status) ?? [],
      datasets: [
        {
          label: "Tickets",
          data: summary?.byStatus.map((item) => item.count) ?? [],
          backgroundColor: ["#0050B3", "#00897B", "#F57C00", "#2E7D32", "#455A64", "#9E9E9E"],
        },
      ],
    }),
    [summary],
  );

  const priorityData = useMemo(
    () => ({
      labels: summary?.byPriority.map((item) => item.priority) ?? [],
      datasets: [
        {
          label: "Tickets",
          data: summary?.byPriority.map((item) => item.count) ?? [],
          backgroundColor: "#0050B3",
        },
      ],
    }),
    [summary],
  );

  return (
    <Stack spacing={3}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Total Tickets
              </Typography>
              <Typography variant="h4">{summary.totals.totalTickets}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Overdue
              </Typography>
              <Typography variant="h4">{summary.totals.overdueTickets}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Due In 7 Days
              </Typography>
              <Typography variant="h4">{summary.totals.dueNext7Days}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Status Mix
              </Typography>
              <Doughnut data={statusData} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Priority Distribution
              </Typography>
              <Bar data={priorityData} options={{ plugins: { legend: { display: false } } }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
};
