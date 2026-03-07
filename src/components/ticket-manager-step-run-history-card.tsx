import { Card, CardContent, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { TicketStepExecution } from "@/modules/tickets/contracts/ticket-contracts";
import { getStepStatusIcon, formatDateTime } from "@/components/ticket-manager-step-status";

type TicketManagerStepRunHistoryCardProps = {
  sortedStepRuns: TicketStepExecution[];
};

export const TicketManagerStepRunHistoryCard = ({
  sortedStepRuns,
}: TicketManagerStepRunHistoryCardProps) => {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="subtitle1">Step Run History</Typography>
          {sortedStepRuns.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No step runs yet.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell>Step</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Ended</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedStepRuns.map((step) => (
                  <TableRow key={`step-run-${step.id}`}>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {getStepStatusIcon(step.status)}
                        <Typography variant="body2">{step.status}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{step.stepName}</TableCell>
                    <TableCell>{formatDateTime(step.startedAt)}</TableCell>
                    <TableCell>{formatDateTime(step.endedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};
