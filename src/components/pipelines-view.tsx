"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  LinearProgress,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Link,
  Typography,
} from "@mui/material";
import { useState } from "react";
import {
  formatDateTime,
  getStepStatusIcon,
} from "@/components/ticket-manager-step-status";
import { advancePipeline } from "@/modules/pipeline-runs/application/advance-pipeline";
import { getPipelines } from "@/modules/pipeline-runs/application/get-pipelines";
import { modifyPipeline } from "@/modules/pipeline-runs/application/modify-pipeline";
import type { PaginatedPipelineRunsResponse } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { getPipelineStepExecutions } from "@/modules/step-executions/application/get-pipeline-step-executions";
import type { PaginatedPipelineStepExecutionsResponse } from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";

type PipelinesViewProps = {
  initialPipelines: PaginatedPipelineRunsResponse;
  initialStepExecutions: PaginatedPipelineStepExecutionsResponse;
};

const PAGE_SIZE = 25;

const formatPipelineId = (pipelineId: string | null) => {
  if (!pipelineId) {
    return "N/A";
  }

  const lastSegment = pipelineId.split("-").at(-1);
  return lastSegment && lastSegment.length > 0 ? lastSegment : pipelineId;
};

export const PipelinesView = ({
  initialPipelines,
  initialStepExecutions,
}: PipelinesViewProps) => {
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [stepExecutions, setStepExecutions] = useState(initialStepExecutions);
  const [selectedStepExecutionJson, setSelectedStepExecutionJson] = useState<string | null>(null);
  const [ticketIdFilter, setTicketIdFilter] = useState("");
  const [appliedTicketIdFilter, setAppliedTicketIdFilter] = useState("");
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [stepExecutionsLoading, setStepExecutionsLoading] = useState(false);
  const [activePipelineAction, setActivePipelineAction] = useState<{
    pipelineRunId: string;
    type: "advance" | "toggleAutoAdvance";
  } | null>(null);
  const [pipelinesError, setPipelinesError] = useState<string | null>(null);
  const [stepExecutionsError, setStepExecutionsError] = useState<string | null>(null);

  const pipelinesTotalPages = Math.max(
    1,
    Math.ceil(pipelines.pagination.total / pipelines.pagination.pageSize),
  );
  const pipelineStart = (pipelines.pagination.page - 1) * pipelines.pagination.pageSize + 1;
  const pipelineEnd = Math.min(
    pipelines.pagination.page * pipelines.pagination.pageSize,
    pipelines.pagination.total,
  );
  const stepExecutionsTotalPages = Math.max(
    1,
    Math.ceil(stepExecutions.pagination.total / stepExecutions.pagination.pageSize),
  );
  const stepExecutionStart =
    (stepExecutions.pagination.page - 1) * stepExecutions.pagination.pageSize + 1;
  const stepExecutionEnd = Math.min(
    stepExecutions.pagination.page * stepExecutions.pagination.pageSize,
    stepExecutions.pagination.total,
  );

  const loadPipelines = async (page: number, q: string) => {
    try {
      setPipelinesLoading(true);
      setPipelinesError(null);
      const result = await getPipelines({
        page,
        pageSize: PAGE_SIZE,
        q,
      });
      setPipelines(result);
      setAppliedTicketIdFilter(q);
    } catch (loadError) {
      setPipelinesError(
        loadError instanceof Error ? loadError.message : "Unexpected error",
      );
    } finally {
      setPipelinesLoading(false);
    }
  };

  const handleStepExecutionPageChange = async (page: number) => {
    try {
      setStepExecutionsLoading(true);
      setStepExecutionsError(null);
      const result = await getPipelineStepExecutions({
        page,
        pageSize: PAGE_SIZE,
        q: appliedTicketIdFilter,
      });
      setStepExecutions(result);
    } catch (loadError) {
      setStepExecutionsError(
        loadError instanceof Error ? loadError.message : "Unexpected error",
      );
    } finally {
      setStepExecutionsLoading(false);
    }
  };

  const refreshStepExecutions = async (page: number) => {
    const result = await getPipelineStepExecutions({
      page,
      pageSize: PAGE_SIZE,
      q: appliedTicketIdFilter,
    });
    setStepExecutions(result);
  };

  const loadFilteredTables = async (q: string) => {
    setPipelinesError(null);
    setStepExecutionsError(null);
    await Promise.all([
      loadPipelines(1, q),
      (async () => {
        try {
          setStepExecutionsLoading(true);
          const result = await getPipelineStepExecutions({
            page: 1,
            pageSize: PAGE_SIZE,
            q,
          });
          setStepExecutions(result);
        } catch (error) {
          setStepExecutionsError(
            error instanceof Error ? error.message : "Unexpected error",
          );
        } finally {
          setStepExecutionsLoading(false);
        }
      })(),
    ]);
  };

  const handleAdvancePipeline = async (pipelineRunId: string) => {
    try {
      setActivePipelineAction({ pipelineRunId, type: "advance" });
      setPipelinesError(null);
      setStepExecutionsError(null);
      await advancePipeline(pipelineRunId);
      await Promise.all([
        loadPipelines(pipelines.pagination.page, appliedTicketIdFilter),
        refreshStepExecutions(stepExecutions.pagination.page),
      ]);
    } catch (error) {
      setPipelinesError(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setActivePipelineAction(null);
    }
  };

  const handleToggleAutoAdvance = async (
    pipelineRunId: string,
    autoAdvance: boolean,
  ) => {
    try {
      setActivePipelineAction({ pipelineRunId, type: "toggleAutoAdvance" });
      setPipelinesError(null);
      await modifyPipeline({
        pipelineRunId,
        autoAdvance: !autoAdvance,
      });
      await loadPipelines(pipelines.pagination.page, appliedTicketIdFilter);
    } catch (error) {
      setPipelinesError(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setActivePipelineAction(null);
    }
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
            <TextField
              label="Filter by pipeline or ticket ID"
              value={ticketIdFilter}
              onChange={(event) => setTicketIdFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void loadFilteredTables(ticketIdFilter);
                }
              }}
              size="small"
              placeholder="Search pipeline or ticket ID substring"
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                onClick={() => void loadFilteredTables(ticketIdFilter)}
                disabled={pipelinesLoading}
              >
                Search
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setTicketIdFilter("");
                  void loadFilteredTables("");
                }}
                disabled={pipelinesLoading || ticketIdFilter.length === 0}
              >
                Clear
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Pipelines</Typography>
                <Typography variant="body2" color="text.secondary">
                  {pipelines.pagination.total === 0
                    ? "No pipelines found."
                    : `Showing ${pipelineStart}-${pipelineEnd} of ${pipelines.pagination.total}`}
                </Typography>

                {pipelinesLoading ? <LinearProgress /> : null}
                {pipelinesError ? <Alert severity="error">{pipelinesError}</Alert> : null}

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Pipeline</TableCell>
                      <TableCell>Ticket</TableCell>
                      <TableCell>Auto</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pipelines.items.map((pipeline) => (
                      <TableRow key={pipeline.pipelineRunId}>
                        <TableCell>
                          <Link
                            component="button"
                            type="button"
                            underline="hover"
                            onClick={() => {
                              setTicketIdFilter(pipeline.pipelineRunId);
                              void loadFilteredTables(pipeline.pipelineRunId);
                            }}
                          >
                            {formatPipelineId(pipeline.pipelineRunId)}
                          </Link>
                        </TableCell>
                        <TableCell>{pipeline.ticketId}</TableCell>
                        <TableCell>{pipeline.autoAdvance ? "Yes" : "No"}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => void handleAdvancePipeline(pipeline.pipelineRunId)}
                              disabled={
                                pipelinesLoading ||
                                activePipelineAction?.pipelineRunId === pipeline.pipelineRunId
                              }
                            >
                              Advance
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() =>
                                void handleToggleAutoAdvance(
                                  pipeline.pipelineRunId,
                                  pipeline.autoAdvance,
                                )}
                              disabled={
                                pipelinesLoading ||
                                activePipelineAction?.pipelineRunId === pipeline.pipelineRunId
                              }
                            >
                              Toggle Auto Advance
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Stack direction="row" justifyContent="center">
                  <Pagination
                    page={pipelines.pagination.page}
                    count={pipelinesTotalPages}
                    color="primary"
                    onChange={(_, page) =>
                      void loadPipelines(page, appliedTicketIdFilter)}
                    disabled={pipelinesLoading || pipelinesTotalPages <= 1}
                  />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Step Executions</Typography>
                <Typography variant="body2" color="text.secondary">
                  {stepExecutions.pagination.total === 0
                    ? "No actions yet."
                    : `Showing ${stepExecutionStart}-${stepExecutionEnd} of ${stepExecutions.pagination.total}`}
                </Typography>

                {stepExecutionsLoading ? <LinearProgress /> : null}
                {stepExecutionsError ? (
                  <Alert severity="error">{stepExecutionsError}</Alert>
                ) : null}

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Pipeline</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Step</TableCell>
                      <TableCell>Started</TableCell>
                      <TableCell>Ended</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stepExecutions.items.map((step) => {
                      const stepJson = JSON.stringify(step, null, 2);

                      return (
                        <TableRow
                          key={`pipeline-step-${step.id}`}
                          hover
                          onClick={() => setSelectedStepExecutionJson(stepJson)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell>{formatPipelineId(step.pipelineId)}</TableCell>
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
                      );
                    })}
                  </TableBody>
                </Table>

                <Stack direction="row" justifyContent="center">
                  <Pagination
                    page={stepExecutions.pagination.page}
                    count={stepExecutionsTotalPages}
                    color="primary"
                    onChange={(_, page) => void handleStepExecutionPageChange(page)}
                    disabled={stepExecutionsLoading || stepExecutionsTotalPages <= 1}
                  />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog
        open={selectedStepExecutionJson !== null}
        onClose={() => setSelectedStepExecutionJson(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Step Execution JSON</DialogTitle>
        <DialogContent>
          <Paper
            variant="outlined"
            sx={{ p: 2, maxHeight: "70vh", overflow: "auto" }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "inherit",
                background: "transparent",
              }}
            >
              {selectedStepExecutionJson}
            </pre>
          </Paper>
        </DialogContent>
      </Dialog>
    </Stack>
  );
};
