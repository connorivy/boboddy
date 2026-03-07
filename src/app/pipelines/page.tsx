import { Suspense } from "react";
import { Container, LinearProgress, Stack, Typography } from "@mui/material";
import { PipelinesViewServer } from "@/components/pipelines-view-server";

export default function PipelinesPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Pipelines
        </Typography>
        <Typography color="text.secondary">
          Review all pipeline step actions across tickets, newest to oldest.
        </Typography>
      </Stack>
      <Suspense fallback={<LinearProgress />}>
        <PipelinesViewServer />
      </Suspense>
    </Container>
  );
}
