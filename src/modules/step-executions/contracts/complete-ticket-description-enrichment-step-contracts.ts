import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import { agentStatusEnum } from "@/modules/step-executions/contracts/complete-ticket-failing-test-repro-step-contracts";

export const completeTicketDescriptionEnrichmentStepRequestBodySchema = z.object({
  ticketId: z.string().trim().min(1),
  pipelineId: z.coerce.number().int().positive(),
  operationOutcome: z.enum([
    "enriched",
    "insufficient_evidence",
    "agent_error",
    "cancelled",
  ]),
  summaryOfEnrichment: z.string().trim().min(1).max(4000),
  enrichedTicketDescription: z.string().trim().min(1).max(20000),
  confidenceLevel: z.number().min(0).max(1).nullable(),
  datadogQueryTerms: z.array(z.string().trim().min(1)).max(100),
  datadogTimeRange: z.string().trim().min(1).max(200).nullable(),
  keyIdentifiers: z.array(z.string().trim().min(1)).max(100),
  rawResultJson: z.record(z.string(), z.unknown()).default({}),
});

export const completeTicketDescriptionEnrichmentStepRequestQuerySchema = z.object({
  agentStatus: agentStatusEnum,
  agentBranch: z.string().trim().min(1),
});

export const completeTicketDescriptionEnrichmentStepRequestSchema =
  completeTicketDescriptionEnrichmentStepRequestBodySchema.extend(
    completeTicketDescriptionEnrichmentStepRequestQuerySchema.shape,
  );

export const completeTicketDescriptionEnrichmentStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type CompleteTicketDescriptionEnrichmentStepRequest = z.infer<
  typeof completeTicketDescriptionEnrichmentStepRequestSchema
>;

export type CompleteTicketDescriptionEnrichmentStepResponse = z.infer<
  typeof completeTicketDescriptionEnrichmentStepResponseSchema
>;
