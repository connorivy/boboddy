"use client";

import {
  Alert,
  Chip,
  Card,
  CardContent,
  LinearProgress,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import {
  formatDateTime,
  getStepStatusIcon,
} from "@/components/ticket-manager-step-status";
import {
  getBulkStepQueueItemsSnapshot,
  removeBulkStepQueueItem,
  useBulkStepQueueItems,
} from "@/modules/step-executions/application/bulk-step-queue";
import { advancePipelineStep } from "@/modules/step-executions/application/advance-pipeline-step";
import { getPipelineRuns } from "@/modules/pipeline-runs/application/get-pipeline-runs";
import type { PaginatedPipelineRunsResponse } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { TICKET_DESCRIPTION_QUALITY_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

type PipelinesViewProps = {
  initialPipelineRuns: PaginatedPipelineRunsResponse;
};

export const PipelinesView = ({ initialPipelineRuns }: PipelinesViewProps) => {
  const [pipelineRuns, setPipelineRuns] = useState(initialPipelineRuns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queueItems = useBulkStepQueueItems();
  const [processingQueueItemId, setProcessingQueueItemId] = useState<number | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const processingRef = useRef(false);

  const totalPages = Math.max(
    1,
    Math.ceil(pipelineRuns.pagination.total / pipelineRuns.pagination.pageSize),
  );
  const start = (pipelineRuns.pagination.page - 1) * pipelineRuns.pagination.pageSize + 1;
  const end = Math.min(
    pipelineRuns.pagination.page * pipelineRuns.pagination.pageSize,
    pipelineRuns.pagination.total,
  );

  const handlePageChange = async (page: number) => {
    try {
      setLoading(true);
      setError(null);
      const result = await getPipelineRuns({
        page,
        pageSize: 25,
      });
      setPipelineRuns(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unexpected error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (processingRef.current) {
      return;
    }

    if (queueItems.length === 0) {
      return;
    }

    processingRef.current = true;
    setProcessingError(null);

    const runQueue = async () => {
      try {
        // Drain the queue in one run so we do not miss updates emitted while processing.
        while (true) {
          const nextQueueItem = getBulkStepQueueItemsSnapshot()[0];
          if (!nextQueueItem) {
            break;
          }

          setProcessingQueueItemId(nextQueueItem.id);

          try {
            if (nextQueueItem.stepName !== TICKET_DESCRIPTION_QUALITY_STEP_NAME) {
              throw new Error(`Step ${nextQueueItem.stepName} is not implemented yet`);
            }

            await advancePipelineStep({
              ticketId: nextQueueItem.ticketId,
            });
          } catch (queueError) {
            setProcessingError(
              queueError instanceof Error
                ? queueError.message
                : "Unexpected queue processing error",
            );
          } finally {
            removeBulkStepQueueItem(nextQueueItem.id);
            try {
              const refreshed = await getPipelineRuns({
                page: 1,
                pageSize: 25,
              });
              setPipelineRuns(refreshed);
            } catch {
              // Keep queue processing resilient even if refresh fails.
            }
          }
        }
      } finally {
        setProcessingQueueItemId(null);
        processingRef.current = false;
      }
    };

    void runQueue();
  }, [queueItems]);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Queued Bulk Actions</Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip
              label={`Queue Size: ${queueItems.length}`}
              color={queueItems.length > 0 ? "primary" : "default"}
              size="small"
            />
            <Chip
              label={
                processingQueueItemId === null
                  ? "Processor: idle"
                  : `Processor: working item ${processingQueueItemId}`
              }
              color={processingQueueItemId === null ? "default" : "warning"}
              size="small"
            />
          </Stack>

          {processingError ? <Alert severity="error">{processingError}</Alert> : null}

          {queueItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No queued actions.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Queue Item</TableCell>
                  <TableCell>Ticket</TableCell>
                  <TableCell>Step</TableCell>
                  <TableCell>Queued At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {queueItems.slice(0, 20).map((item) => (
                  <TableRow key={`queue-item-${item.id}`}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.ticketId}</TableCell>
                    <TableCell>{item.stepName}</TableCell>
                    <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Typography variant="h6">Pipeline Actions</Typography>
          <Typography variant="body2" color="text.secondary">
            {pipelineRuns.pagination.total === 0
              ? "No actions yet."
              : `Showing ${start}-${end} of ${pipelineRuns.pagination.total}`}
          </Typography>

          {loading ? <LinearProgress /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Run</TableCell>
                <TableCell>Ticket</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Current Step</TableCell>
                <TableCell>Last Completed</TableCell>
                <TableCell>Started</TableCell>
                <TableCell>Ended</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pipelineRuns.items.map((run) => (
                <TableRow key={`pipeline-run-${run.pipelineRunId}`}>
                  <TableCell>{run.pipelineRunId}</TableCell>
                  <TableCell>{run.ticketId}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {getStepStatusIcon(run.status)}
                      <Typography variant="body2">{run.status}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{run.currentStepName ?? "-"}</TableCell>
                  <TableCell>{run.lastCompletedStepName ?? "-"}</TableCell>
                  <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                  <TableCell>{formatDateTime(run.endedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Stack direction="row" justifyContent="center">
            <Pagination
              page={pipelineRuns.pagination.page}
              count={totalPages}
              color="primary"
              onChange={(_, page) => void handlePageChange(page)}
              disabled={loading || totalPages <= 1}
            />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};
