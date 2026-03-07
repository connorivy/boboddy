import { Container, Stack, Typography } from "@mui/material";
import { ActionsView } from "@/components/actions-view";

export default function ActionsPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Actions
        </Typography>
        <Typography color="text.secondary">
          Trigger manual workflows and inspect structured results.
        </Typography>
      </Stack>
      <ActionsView />
    </Container>
  );
}
