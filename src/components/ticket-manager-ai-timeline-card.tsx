import { Box, Button, Card, CardContent, Collapse, Divider, Stack, Typography } from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SentimentDissatisfiedIcon from "@mui/icons-material/SentimentDissatisfied";
import SentimentNeutralIcon from "@mui/icons-material/SentimentNeutral";
import SentimentSatisfiedIcon from "@mui/icons-material/SentimentSatisfied";
import SentimentVerySatisfiedIcon from "@mui/icons-material/SentimentVerySatisfied";
import { useState } from "react";
import { sortStepExecutionsNewestFirst } from "@/modules/step-executions/application/sort-step-executions";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  type StepExecutionStepName,
} from "@/modules/step-executions/domain/step-execution.types";
import type { TicketStepExecution } from "@/modules/tickets/contracts/ticket-contracts";
import { type TimelineStepStatus, getStepStatusIcon } from "@/components/ticket-manager-step-status";

export type AiTimelineStepName =
  | typeof TICKET_DESCRIPTION_QUALITY_STEP_NAME
  | typeof TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME
  | typeof TICKET_DUPLICATE_CANDIDATES_STEP_NAME
  | typeof FAILING_TEST_REPRO_STEP_NAME
  | typeof FAILING_TEST_FIX_STEP_NAME
  | StepExecutionStepName;

export type AiTimelineStepTriggerResult =
  | { ok: true; data: { message: string } }
  | { ok: false; error: string };

export type AiTimelineStepDefinition = {
  stepName: AiTimelineStepName;
  trigger: (ticketId: string) => Promise<AiTimelineStepTriggerResult>;
};

type TimelineStep = {
  stepName: AiTimelineStepName;
  status: TimelineStepStatus;
  latestExecution: TicketStepExecution | null;
  definition: AiTimelineStepDefinition;
};

const buildTimelineSteps = (
  stepExecutions: TicketStepExecution[],
  defaultTicketGitEnvironmentDevBranch: string | undefined,
  stepDefinitions: AiTimelineStepDefinition[],
): TimelineStep[] => {
  const runsByStep = new Map<string, TicketStepExecution[]>();
  for (const stepExecution of stepExecutions) {
    if (!runsByStep.has(stepExecution.stepName)) {
      runsByStep.set(stepExecution.stepName, []);
    }
    runsByStep.get(stepExecution.stepName)?.push(stepExecution);
  }

  return stepDefinitions.map((definition) => {
    const { stepName } = definition;
    const allRunsForStep = runsByStep.get(stepName) ?? [];
    const runs = allRunsForStep.filter((stepExecution) => {
      const stepResult = stepExecution.result;
      if (
        stepResult?.stepName !== FAILING_TEST_REPRO_STEP_NAME &&
        stepResult?.stepName !== FAILING_TEST_FIX_STEP_NAME
      ) {
        return true;
      }
      return stepResult.githubPrTargetBranch?.trim() === defaultTicketGitEnvironmentDevBranch?.trim();
    });

    const latestRun = sortStepExecutionsNewestFirst(runs)[0];

    if (!latestRun) {
      return {
        stepName,
        status: "neverRan",
        latestExecution: null,
        definition,
      };
    }

    return {
      stepName,
      status: latestRun.status,
      latestExecution: latestRun,
      definition,
    };
  });
};

