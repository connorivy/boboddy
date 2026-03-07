import { Alert, Card, CardContent, Chip, Dialog, DialogContent, DialogTitle, LinearProgress, Stack, Typography } from "@mui/material";
import { useCallback, useState } from "react";
import { sortStepExecutionsNewestFirst } from "@/modules/step-executions/application/sort-step-executions";
import type { TicketDetailResponse } from "@/modules/tickets/contracts/ticket-contracts";
import {
  type AiTimelineStepDefinition,
  TicketManagerAiTimelineCard,
} from "@/components/ticket-manager-ai-timeline-card";
import { TicketManagerStepRunHistoryCard } from "@/components/ticket-manager-step-run-history-card";
import { TicketManagerEnvironmentCard } from "@/components/ticket-manager-environment-card";
import type {
  EnvironmentResponse,
  TicketGitEnvironmentResponse,
} from "@/modules/environments/contracts/environment-contracts";

type TicketManagerDetailDialogProps = {
  open: boolean;
  ticketDetail: TicketDetailResponse | null;
  ticketGitEnvironments: TicketGitEnvironmentResponse[];
  environments: EnvironmentResponse[];
  detailLoading: boolean;
  detailError: string | null;
  operationMessage: string | null;
  actionLoading: boolean;
  stepDefinitions: AiTimelineStepDefinition[];
  onClose: () => void;
  onTriggerStep: (stepDefinition: AiTimelineStepDefinition) => void | Promise<void>;
  onAssignDefaultEnvironment: (ticketGitEnvironmentId: number) => Promise<void>;
  onCreateTicketGitEnvironment: (
    baseEnvironmentId: string,
    devBranch: string | undefined,
  ) => Promise<void>;
  onMergeFailingTest: (stepId: number) => Promise<void>;
};

export const TicketManagerDetailDialog = ({
  open,
  ticketDetail,
  ticketGitEnvironments,
  environments,
  detailLoading,
  detailError,
  operationMessage,
  actionLoading,
  stepDefinitions,
  onClose,
  onTriggerStep,
  onAssignDefaultEnvironment,
  onCreateTicketGitEnvironment,
  onMergeFailingTest,
}: TicketManagerDetailDialogProps) => {
  const sortedStepRuns = sortStepExecutionsNewestFirst(ticketDetail?.pipeline.stepExecutions ?? []);
  const selectedTicketId = ticketDetail?.ticket.id;
  const [selectedTimelineBranchByTicket, setSelectedTimelineBranchByTicket] = useState<{
    ticketId: string;
    devBranch: string | undefined;
  } | null>(null);
  const defaultTicketGitEnvironmentDevBranch = ticketDetail?.ticket.defaultGitEnvironment?.devBranch;
  const visibleTimelineDevBranch = selectedTimelineBranchByTicket?.ticketId === selectedTicketId
    ? selectedTimelineBranchByTicket?.devBranch
    : defaultTicketGitEnvironmentDevBranch;
  const handleSelectedDevBranchChange = useCallback((devBranch: string | undefined) => {
    if (!selectedTicketId) {
      return;
    }

    setSelectedTimelineBranchByTicket((currentSelection) => {
      if (
        currentSelection?.ticketId === selectedTicketId
        && currentSelection.devBranch === devBranch
      ) {
        return currentSelection;
      }

      return {
        ticketId: selectedTicketId,
        devBranch,
      };
    });
  }, [selectedTicketId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {ticketDetail ? `${ticketDetail.ticket.ticketNumber} · ${ticketDetail.ticket.title}` : "Ticket Details"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ py: 1 }}>
          {detailLoading ? <LinearProgress /> : null}
          {detailError ? <Alert severity="error">{detailError}</Alert> : null}
          {operationMessage ? <Alert severity="success">{operationMessage}</Alert> : null}

          {ticketDetail ? (
            <>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap flexWrap="wrap">
                <Chip label={`Status: ${ticketDetail.ticket.status}`} />
                <Chip label={`Priority: ${ticketDetail.ticket.priority}`} />
                <Chip label={`Assignee: ${ticketDetail.ticket.assignee ?? "-"}`} />
                <Chip label={`Reporter: ${ticketDetail.ticket.reporter}`} />
              </Stack>

              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="subtitle1">Ticket Context</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {ticketDetail.ticket.description}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>

              <TicketManagerEnvironmentCard
                key={`ticket-env-${ticketDetail.ticket.id}-${ticketDetail.ticket.defaultGitEnvironmentId ?? "none"}-${ticketGitEnvironments.map((environment) => environment.id).join("-")}`}
                ticketGitEnvironments={ticketGitEnvironments}
                environments={environments}
                defaultGitEnvironmentId={ticketDetail.ticket.defaultGitEnvironmentId}
                detailLoading={detailLoading}
                actionLoading={actionLoading}
                onSelectedDevBranchChange={handleSelectedDevBranchChange}
                onAssignDefaultEnvironment={onAssignDefaultEnvironment}
                onCreateTicketGitEnvironment={onCreateTicketGitEnvironment}
              />

              <TicketManagerAiTimelineCard
                stepExecutions={ticketDetail.pipeline.stepExecutions}
                defaultTicketGitEnvironmentDevBranch={visibleTimelineDevBranch}
                stepDefinitions={stepDefinitions}
                actionLoading={actionLoading}
                detailLoading={detailLoading}
                onTriggerStep={onTriggerStep}
                onMergeFailingTest={onMergeFailingTest}
              />

              <TicketManagerStepRunHistoryCard sortedStepRuns={sortedStepRuns} />
            </>
          ) : null}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
