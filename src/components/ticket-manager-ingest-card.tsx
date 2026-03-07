import { Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";

type TicketManagerIngestCardProps = {
  ticketNumber: string;
  hasTicketNumber: boolean;
  hasCvPrefix: boolean;
  isTicketNumberValid: boolean;
  loading: boolean;
  onTicketNumberChange: (value: string) => void;
  onIngest: () => void | Promise<void>;
};

export const TicketManagerIngestCard = ({
  ticketNumber,
  hasTicketNumber,
  hasCvPrefix,
  isTicketNumberValid,
  loading,
  onTicketNumberChange,
  onIngest,
}: TicketManagerIngestCardProps) => {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Ingest Tickets</Typography>
          <Typography variant="body2" color="text.secondary">
            Enter a Jira ticket number to ingest or upsert it.
          </Typography>
          <TextField
            label="Ticket Number"
            value={ticketNumber}
            onChange={(event) => onTicketNumberChange(event.target.value.toUpperCase())}
            placeholder="CV-1234"
            error={!hasCvPrefix && hasTicketNumber}
            helperText={
              !hasTicketNumber
                ? "Ticket number is required"
                : !hasCvPrefix
                  ? "Ticket number must start with CV-"
                  : ""
            }
          />
          <Button variant="contained" onClick={() => void onIngest()} disabled={loading || !isTicketNumberValid}>
            Ingest Ticket
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};
