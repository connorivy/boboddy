"use server";

import z from "zod";
import { AppContext } from "@/lib/di";
import {
  completeTicketDescriptionEnrichmentStepRequestBodySchema,
  type CompleteTicketDescriptionEnrichmentStepRequest,
} from "@/modules/step-executions/contracts/complete-ticket-description-enrichment-step-contracts";
import {
  completeTicketFailingTestFixStepRequestBodySchema,
  type CompleteTicketFailingTestFixStepRequest,
} from "@/modules/step-executions/contracts/complete-ticket-failing-test-fix-step-contracts";
import {
  completeTicketFailingTestReproStepRequestBodySchema,
  type CompleteTicketFailingTestReproStepRequest,
} from "@/modules/step-executions/contracts/complete-ticket-failing-test-repro-step-contracts";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import {
  TicketDescriptionEnrichmentStepExecutionEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestReproStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";

const webhookRepairEnvelopeSchema = z
  .object({
    ticketId: z.string().trim().min(1).optional(),
    pipelineId: z.coerce.number().int().positive().optional(),
    agentBranch: z.string().trim().min(1).optional(),
  })
  .passthrough();

type SupportedWebhookStepName =
  | typeof TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME
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

  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    return rawPayload as Record<string, unknown>;
  }

  return undefined;
};

const buildCorrectionInstructions = (
  stepName: SupportedWebhookStepName,
  ticketId: string,
  pipelineId: number,
  rawPayload: Record<string, unknown>,
): string => {
  const webhookPayloadPath =
    stepName === TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME
      ? "tmp/copilot-ticket-description-enrichment-webhook-payload.json"
      : stepName === FAILING_TEST_REPRO_STEP_NAME
      ? "tmp/copilot-repro-webhook-payload.json"
      : "tmp/copilot-fix-webhook-payload.json";
  const hardcodedTicketIdAndPipelineIdSchema =
    stepName === TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME
      ? completeTicketDescriptionEnrichmentStepRequestBodySchema
          .omit({
            ticketId: true,
            pipelineId: true,
          })
          .extend({
            ticketId: z.literal(ticketId),
            pipelineId: z.literal(pipelineId),
          })
      : stepName === FAILING_TEST_REPRO_STEP_NAME
      ? completeTicketFailingTestReproStepRequestBodySchema
          .omit({
            ticketId: true,
            pipelineId: true,
          })
          .extend({
            ticketId: z.literal(ticketId),
            pipelineId: z.literal(pipelineId),
          })
      : completeTicketFailingTestFixStepRequestBodySchema
          .omit({
            ticketId: true,
            pipelineId: true,
          })
          .extend({
            ticketId: z.literal(ticketId),
            pipelineId: z.literal(pipelineId),
          });

  const jsonSchemaText = JSON.stringify(
    hardcodedTicketIdAndPipelineIdSchema.toJSONSchema(),
    null,
    2,
  );

  const rawPayloadText = JSON.stringify(rawPayload, null, 2);

  return `The webhook payload JSON for step "${stepName}" was rejected because it did not match the required schema.

Goal:
- Produce a corrected JSON payload with the same intent as the previous output.
- Keep ticketId and pipelineId unchanged.
- Overwrite ${webhookPayloadPath} with valid JSON matching this schema exactly.

Rejected payload:
${rawPayloadText}

Required schema:
${jsonSchemaText}

Rules:
- Output must be strict JSON (no markdown, no comments, no trailing commas).
- If a field is unknown, use the schema-compatible null value where allowed.
- Do not change unrelated repository files for this correction task.`;
};

const getExecutionBranch = (
  pipeline: unknown,
): string | undefined => {
  if (pipeline instanceof TicketDescriptionEnrichmentStepExecutionEntity) {
    return pipeline.result?.agentBranch?.trim() || undefined;
  }

  if (pipeline instanceof FailingTestReproStepExecutionEntity) {
    return pipeline.result?.githubPrTargetBranch?.trim() || undefined;
  }

  if (pipeline instanceof FailingTestFixStepExecutionEntity) {
    return pipeline.result?.githubPrTargetBranch?.trim() || undefined;
  }

  return undefined;
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
    githubService: Pick<GithubApiService, "assignCopilot" | "unassignCopilot">;
  } = AppContext,
): Promise<void> => {
  if (
    stepName !== TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME &&
    stepName !== FAILING_TEST_REPRO_STEP_NAME &&
    stepName !== FAILING_TEST_FIX_STEP_NAME
  ) {
    return;
  }

  const normalizedPayload = normalizePayload(rawPayload);
  if (!normalizedPayload) {
    return;
  }

  const parsedEnvelope = webhookRepairEnvelopeSchema.safeParse(normalizedPayload);
  if (!parsedEnvelope.success) {
    return;
  }

  const pipelineId = parsedEnvelope.data.pipelineId;
  if (!pipelineId) {
    return;
  }

  const existingExecution = await stepExecutionRepo.load(pipelineId);
  if (!existingExecution || existingExecution.stepName !== stepName) {
    return;
  }

  const ticketId = parsedEnvelope.data.ticketId ?? existingExecution.ticketId;
  if (!ticketId) {
    return;
  }

  if (existingExecution.ticketId !== ticketId) {
    return;
  }

  const ticket = await ticketRepo.loadById(ticketId, {
    loadGithubIssue: true,
  });
  if (!ticket?.githubIssue) {
    return;
  }

  let branchFromExecution: string | undefined;
  if (existingExecution instanceof FailingTestReproStepExecutionEntity) {
    branchFromExecution = getExecutionBranch(existingExecution);
  }
  if (existingExecution instanceof TicketDescriptionEnrichmentStepExecutionEntity) {
    branchFromExecution = getExecutionBranch(existingExecution);
  }
  if (existingExecution instanceof FailingTestFixStepExecutionEntity) {
    branchFromExecution = getExecutionBranch(existingExecution);
  }

  const baseBranch =
    parsedEnvelope.data.agentBranch ?? branchFromExecution ?? undefined;
  if (!baseBranch) {
    return;
  }

  const customInstructions = buildCorrectionInstructions(
    stepName,
    ticketId,
    pipelineId,
    normalizedPayload,
  );

  await githubService.unassignCopilot(ticket.githubIssue.githubIssueNumber);
  await githubService.assignCopilot({
    issueNumber: ticket.githubIssue.githubIssueNumber,
    baseBranch,
    customInstructions,
  });
};

export type HandleAiWebhookBadRequestInput =
  | CompleteTicketDescriptionEnrichmentStepRequest
  | CompleteTicketFailingTestReproStepRequest
  | CompleteTicketFailingTestFixStepRequest;
