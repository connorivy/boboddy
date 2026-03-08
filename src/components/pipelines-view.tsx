"use client";

import {
  Alert,
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
import { useState } from "react";
import {
  formatDateTime,
  getStepStatusIcon,
} from "@/components/ticket-manager-step-status";
import { getPipelineStepExecutions } from "@/modules/step-executions/application/get-pipeline-step-executions";
import type { PaginatedPipelineStepExecutionsResponse } from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";

type PipelinesViewProps = {
  initialStepExecutions: PaginatedPipelineStepExecutionsResponse;
};

export const PipelinesView = ({ initialStepExecutions }: PipelinesViewProps) => {
  const [stepExecutions, setStepExecutions] = useState(initialStepExecutions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(
    1,
    Math.ceil(stepExecutions.pagination.total / stepExecutions.pagination.pageSize),
  );
  const start = (stepExecutions.pagination.page - 1) * stepExecutions.pagination.pageSize + 1;
  const end = Math.min(
    stepExecutions.pagination.page * stepExecutions.pagination.pageSize,
    stepExecutions.pagination.total,
  );

  const handlePageChange = async (page: number) => {
    try {
      setLoading(true);
      setError(null);
      const result = await getPipelineStepExecutions({
        page,
        pageSize: 25,
      });
      setStepExecutions(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unexpected error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Pipeline Actions</Typography>
          <Typography variant="body2" color="text.secondary">
            {stepExecutions.pagination.total === 0
              ? "No actions yet."
              : `Showing ${start}-${end} of ${stepExecutions.pagination.total}`}
          </Typography>

          {loading ? <LinearProgress /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}

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
              {stepExecutions.items.map((step) => (
                <TableRow key={`pipeline-step-${step.id}`}>
                  <TableCell>{step.pipelineId}</TableCell>
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

          <Stack direction="row" justifyContent="center">
            <Pagination
              page={stepExecutions.pagination.page}
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
