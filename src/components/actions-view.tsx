"use client";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { createPipelineRuns } from "@/modules/pipeline-runs/application/create-pipeline-runs";
import { modifyPipeline } from "@/modules/pipeline-runs/application/modify-pipeline";
import {
  ingestTickets,
  ingestTicketsFromBoards,
} from "@/modules/tickets/application/batch-ingest";

const JIRA_TICKET_NUMBER_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;

export const ActionsView = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState("");
  const [pipelineTicketId, setPipelineTicketId] = useState("");
  const [pipelineAutoAdvance, setPipelineAutoAdvance] = useState(false);
  const [modifyPipelineRunId, setModifyPipelineRunId] = useState("");
  const [modifyPipelineAutoAdvance, setModifyPipelineAutoAdvance] =
    useState(false);
  const [output, setOutput] = useState<unknown>({
    message: "Run an action to see output.",
  });
  const normalizedTicketNumber = ticketNumber.trim().toUpperCase();
  const hasTicketNumber = normalizedTicketNumber.length > 0;
  const normalizedPipelineTicketId = pipelineTicketId.trim();
  const normalizedModifyPipelineRunId = modifyPipelineRunId.trim();
  const isTicketNumberValid = JIRA_TICKET_NUMBER_PATTERN.test(
    normalizedTicketNumber,
  );

  const runIngestFromBoards = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await ingestTicketsFromBoards();
      setOutput({
        ok: true,
        ingestedCount: result.length,
        result,
      });
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : "Unexpected error";
      setError(message);
      setOutput({
        ok: false,
        error: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const runIngestSingleTicket = async () => {
    if (!isTicketNumberValid) {
      setError("Ticket number must look like ABC-123");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await ingestTickets([normalizedTicketNumber]);
      setOutput({
        ok: true,
        ingestedCount: result.length,
        ticketNumber: normalizedTicketNumber,
        result,
      });
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : "Unexpected error";
      setError(message);
      setOutput({
        ok: false,
        ticketNumber: normalizedTicketNumber,
        error: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const runCreatePipelineRun = async () => {
    if (!normalizedPipelineTicketId) {
      setError("Ticket ID is required");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await createPipelineRuns({
        pipelineRuns: [
          {
            ticketId: normalizedPipelineTicketId,
            autoAdvance: pipelineAutoAdvance,
          },
        ],
      });
      setOutput({
        ok: true,
        createdCount: result.length,
        ticketId: normalizedPipelineTicketId,
        autoAdvance: pipelineAutoAdvance,
        result,
      });
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : "Unexpected error";
      setError(message);
      setOutput({
        ok: false,
        ticketId: normalizedPipelineTicketId,
        autoAdvance: pipelineAutoAdvance,
        error: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const runModifyPipeline = async () => {
    if (!normalizedModifyPipelineRunId) {
      setError("Pipeline run ID is required");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await modifyPipeline({
        pipelineRunId: normalizedModifyPipelineRunId,
        autoAdvance: modifyPipelineAutoAdvance,
      });
      setOutput({
        ok: true,
        pipelineRunId: normalizedModifyPipelineRunId,
        autoAdvance: modifyPipelineAutoAdvance,
        result,
      });
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : "Unexpected error";
      setError(message);
      setOutput({
        ok: false,
        pipelineRunId: normalizedModifyPipelineRunId,
        autoAdvance: modifyPipelineAutoAdvance,
        error: message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Ticket Actions</Typography>
              <Typography variant="body2" color="text.secondary">
                Run one-off ticket actions.
              </Typography>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={() => void runIngestFromBoards()}
                disabled={loading}
              >
                ingestTicketFromBoards
              </Button>
              <TextField
                label="Ticket Number"
                value={ticketNumber}
                onChange={(event) =>
                  setTicketNumber(event.target.value.toUpperCase())
                }
                placeholder="CV-1234"
                error={hasTicketNumber && !isTicketNumberValid}
                helperText={
                  hasTicketNumber && !isTicketNumberValid
                    ? "Use Jira key format: ABC-123"
                    : " "
                }
              />
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={() => void runIngestSingleTicket()}
                disabled={loading || !isTicketNumberValid}
              >
                ingestTicket
              </Button>
              <TextField
                label="Pipeline Ticket ID"
                value={pipelineTicketId}
                onChange={(event) => setPipelineTicketId(event.target.value)}
                placeholder="CV-1234"
                helperText="Creates a pipeline run for an existing ticket id."
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={pipelineAutoAdvance}
                    onChange={(event) =>
                      setPipelineAutoAdvance(event.target.checked)
                    }
                    disabled={loading}
                  />
                }
                label="Auto advance pipeline"
              />
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={() => void runCreatePipelineRun()}
                disabled={loading || normalizedPipelineTicketId.length === 0}
              >
                createPipelineRuns
              </Button>
              <TextField
                label="Modify Pipeline Run ID"
                value={modifyPipelineRunId}
                onChange={(event) => setModifyPipelineRunId(event.target.value)}
                placeholder="01959504-cf1c-7f43-bf6f-898c53b176ef"
                helperText="Updates an existing pipeline run."
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={modifyPipelineAutoAdvance}
                    onChange={(event) =>
                      setModifyPipelineAutoAdvance(event.target.checked)
                    }
                    disabled={loading}
                  />
                }
                label="Modified auto advance value"
              />
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={() => void runModifyPipeline()}
                disabled={loading || normalizedModifyPipelineRunId.length === 0}
              >
                modifyPipeline
              </Button>
              {error ? <Alert severity="error">{error}</Alert> : null}
            </Stack>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Stack spacing={2} sx={{ height: "100%" }}>
              <Typography variant="h6">Method Output</Typography>
              {loading ? <LinearProgress /> : null}
              <Typography
                component="pre"
                sx={{
                  m: 0,
                  p: 2,
                  borderRadius: 1,
                  bgcolor: "#0B1220",
                  color: "#E5E7EB",
                  border: "1px solid",
                  borderColor: "divider",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 13,
                  overflowX: "auto",
                  minHeight: 360,
                }}
              >
                {JSON.stringify(output, null, 2)}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};
