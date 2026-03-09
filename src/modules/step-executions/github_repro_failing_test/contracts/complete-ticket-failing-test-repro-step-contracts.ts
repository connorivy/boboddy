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

export const completeTicketFailingTestReproStepRequestBodySchema = z.object({
  reproduceOperationOutcome: z.enum([
    "reproduced",
    "not_reproducible",
    "needs_user_feedback",
    "agent_error",
    "cancelled",
  ]),
  summaryOfFindings: z.string().trim().min(1).max(2000),
  confidenceLevel: z.number().min(0).max(1).nullable(),
  failingTestPaths: z.array(z.string().trim().min(1)).min(1).nullable(),
  feedbackRequest: failingTestReproFeedbackRequestSchema.nullable(),
});
export const completeTicketFailingTestReproStepRequestQuerySchema = z.object({
  agentStatus: agentStatusEnum,
  agentBranch: z.string().trim().min(1),
  pipelineId: z.string(),
});
export const completeTicketFailingTestReproStepRequestSchema =
  completeTicketFailingTestReproStepRequestBodySchema
    .extend(completeTicketFailingTestReproStepRequestQuerySchema.shape)
    .superRefine((value, ctx) => {
      if (
        value.reproduceOperationOutcome === "reproduced" &&
        (!value.failingTestPaths || value.failingTestPaths.length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["failingTestPaths"],
          message:
            "failingTestPaths must include at least one path when outcome is reproduced",
        });
      }

      if (
        value.reproduceOperationOutcome === "needs_user_feedback" &&
        !value.feedbackRequest
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["feedbackRequest"],
          message:
            "feedbackRequest must be provided when outcome is needs_user_feedback",
        });
      }

      if (
        value.reproduceOperationOutcome !== "needs_user_feedback" &&
        value.feedbackRequest !== null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["feedbackRequest"],
          message:
            "feedbackRequest must be null unless outcome is needs_user_feedback",
        });
      }
    });

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
