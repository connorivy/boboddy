"use client";

import { Grid } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AiTimelineStepDefinition,
} from "@/components/ticket-manager-ai-timeline-card";
import { TicketManagerDetailDialog } from "@/components/ticket-manager-detail-dialog";
import { TicketManagerSearchCard } from "@/components/ticket-manager-search-card";
import type {
  PaginatedTicketsResponse,
  TicketDetailResponse,
  TicketPriority,
  TicketSortBy,
  TicketStepName,
  TicketStatus,
  StepExecutionStatus,
} from "@/modules/tickets/contracts/ticket-contracts";
import { loadTicketDetail as loadTicketDetailAction, searchTickets } from "@/modules/tickets/application/get-tickets";
import { queueTicketDescriptionQualityStep } from "@/modules/step-executions/ticket_description_quality_rank/application/queue-ticket-description-quality-step";
import { queueTicketDescriptionEnrichmentStep } from "@/modules/step-executions/ticket_description_enrichment/application/queue-ticket-description-enrichment-step";
import { queueTicketDuplicateCandidatesStep } from "@/modules/step-executions/ticket_duplicate_candidates/application/queue-ticket-duplicate-candidates-step";
import { queueTicketFailingTestReproStep } from "@/modules/step-executions/github_repro_failing_test/application/queue-ticket-failing-test-repro-step";
import { queueTicketFailingTestFixStep } from "@/modules/step-executions/github_fix_failing_test/application/queue-ticket-failing-test-fix-step";
import { mergeFailingTest } from "@/modules/step-executions/github_fix_failing_test/application/merge-failing-test";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { assignDefaultEnvironment } from "@/modules/environments/application/assign-environment";
import { createTicketGitEnvironment } from "@/modules/environments/application/create-ticket-git-environment";
import { getEnvironments } from "@/modules/environments/application/get-environments";
import { getTicketGitEnvironments } from "@/modules/environments/application/get-ticket-git-environments";
import type {
  EnvironmentResponse,
  TicketGitEnvironmentResponse,
} from "@/modules/environments/contracts/environment-contracts";

type TicketManagerProps = {
  initialTickets: PaginatedTicketsResponse;
};

