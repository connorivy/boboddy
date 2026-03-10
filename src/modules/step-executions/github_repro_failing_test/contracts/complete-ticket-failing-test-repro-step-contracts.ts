import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const agentStatusEnum = z.enum([
  "complete",
  "error",
  "abort",
  "timeout",
  "user_exit",
]);

export const failingTestReproFeedbackRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
  questions: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(10),
});

const completeTicketFailingTestReproStepBaseBodySchema = z.object({
  summaryOfFindings: z.string().trim().min(1).max(2000),
});

const reproducedRequestBodySchema =
  completeTicketFailingTestReproStepBaseBodySchema.extend({
    reproduceOperationOutcome: z.literal("reproduced"),
    confidenceLevel: z.number().min(0).max(1),
    failingTestPaths: z.array(z.string().trim().min(1)).min(1),
    feedbackRequest: z.null(),
  });

const notReproducibleRequestBodySchema =
  completeTicketFailingTestReproStepBaseBodySchema.extend({
    reproduceOperationOutcome: z.literal("not_reproducible"),
    confidenceLevel: z.number().min(0).max(1),
    failingTestPaths: z.null(),
    feedbackRequest: z.null(),
  });

const needsUserFeedbackRequestBodySchema =
  completeTicketFailingTestReproStepBaseBodySchema.extend({
    reproduceOperationOutcome: z.literal("needs_user_feedback"),
    confidenceLevel: z.null(),
    failingTestPaths: z.null(),
    feedbackRequest: failingTestReproFeedbackRequestSchema,
  });

const agentErrorRequestBodySchema =
  completeTicketFailingTestReproStepBaseBodySchema.extend({
    reproduceOperationOutcome: z.literal("agent_error"),
    confidenceLevel: z.null(),
    failingTestPaths: z.null(),
    feedbackRequest: z.null(),
  });

const cancelledRequestBodySchema =
  completeTicketFailingTestReproStepBaseBodySchema.extend({
    reproduceOperationOutcome: z.literal("cancelled"),
    confidenceLevel: z.null(),
    failingTestPaths: z.null(),
    feedbackRequest: z.null(),
  });

export const completeTicketFailingTestReproStepRequestBodySchema =
  z.discriminatedUnion("reproduceOperationOutcome", [
    reproducedRequestBodySchema,
    notReproducibleRequestBodySchema,
    needsUserFeedbackRequestBodySchema,
    agentErrorRequestBodySchema,
    cancelledRequestBodySchema,
  ]);

export const completeTicketFailingTestReproStepRequestQuerySchema = z.object({
  agentStatus: agentStatusEnum,
  agentBranch: z.string().trim().min(1),
  stepExecutionId: z.string(),
});
export const completeTicketFailingTestReproStepRequestSchema =
  completeTicketFailingTestReproStepRequestBodySchema.and(
    completeTicketFailingTestReproStepRequestQuerySchema,
  );

export const completeTicketFailingTestReproStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type CompleteTicketFailingTestReproStepRequest = z.infer<
  typeof completeTicketFailingTestReproStepRequestSchema
>;

export type CompleteTicketFailingTestReproStepResponse = z.infer<
  typeof completeTicketFailingTestReproStepResponseSchema
>;
