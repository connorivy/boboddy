import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import { agentStatusEnum } from "@/modules/step-executions/github_repro_failing_test/contracts/complete-ticket-failing-test-repro-step-contracts";

export const completeTicketFailingTestFixStepRequestBodySchema = z.object({
  ticketId: z.string().trim().min(1),
  pipelineId: z.string().uuid(),
  fixOperationOutcome: z.enum([
    "fixed",
    "not_fixed",
    "agent_error",
    "cancelled",
  ]),
  summaryOfFix: z.string().trim().min(1).max(2000),
  fixConfidenceLevel: z.number().min(0).max(1).nullable(),
  fixedTestPath: z.string().trim().min(1).nullable(),
});

export const completeTicketFailingTestFixStepRequestQuerySchema = z.object({
  agentStatus: agentStatusEnum,
  agentBranch: z.string().trim().min(1),
  pipelineId: z.string(),
});

export const completeTicketFailingTestFixStepRequestSchema =
  completeTicketFailingTestFixStepRequestBodySchema.extend(
    completeTicketFailingTestFixStepRequestQuerySchema.shape,
  );

export const completeTicketFailingTestFixStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type CompleteTicketFailingTestFixStepRequest = z.infer<
  typeof completeTicketFailingTestFixStepRequestSchema
>;

export type CompleteTicketFailingTestFixStepResponse = z.infer<
  typeof completeTicketFailingTestFixStepResponseSchema
>;
