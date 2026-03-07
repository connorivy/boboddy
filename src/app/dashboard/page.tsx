import { Suspense } from "react";
import { Container, LinearProgress, Stack, Typography } from "@mui/material";
import { DashboardViewServer } from "@/components/dashboard-view-server";

export default function DashboardPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Ticket Dashboard
        </Typography>
        <Typography color="text.secondary">
          Track backlog health by status, priority, and due-date risk.
        </Typography>
      </Stack>
      <Suspense fallback={<LinearProgress />}>
        <DashboardViewServer />
      </Suspense>
    </Container>
  );
}