export const TicketManager = ({ initialTickets }: TicketManagerProps) => {
  const [tickets, setTickets] = useState<PaginatedTicketsResponse>(initialTickets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [ticketGitEnvironments, setTicketGitEnvironments] = useState<
    TicketGitEnvironmentResponse[]
  >([]);
  const [environments, setEnvironments] = useState<EnvironmentResponse[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [priority, setPriority] = useState<TicketPriority | "">("");
  const [stepName, setStepName] = useState<TicketStepName | "">("");
  const [stepExecutionStatus, setStepExecutionStatus] = useState<
    StepExecutionStatus | ""
  >("");
  const [sortBy, setSortBy] = useState<TicketSortBy>("updated_at_desc");
  const skipInitialFilterSearch = useRef(true);

  const totalLabel = useMemo(() => {
    const start = (tickets.pagination.page - 1) * tickets.pagination.pageSize + 1;
    const end = Math.min(start + tickets.items.length - 1, tickets.pagination.total);
    return `Showing ${start}-${Math.max(end, 0)} of ${tickets.pagination.total}`;
  }, [tickets]);

  const stepDefinitions = useMemo<AiTimelineStepDefinition[]>(
    () => [
      {
        stepName: TICKET_DESCRIPTION_QUALITY_STEP_NAME,
        trigger: async (ticketId) => {
          const result = await queueTicketDescriptionQualityStep({
            ticketId,
          });
          return {
            ok: true,
            data: { message: `execution ${result.data.stepExecution.id}` },
          };
        },
      },
      {
        stepName: TICKET_INVESTIGATION_STEP_NAME,
        trigger: async (ticketId) => {
          const result = await queueTicketDescriptionEnrichmentStep({
            ticketId,
          });
          return {
            ok: true,
            data: { message: `execution ${result.data.stepExecution.id}` },
          };
        },
      },
      {
        stepName: TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
        trigger: async (ticketId) => {
          const result = await queueTicketDuplicateCandidatesStep({
            ticketId,
          });
          return {
            ok: true,
            data: { message: `execution ${result.data.stepExecution.id}` },
          };
        },
      },
      {
        stepName: FAILING_TEST_REPRO_STEP_NAME,
        trigger: async (ticketId) => {
          const result = await queueTicketFailingTestReproStep({
            ticketId,
          });
          return {
            ok: true,
            data: { message: `execution ${result.data.stepExecution.id}` },
          };
        },
      },
      {
        stepName: FAILING_TEST_FIX_STEP_NAME,
        trigger: async (ticketId) => {
          const ticketGitEnvironmentId =
            ticketDetail?.ticket.defaultGitEnvironmentId;
          if (!ticketGitEnvironmentId) {
            throw new Error(
              "Set a default Git environment before queueing this step",
            );
          }

          const result = await queueTicketFailingTestFixStep({
            ticketId,
          });
          return {
            ok: true,
            data: { message: `execution ${result.data.stepExecution.id}` },
          };
        },
      },
    ],
    [ticketDetail],
  );

  const searchQuery = useMemo(
    () => ({
      q: q || undefined,
      status: status || undefined,
      priority: priority || undefined,
      stepName: stepExecutionStatus ? stepName || undefined : undefined,
      stepExecutionStatus: stepExecutionStatus || undefined,
      sortBy,
    }),
    [priority, q, sortBy, status, stepExecutionStatus, stepName],
  );

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await searchTickets({
        ...searchQuery,
        page: 1,
        pageSize: 50,
      });
      setTickets(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const loadTicketDetail = async (ticketId: string) => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const result = await loadTicketDetailAction(ticketId);
      setTicketDetail(result);
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Unexpected error");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshTicketGitEnvironments = useCallback(async (ticketId: string) => {
    const environments = await getTicketGitEnvironments(ticketId);
    setTicketGitEnvironments(environments);
  }, []);

  const refreshEnvironments = useCallback(async () => {
    const nextEnvironments = await getEnvironments();
    setEnvironments(nextEnvironments);
  }, []);

  useEffect(() => {
    if (skipInitialFilterSearch.current) {
      skipInitialFilterSearch.current = false;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [loadTickets]);

  const handleOpenTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setTicketDetail(null);
    setDetailError(null);
    setOperationMessage(null);
    void loadTicketDetail(ticketId);
    void refreshTicketGitEnvironments(ticketId);
    void refreshEnvironments();
  };

  const handleCloseTicketDialog = () => {
    setSelectedTicketId(null);
    setTicketDetail(null);
    setTicketGitEnvironments([]);
    setEnvironments([]);
    setDetailError(null);
    setOperationMessage(null);
  };

  const handleTriggerStep = async (stepDefinition: AiTimelineStepDefinition) => {
    if (!selectedTicketId) {
      return;
    }

    try {
      setActionLoading(true);
      setDetailError(null);
      setOperationMessage(null);

      const result = await stepDefinition.trigger(selectedTicketId);
      if (!result.ok) {
        throw new Error(result.error ?? `Could not queue step ${stepDefinition.stepName}`);
      }

      setOperationMessage(`Queued ${stepDefinition.stepName}: ${result.data.message}`);
      await loadTicketDetail(selectedTicketId);
    } catch (runError) {
      setDetailError(runError instanceof Error ? runError.message : "Unexpected error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignDefaultEnvironment = async (
    ticketGitEnvironmentId: number,
  ) => {
    if (!selectedTicketId) {
      return;
    }

    try {
      setActionLoading(true);
      setDetailError(null);
      setOperationMessage(null);

      await assignDefaultEnvironment({
        ticketId: selectedTicketId,
        ticketGitEnvironmentId,
      });
      setOperationMessage("Default Git environment updated.");
      await Promise.all([
        loadTicketDetail(selectedTicketId),
        refreshTicketGitEnvironments(selectedTicketId),
        refreshEnvironments(),
      ]);
    } catch (assignError) {
      setDetailError(
        assignError instanceof Error ? assignError.message : "Unexpected error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleMergeFailingTest = async (stepId: string) => {
    if (!selectedTicketId) {
      return;
    }

    try {
      setActionLoading(true);
      setDetailError(null);
      setOperationMessage(null);

      await mergeFailingTest(selectedTicketId, stepId);
      setOperationMessage("Merged failing test pull request.");
      await loadTicketDetail(selectedTicketId);
    } catch (mergeError) {
      setDetailError(
        mergeError instanceof Error ? mergeError.message : "Unexpected error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTicketGitEnvironment = async (
    baseEnvironmentId: string,
    devBranch: string | undefined,
  ) => {
    if (!selectedTicketId) {
      return;
    }

    try {
      setActionLoading(true);
      setDetailError(null);
      setOperationMessage(null);

      const createdEnvironment = await createTicketGitEnvironment({
        ticketId: selectedTicketId,
        baseEnvironmentId,
        devBranch,
      });
      setOperationMessage(
        `Created Git environment ${createdEnvironment.baseEnvironmentId} | ${createdEnvironment.devBranch}`,
      );
      await Promise.all([
        loadTicketDetail(selectedTicketId),
        refreshTicketGitEnvironments(selectedTicketId),
        refreshEnvironments(),
      ]);
    } catch (createError) {
      setDetailError(
        createError instanceof Error ? createError.message : "Unexpected error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Grid container spacing={3}>
        <Grid size={12}>
          <TicketManagerSearchCard
            tickets={tickets}
            q={q}
            status={status}
            priority={priority}
            stepName={stepName}
            stepExecutionStatus={stepExecutionStatus}
            sortBy={sortBy}
            loading={loading}
            error={error}
            totalLabel={totalLabel}
            onQChange={setQ}
            onStatusChange={setStatus}
            onPriorityChange={setPriority}
            onStepNameChange={(value) => {
              setStepName(value);
              if (!value) {
                setStepExecutionStatus("");
              }
            }}
            onStepExecutionStatusChange={setStepExecutionStatus}
            onSortByChange={setSortBy}
            onSearch={loadTickets}
            onOpenTicket={handleOpenTicket}
          />
        </Grid>
      </Grid>

      <TicketManagerDetailDialog
        open={selectedTicketId !== null}
        ticketDetail={ticketDetail}
        ticketGitEnvironments={ticketGitEnvironments}
        environments={environments}
        detailLoading={detailLoading}
        detailError={detailError}
        operationMessage={operationMessage}
        actionLoading={actionLoading}
        stepDefinitions={stepDefinitions}
        onClose={handleCloseTicketDialog}
        onTriggerStep={handleTriggerStep}
        onAssignDefaultEnvironment={handleAssignDefaultEnvironment}
        onCreateTicketGitEnvironment={handleCreateTicketGitEnvironment}
        onMergeFailingTest={handleMergeFailingTest}
      />
    </>
  );
};
