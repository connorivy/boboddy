import { z } from "zod";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";

export const sandboxWebhookTargetSchema = z.object({
  url: z.string().url(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  query: z.object({
    stepExecutionId: z.string().min(1),
  }),
});

export const sandboxAgentRunRequestSchema = z.object({
  repository: z.string().trim().min(1),
  stepExecutionId: z.string().trim().min(1),
  stepName: z.union([
    z.literal(TICKET_INVESTIGATION_STEP_NAME),
    z.literal(FAILING_TEST_REPRO_STEP_NAME),
    z.literal(FAILING_TEST_FIX_STEP_NAME),
  ]),
  ticketId: z.string().trim().min(1),
  pipelineId: z.string().trim().min(1).nullable(),
  issueNumber: z.number().int(),
  baseBranch: z.string().trim().min(1),
  customInstructions: z.string().trim().min(1),
  customAgent: z.string().trim().min(1).optional(),
  callback: sandboxWebhookTargetSchema,
});

export const sandboxAgentRunResponseSchema = z.object({
  runId: z.string().trim().min(1).nullable().optional(),
});

export type SandboxWebhookTarget = z.infer<typeof sandboxWebhookTargetSchema>;
export type SandboxAgentRunRequest = z.infer<
  typeof sandboxAgentRunRequestSchema
>;
export type SandboxAgentRunResponse = z.infer<
  typeof sandboxAgentRunResponseSchema
>;
