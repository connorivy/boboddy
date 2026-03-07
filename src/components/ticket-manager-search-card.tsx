import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  stepExecutionStatusSchema,
  ticketPrioritySchema,
  ticketSortBySchema,
  ticketStatusSchema,
  ticketStepNameSchema,
  type TicketStepExecution,
} from "@/modules/tickets/contracts/ticket-contracts";
import { TICKET_DESCRIPTION_QUALITY_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import { sortStepExecutionsNewestFirst } from "@/modules/step-executions/application/sort-step-executions";
import type {
  PaginatedTicketsResponse,
  StepExecutionStatus,
  TicketPriority,
  TicketSortBy,
  TicketStatus,
  TicketStepName,
} from "@/modules/tickets/contracts/ticket-contracts";

const statusOptions = ticketStatusSchema.options;
const priorityOptions = ticketPrioritySchema.options;
const stepNameOptions = ticketStepNameSchema.options;
const stepExecutionStatusOptions = stepExecutionStatusSchema.options;
const sortByOptions = ticketSortBySchema.options;

const getDescriptionScore = (
  pipelineSteps: TicketStepExecution[] | undefined,
): number | null => {
  if (!pipelineSteps || pipelineSteps.length === 0) {
    return null;
  }

  const latestDescriptionStep = sortStepExecutionsNewestFirst(
    pipelineSteps.filter(
      (step) => step.stepName === TICKET_DESCRIPTION_QUALITY_STEP_NAME,
    ),
  )[0];

  if (!latestDescriptionStep) {
    return null;
  }

  const result = latestDescriptionStep.result;
  if (!result || result.stepName !== TICKET_DESCRIPTION_QUALITY_STEP_NAME) {
    return null;
  }

  return (
    (result.stepsToReproduceScore +
      result.expectedBehaviorScore +
      result.observedBehaviorScore) /
    3
  );
};

type TicketManagerSearchCardProps = {
  tickets: PaginatedTicketsResponse;
  q: string;
  status: TicketStatus | "";
  priority: TicketPriority | "";
  stepName: TicketStepName | "";
  stepExecutionStatus: StepExecutionStatus | "";
  sortBy: TicketSortBy;
  loading: boolean;
  error: string | null;
  totalLabel: string;
  bulkActionMessage: string | null;
  bulkActionError: string | null;
  onQChange: (value: string) => void;
  onStatusChange: (value: TicketStatus | "") => void;
  onPriorityChange: (value: TicketPriority | "") => void;
  onStepNameChange: (value: TicketStepName | "") => void;
  onStepExecutionStatusChange: (value: StepExecutionStatus | "") => void;
  onSortByChange: (value: TicketSortBy) => void;
  bulkActionStepName: TicketStepName;
  bulkActionLoading: boolean;
  onBulkActionStepNameChange: (value: TicketStepName) => void;
  onQueueBulkAction: () => void | Promise<void>;
  onSearch: () => void | Promise<void>;
  onOpenTicket: (ticketId: string) => void;
};

export const TicketManagerSearchCard = ({
  tickets,
  q,
  status,
  priority,
  stepName,
  stepExecutionStatus,
  sortBy,
  loading,
  error,
  totalLabel,
  bulkActionMessage,
  bulkActionError,
  onQChange,
  onStatusChange,
  onPriorityChange,
  onStepNameChange,
  onStepExecutionStatusChange,
  onSortByChange,
  bulkActionStepName,
  bulkActionLoading,
  onBulkActionStepNameChange,
  onQueueBulkAction,
  onSearch,
  onOpenTicket,
}: TicketManagerSearchCardProps) => {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Ticket Search</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <TextField
              label="Search"
              placeholder="Title, description, reporter"
              value={q}
              onChange={(event) => onQChange(event.target.value)}
              sx={{ minWidth: 220 }}
            />
            <TextField
              select
              label="Status"
              value={status}
              onChange={(event) => onStatusChange(event.target.value as TicketStatus | "")}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">All</MenuItem>
              {statusOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Priority"
              value={priority}
              onChange={(event) => onPriorityChange(event.target.value as TicketPriority | "")}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">All</MenuItem>
              {priorityOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Step Name"
              value={stepName}
              onChange={(event) =>
                onStepNameChange(event.target.value as TicketStepName | "")
              }
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="">All</MenuItem>
              {stepNameOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Step Status"
              value={stepExecutionStatus}
              onChange={(event) =>
                onStepExecutionStatusChange(
                  event.target.value as StepExecutionStatus | "",
                )
              }
              sx={{ minWidth: 220 }}
              disabled={!stepName}
            >
              <MenuItem value="">All</MenuItem>
              {stepExecutionStatusOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Sort"
              value={sortBy}
              onChange={(event) => onSortByChange(event.target.value as TicketSortBy)}
              sx={{ minWidth: 280 }}
            >
              {sortByOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option === "description_score_desc"
                    ? "Description Score (high to low)"
                    : "Recently Updated"}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" onClick={() => void onSearch()} disabled={loading}>
              Search
            </Button>
            <TextField
              select
              label="Bulk Action"
              value={bulkActionStepName}
              onChange={(event) =>
                onBulkActionStepNameChange(event.target.value as TicketStepName)
              }
              sx={{ minWidth: 320 }}
            >
              {stepNameOptions.map((option) => (
                <MenuItem
                  key={`bulk-step-${option}`}
                  value={option}
                  disabled={option !== TICKET_DESCRIPTION_QUALITY_STEP_NAME}
                >
                  {option}
                  {option !== TICKET_DESCRIPTION_QUALITY_STEP_NAME
                    ? " (coming soon)"
                    : ""}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              onClick={() => void onQueueBulkAction()}
              disabled={loading || bulkActionLoading || tickets.pagination.total === 0}
            >
              Queue Matching Tickets
            </Button>
          </Box>

          {loading ? <LinearProgress /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {bulkActionError ? <Alert severity="error">{bulkActionError}</Alert> : null}
          {bulkActionMessage ? <Alert severity="success">{bulkActionMessage}</Alert> : null}

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              {totalLabel}
            </Typography>
          </Stack>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ticket</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Description Score</TableCell>
                <TableCell>Issues Type</TableCell>
                <TableCell>Due Date</TableCell>
                <TableCell>Assignee</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tickets.items.map((ticket) => {
                const descriptionScore = getDescriptionScore(ticket.pipelineSteps);

                return (
                  <TableRow key={ticket.id} hover onClick={() => onOpenTicket(ticket.id)} sx={{ cursor: "pointer" }}>
                    <TableCell>{ticket.ticketNumber}</TableCell>
                    <TableCell>{ticket.title}</TableCell>
                    <TableCell>
                      <Chip size="small" label={ticket.status} />
                    </TableCell>
                    <TableCell>{ticket.priority}</TableCell>
                    <TableCell>
                      {descriptionScore === null ? "-" : `${descriptionScore.toFixed(1)}`}
                    </TableCell>
                    <TableCell>{ticket.ticketType}</TableCell>
                    <TableCell>{ticket.dueDate ?? "-"}</TableCell>
                    <TableCell>{ticket.assignee ?? "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Stack>
      </CardContent>
    </Card>
  );
};
