import z from "zod";
import { AppContext } from "@/lib/di";
import {
  completeTicketDescriptionEnrichmentStepRequestBodySchema,
  type CompleteTicketDescriptionEnrichmentStepRequest,
} from "@/modules/step-executions/ticket_description_enrichment/contracts/complete-ticket-description-enrichment-step-contracts";
import {
  completeTicketFailingTestFixStepRequestBodySchema,
  type CompleteTicketFailingTestFixStepRequest,
} from "@/modules/step-executions/github_fix_failing_test/contracts/complete-ticket-failing-test-fix-step-contracts";
import {
  completeTicketFailingTestReproStepRequestBodySchema,
  type CompleteTicketFailingTestReproStepRequest,
} from "@/modules/step-executions/github_repro_failing_test/contracts/complete-ticket-failing-test-repro-step-contracts";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";

const webhookRepairEnvelopeSchema = z
  .object({
    ticketId: z.string().trim().min(1).optional(),
    stepExecutionId: z.string(),
    agentBranch: z.string().trim().min(1),
  })
  .loose();

type SupportedWebhookStepName =
  | typeof TICKET_INVESTIGATION_STEP_NAME
  | typeof FAILING_TEST_REPRO_STEP_NAME
  | typeof FAILING_TEST_FIX_STEP_NAME;

const normalizePayload = (
  rawPayload: unknown,
): Record<string, unknown> | undefined => {
  if (typeof rawPayload === "string") {
    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }

  if (
    rawPayload &&
    typeof rawPayload === "object" &&
    !Array.isArray(rawPayload)
  ) {
    return rawPayload as Record<string, unknown>;
  }

  return undefined;
};

const buildCorrectionInstructions = (
  stepName: SupportedWebhookStepName,
): string => {
  const webhookPayloadPath =
    stepName === TICKET_INVESTIGATION_STEP_NAME
      ? "tmp/copilot-ticket-description-enrichment-webhook-payload.json"
      : stepName === FAILING_TEST_REPRO_STEP_NAME
        ? "tmp/copilot-repro-webhook-payload.json"
        : "tmp/copilot-fix-webhook-payload.json";

  const hardcodedTicketIdAndPipelineIdSchema =
    stepName === TICKET_INVESTIGATION_STEP_NAME
      ? completeTicketDescriptionEnrichmentStepRequestBodySchema
      : stepName === FAILING_TEST_REPRO_STEP_NAME
        ? completeTicketFailingTestReproStepRequestBodySchema
        : completeTicketFailingTestFixStepRequestBodySchema;

  const jsonSchemaText = JSON.stringify(
    hardcodedTicketIdAndPipelineIdSchema.toJSONSchema(),
    null,
    2,
  );

  return `@copilot You need to use your findings from the initial creation of the PR to create a JSON payload that matches the expected schema below.

${jsonSchemaText}

Rules:
- Output the JSON payload at the specified path: ${webhookPayloadPath}.
- Output must be strict JSON (no markdown, no comments, no trailing commas).
- If a field is unknown, use the schema-compatible null value where allowed.
- Do not change unrelated repository files for this correction task.`;
};

export const handleAiWebhookBadRequest = async (
  stepName: string,
  rawPayload: unknown,
  {
    stepExecutionRepo,
    ticketRepo,
    githubService,
  }: {
    stepExecutionRepo: StepExecutionRepo;
    ticketRepo: TicketRepo;
    githubService: GithubApiService;
  } = AppContext,
): Promise<void> => {
  if (
    stepName !== TICKET_INVESTIGATION_STEP_NAME &&
    stepName !== FAILING_TEST_REPRO_STEP_NAME &&
    stepName !== FAILING_TEST_FIX_STEP_NAME
  ) {
    return;
  }

  const normalizedPayload = normalizePayload(rawPayload);
  if (!normalizedPayload) {
    return;
  }

  const parsedEnvelope =
    webhookRepairEnvelopeSchema.safeParse(normalizedPayload);
  if (!parsedEnvelope.success) {
    return;
  }

  const stepExecutionId = parsedEnvelope.data.stepExecutionId;
  if (!stepExecutionId) {
    return;
  }

  const existingExecution = await stepExecutionRepo.load(stepExecutionId);
  if (!existingExecution || existingExecution.stepName !== stepName) {
    return;
  }

  // let pipelineRun;
  // if (existingExecution.pipelineId) {
  //   pipelineRun = await pipelineRunRepo.loadById(existingExecution.pipelineId);
  // }

  const ticket = await ticketRepo.loadById(existingExecution.ticketId, {
    loadTicketGitEnvironmentAggregate: true,
  });

  if (!ticket || !ticket.ticketGitEnvironmentAggregate) {
    return;
  }

  const customInstructions = buildCorrectionInstructions(stepName);

  await githubService.commentOnPrByBranches(
    ticket.ticketGitEnvironmentAggregate.devBranch,
    parsedEnvelope.data.agentBranch,
    customInstructions,
  );
};

export type HandleAiWebhookBadRequestInput =
  | CompleteTicketDescriptionEnrichmentStepRequest
  | CompleteTicketFailingTestReproStepRequest
  | CompleteTicketFailingTestFixStepRequest;
