type StepExecutionFailureInputError =
  | Error
  | { message?: string | undefined }
  | string
  | number
  | boolean
  | null
  | undefined;

function toFailureMessage(error: StepExecutionFailureInputError): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return typeof error.message === "string" ? error.message : "Unknown failure";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "number" || typeof error === "boolean") {
    return String(error);
  }

  return "Unknown failure";
}

export function buildStepExecutionFailurePayload(error: StepExecutionFailureInputError) {
  const message = toFailureMessage(error);

  return {
    resultJson: {
      status: "failed",
    },
    errorJson: {
      code: "BOBODDY_WORKER_EXECUTION_FAILED",
      message,
    },
  };
}
