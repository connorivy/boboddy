import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, ok } from "@/lib/api/http";
import { completeTicketFailingTestReproStep } from "@/modules/step-executions/github_repro_failing_test/application/complete-ticket-failing-test-repro-step";
import { handleAiWebhookBadRequest } from "@/modules/step-executions/application/handle-ai-webhook-bad-request";
import {
  completeTicketFailingTestReproStepRequestBodySchema,
  completeTicketFailingTestReproStepRequestQuerySchema,
  completeTicketFailingTestReproStepRequestSchema,
} from "@/modules/step-executions/github_repro_failing_test/contracts/complete-ticket-failing-test-repro-step-contracts";
import { FAILING_TEST_REPRO_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

const hasValidApiKey = (request: Request): boolean => {
  const apiKey = request.headers.get("x-api-key");
  return apiKey === process.env.BOBODDY_API_KEY;
};

const toErrorResponse = (error: unknown) => {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : null;

  if (status && Number.isInteger(status) && status >= 400 && status <= 599) {
    const message =
      error instanceof Error ? error.message : "Request could not be processed";

    return NextResponse.json({ error: message }, { status });
  }

  return handleRouteError(error);
};

export async function PUT(request: Request) {
  if (!hasValidApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown = null;
  let rawQuery: {
    agentStatus: string | null;
    agentBranch: string | null;
    stepExecutionId: string | null;
  } = {
    agentStatus: null,
    agentBranch: null,
    stepExecutionId: null,
  };

  try {
    const url = new URL(request.url);
    rawQuery = {
      agentStatus: url.searchParams.get("agentStatus"),
      agentBranch: url.searchParams.get("agentBranch"),
      stepExecutionId: url.searchParams.get("stepExecutionId"),
    };

    const rawBodyText = await request.text();
    rawBody = rawBodyText.length > 0 ? JSON.parse(rawBodyText) : {};

    const body =
      completeTicketFailingTestReproStepRequestBodySchema.parse(rawBody);
    const query =
      completeTicketFailingTestReproStepRequestQuerySchema.parse(rawQuery);

    const input = completeTicketFailingTestReproStepRequestSchema.parse({
      ...query,
      ...body,
    });

    const result = await completeTicketFailingTestReproStep(input);

    return ok(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const recoveryPayload =
        rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
          ? { ...rawBody, ...rawQuery }
          : rawQuery;

      await handleAiWebhookBadRequest(
        FAILING_TEST_REPRO_STEP_NAME,
        recoveryPayload,
      );
    }

    return toErrorResponse(error);
  }
}
