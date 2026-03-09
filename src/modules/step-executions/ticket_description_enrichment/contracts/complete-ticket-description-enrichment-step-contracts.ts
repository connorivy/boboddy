import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import { agentStatusEnum } from "@/modules/step-executions/github_repro_failing_test/contracts/complete-ticket-failing-test-repro-step-contracts";
import {
  ticketDescriptionEnrichmentEvidenceFieldsSchema,
} from "@/modules/step-executions/ticket_description_enrichment/shared/ticket-description-enrichment-result";

export const completeTicketDescriptionEnrichmentStepRequestBodySchema =
  ticketDescriptionEnrichmentEvidenceFieldsSchema.extend({
    ticketId: z.string().trim().min(1),
    pipelineId: z.string().uuid(),
    operationOutcome: z.enum([
      "enriched",
      "insufficient_evidence",
      "agent_error",
      "cancelled",
    ]),
    summaryOfEnrichment: z.string().trim().min(1).max(4000),
    enrichedTicketDescription: z.string().trim().min(1).max(20000),
    confidenceLevel: z.number().min(0).max(1).nullable(),
    rawResultJson: z.record(z.string(), z.unknown()).default({}),
  });

export const completeTicketDescriptionEnrichmentStepRequestQuerySchema =
  z.object({
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
