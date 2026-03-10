import { Suspense } from "react";
import { Container, LinearProgress, Stack, Typography } from "@mui/material";
import { TicketManagerServer } from "@/components/ticket-manager-server";

export default function Home() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Business Oriented Bug Optimization & Diagnostic Deployment sYstem
        </Typography>
        <Typography color="text.secondary">
          Search and filter your backlog, then keep triage visible with ticket-level workflow details.
        </Typography>
      </Stack>
      <Suspense fallback={<LinearProgress />}>
        <TicketManagerServer />
      </Suspense>
    </Container>
  );
}
