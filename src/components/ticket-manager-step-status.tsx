import AutorenewIcon from "@mui/icons-material/Autorenew";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import ScheduleIcon from "@mui/icons-material/Schedule";
import type { StepExecutionStatus } from "@/modules/step-executions/domain/step-execution.types";
import type { PipelineRunStatus } from "@/modules/pipeline-runs/domain/pipeline-run.types";

export type TimelineStepStatus = StepExecutionStatus | PipelineRunStatus | "neverRan";

export const getStepStatusIcon = (status: TimelineStepStatus) => {
  if (status === "succeeded") {
    return <CheckCircleOutlineIcon color="success" fontSize="small" />;
  }
  if (status === "failed" || status === "failed_timeout") {
    return <ErrorOutlineIcon color="error" fontSize="small" />;
  }
  if (status === "running") {
    return <AutorenewIcon color="primary" fontSize="small" />;
  }
  if (status === "waiting" || status === "queued") {
    return <ScheduleIcon color="info" fontSize="small" />;
  }
  if (status === "halted" || status === "cancelled") {
    return <RemoveCircleOutlineIcon color="warning" fontSize="small" />;
  }
  if (status === "skipped") {
    return <RemoveCircleOutlineIcon color="disabled" fontSize="small" />;
  }
  if (status === "neverRan") {
    return <ScheduleIcon color="disabled" fontSize="small" />;
  }
  return <ScheduleIcon color="warning" fontSize="small" />;
};

export const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
};