const formatScore = (score: number): string => {
  const rounded = Math.round(score * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded.toFixed(1)}` : `${rounded}`;
};

const getScoreRangeIcon = (score: number) => {
  if (score < 2) {
    return <SentimentDissatisfiedIcon color="error" fontSize="small" />;
  }

  if (score < 3) {
    return <SentimentNeutralIcon color="warning" fontSize="small" />;
  }

  if (score < 4) {
    return <SentimentSatisfiedIcon color="info" fontSize="small" />;
  }

  return <SentimentVerySatisfiedIcon color="success" fontSize="small" />;
};

type TicketManagerAiTimelineCardProps = {
  stepExecutions: TicketStepExecution[];
  defaultTicketGitEnvironmentDevBranch?: string;
  stepDefinitions: AiTimelineStepDefinition[];
  actionLoading: boolean;
  detailLoading: boolean;
  onTriggerStep: (stepDefinition: AiTimelineStepDefinition) => void | Promise<void>;
  onMergeFailingTest: (stepId: string) => void | Promise<void>;
};

export const TicketManagerAiTimelineCard = ({
  stepExecutions,
  defaultTicketGitEnvironmentDevBranch,
  stepDefinitions,
  actionLoading,
  detailLoading,
  onTriggerStep,
  onMergeFailingTest,
}: TicketManagerAiTimelineCardProps) => {
  const timelineSteps = buildTimelineSteps(
    stepExecutions,
    defaultTicketGitEnvironmentDevBranch,
    stepDefinitions,
  );
  const [expandedStepName, setExpandedStepName] = useState<string | null>(null);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1">AI Pipeline Timeline</Typography>
          <Stack spacing={1}>
            {timelineSteps.map((step, index) => {
              const latestResult = step.latestExecution?.result;
              const isMergedFailingTestStep =
                (step.stepName === FAILING_TEST_REPRO_STEP_NAME ||
                  step.stepName === FAILING_TEST_FIX_STEP_NAME) &&
                (latestResult?.stepName === FAILING_TEST_REPRO_STEP_NAME ||
                  latestResult?.stepName === FAILING_TEST_FIX_STEP_NAME) &&
                latestResult.githubMergeStatus === "merged";

              return (
                <Box key={`timeline-step-${step.stepName}`}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  {getStepStatusIcon(step.status)}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2">{step.stepName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {step.status}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => void onTriggerStep(step.definition)}
                    disabled={
                      actionLoading || detailLoading || isMergedFailingTestStep
                    }
                  >
                    Trigger
                  </Button>
                </Box>
                {step.stepName === TICKET_DESCRIPTION_QUALITY_STEP_NAME ? (() => {
                  const result = step.latestExecution?.result;
                  if (
                    !result ||
                    result.stepName !== TICKET_DESCRIPTION_QUALITY_STEP_NAME
                  ) {
                    return null;
                  }

                  const averageScore =
                    (result.stepsToReproduceScore +
                      result.expectedBehaviorScore +
                      result.observedBehaviorScore) /
                    3;
                  const isExpanded = expandedStepName === step.stepName;

                  return (
                    <Stack spacing={1} sx={{ mt: 1, ml: 4 }}>
                      <Button
                        variant="contained"
                        size="small"
                        color="primary"
                        startIcon={getScoreRangeIcon(averageScore)}
                        endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        sx={{ justifyContent: "space-between", width: "fit-content", textTransform: "none" }}
                        onClick={() =>
                          setExpandedStepName(
                            isExpanded ? null : step.stepName,
                          )
                        }
                      >
                        Score: {formatScore(averageScore)} / 5
                      </Button>
                      <Collapse in={isExpanded}>
                        <Stack spacing={0.75}>
                          <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                            {getScoreRangeIcon(result.stepsToReproduceScore)}
                            <Typography variant="caption" color="text.secondary">
                              Steps to reproduce: {formatScore(result.stepsToReproduceScore)} / 5
                            </Typography>
                          </Box>
                          <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                            {getScoreRangeIcon(result.expectedBehaviorScore)}
                            <Typography variant="caption" color="text.secondary">
                              Expected behavior: {formatScore(result.expectedBehaviorScore)} / 5
                            </Typography>
                          </Box>
                          <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                            {getScoreRangeIcon(result.observedBehaviorScore)}
                            <Typography variant="caption" color="text.secondary">
                              Observed behavior: {formatScore(result.observedBehaviorScore)} / 5
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            Explanation: {result.reasoning}
                          </Typography>
                        </Stack>
                      </Collapse>
                    </Stack>
                  );
                })() : null}
                {step.stepName === TICKET_DUPLICATE_CANDIDATES_STEP_NAME ? (() => {
                  const result = step.latestExecution?.result;
                  if (
                    !result ||
                    result.stepName !== TICKET_DUPLICATE_CANDIDATES_STEP_NAME
                  ) {
                    return null;
                  }

                  const topCandidates = result.proposed.slice(0, 5);
                  const isExpanded = expandedStepName === step.stepName;

                  return (
                    <Stack spacing={1} sx={{ mt: 1, ml: 4 }}>
                      <Button
                        variant="contained"
                        size="small"
                        color="secondary"
                        endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        sx={{ justifyContent: "space-between", width: "fit-content", textTransform: "none" }}
                        onClick={() =>
                          setExpandedStepName(
                            isExpanded ? null : step.stepName,
                          )
                        }
                      >
                        {topCandidates.length === 0
                          ? "No candidates found"
                          : `${topCandidates.length} candidate${topCandidates.length === 1 ? "" : "s"}`}
                      </Button>
                      <Collapse in={isExpanded}>
                        <Stack spacing={0.75}>
                          {topCandidates.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                              No duplicate candidates found for this ticket.
                            </Typography>
                          ) : (
                            topCandidates.map((candidate) => (
                              <Typography
                                key={`${step.stepName}-${candidate.candidateTicketId}`}
                                variant="caption"
                                color="text.secondary"
                              >
                                {candidate.candidateTicketId} · score {candidate.score.toFixed(4)}
                              </Typography>
                            ))
                          )}
                        </Stack>
                      </Collapse>
                    </Stack>
                  );
                })() : null}
                {(step.stepName === FAILING_TEST_REPRO_STEP_NAME ||
                  step.stepName === FAILING_TEST_FIX_STEP_NAME) ? (() => {
                  const result = step.latestExecution?.result;
                  if (
                    !result ||
                    (result.stepName !== FAILING_TEST_REPRO_STEP_NAME &&
                      result.stepName !== FAILING_TEST_FIX_STEP_NAME)
                  ) {
                    return null;
                  }

                  const isExpanded = expandedStepName === step.stepName;
                  const summary =
                    result.stepName === FAILING_TEST_REPRO_STEP_NAME
                      ? (result.summaryOfFindings?.trim() ?? null)
                      : result.summaryOfFix?.trim() ||
                        result.agentSummary?.trim() ||
                        null;
                  const outcomeLabel =
                    result.stepName === FAILING_TEST_REPRO_STEP_NAME
                      ? (result.outcome?.replaceAll("_", " ") ?? "pending")
                      : (result.fixOperationOutcome?.replaceAll("_", " ") ??
                        "pending");
                  const canMerge =
                    result.stepName === FAILING_TEST_REPRO_STEP_NAME &&
                    (result.githubMergeStatus === "draft" ||
                      result.githubMergeStatus === "open") &&
                    typeof step.latestExecution?.id === "string";
                  const mergeStepId = step.latestExecution?.id;

                  return (
                    <Stack spacing={1} sx={{ mt: 1, ml: 4 }}>
                      <Button
                        variant="contained"
                        size="small"
                        color="success"
                        endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        sx={{ justifyContent: "space-between", width: "fit-content", textTransform: "none" }}
                        onClick={() =>
                          setExpandedStepName(
                            isExpanded ? null : step.stepName,
                          )
                        }
                      >
                        Outcome: {outcomeLabel}
                      </Button>
                      {canMerge && typeof mergeStepId === "string" ? (
                        <Button
                          variant="outlined"
                          size="small"
                          color="success"
                          onClick={() => void onMergeFailingTest(mergeStepId)}
                          disabled={actionLoading || detailLoading}
                        >
                          Merge
                        </Button>
                      ) : null}
                      <Collapse in={isExpanded}>
                        <Stack spacing={0.75}>
                          <Typography variant="caption" color="text.secondary">
                            Summary: {summary ?? "No summary of findings provided for this run."}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Merge status: {result.githubMergeStatus}
                          </Typography>
                          {(result.stepName === FAILING_TEST_REPRO_STEP_NAME
                            ? result.outcome
                            : result.fixOperationOutcome) ? (
                            <Typography variant="caption" color="text.secondary">
                              Outcome: {result.stepName === FAILING_TEST_REPRO_STEP_NAME
                                ? result.outcome
                                : result.fixOperationOutcome}
                            </Typography>
                          ) : null}
                          {typeof (result.stepName === FAILING_TEST_REPRO_STEP_NAME
                            ? result.confidenceLevel
                            : result.fixConfidenceLevel) === "number" ? (
                            <Typography variant="caption" color="text.secondary">
                              Confidence: {(result.stepName === FAILING_TEST_REPRO_STEP_NAME
                                ? result.confidenceLevel
                                : result.fixConfidenceLevel
                              )?.toFixed(2)}
                            </Typography>
                          ) : null}
                          {result.failureReason ? (
                            <Typography variant="caption" color="text.secondary">
                              Failure reason: {result.failureReason}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Collapse>
                    </Stack>
                  );
                })() : null}
                {index < timelineSteps.length - 1 ? <Divider sx={{ mt: 1 }} /> : null}
                </Box>
              );
            })}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};
