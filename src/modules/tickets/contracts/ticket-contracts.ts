import { z } from "zod";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  STEP_EXECUTION_STATUSES,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import { ticketGitEnvironmentResponseSchema } from "@/modules/environments/contracts/environment-contracts";

export const ticketStatusSchema = z.enum([
  "needs_more_information",
  "needs_triage",
  "triaged_backlog",
  "in_progress",
  "ops_resolution_needed",
  "done",
]);

export const ticketPrioritySchema = z.enum([
  "lowest",
  "low",
  "medium",
  "high",
  "highest",
]);

export const ticketTypeSchema = z.enum([
  "bug",
  "manual support",
  "enhancement",
  "report request",
]);

export const ticketStepNameSchema = z.enum([
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  FAILING_TEST_FIX_STEP_NAME,
]);

export const stepExecutionStatusSchema = z.enum(STEP_EXECUTION_STATUSES);
export const ticketSortBySchema = z.enum([
  "updated_at_desc",
  "description_score_desc",
]);

export const ticketPipelineStepExecutionSchema = stepExecutionContractSchema.omit({
  pipelineRunId: true,
});

export const ticketSchema = z.object({
  id: z.string().min(1),
  ticketNumber: z.string().min(1),
  title: z.string().min(1),
  slackThread: z.string().url().nullable(),
  status: ticketStatusSchema,
  description: z.string().min(1),
  companyNames: z.array(z.string().min(1)).default([]),
  employeeEmails: z.array(z.email()).default([]),
  priority: ticketPrioritySchema,
  ticketType: ticketTypeSchema,
  dueDate: z.iso.date().nullable(),
  reporter: z.string().min(1),
  assignee: z.string().min(1).nullable(),
  jiraCreatedAt: z.iso.datetime().nullable(),
  jiraUpdatedAt: z.iso.datetime().nullable(),
  pipelineSteps: z.array(ticketPipelineStepExecutionSchema).optional(),
  defaultGitEnvironmentId: z.number().int().positive().optional(),
  defaultGitEnvironment: ticketGitEnvironmentResponseSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ticketIngestSchema = ticketSchema
  .omit({
    id: true,
    pipelineSteps: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    jiraCreatedAt: z.iso.datetime().nullable().default(null),
    jiraUpdatedAt: z.iso.datetime().nullable().default(null),
  });

export const ingestTicketsRequestSchema = z.object({
  tickets: z.array(ticketIngestSchema).min(1),
});

export const jiraBatchIngestRequestSchema = z.object({
  ticketNumber: z
    .string()
    .trim()
    .regex(/^CV-.+$/i),
});

export const jiraModifiedSinceIngestRequestSchema = z.object({
  since: z.iso.date(),
});

export const jiraBoardIngestRequestSchema = z.object({
  boardId: z.coerce.number().int().positive(),
  since: z.iso.date().optional(),
});

export const ticketSearchQuerySchema = z
  .object({
    q: z.string().optional(),
    status: ticketStatusSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    stepName: ticketStepNameSchema.optional(),
    stepExecutionStatus: stepExecutionStatusSchema.optional(),
    sortBy: ticketSortBySchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (query) =>
      (query.stepName === undefined &&
        query.stepExecutionStatus === undefined) ||
      (query.stepName !== undefined && query.stepExecutionStatus !== undefined),
    {
      message: "stepName and stepExecutionStatus must be provided together",
      path: ["stepName"],
    },
  );

export const paginatedTicketsResponseSchema = z.object({
  items: z.array(ticketSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const ticketStepExecutionSchema = ticketPipelineStepExecutionSchema;

export const ticketPipelineStatusSchema = z.object({
  stepExecutions: z.array(ticketStepExecutionSchema),
});

export const ticketDetailResponseSchema = z.object({
  ticket: ticketSchema,
  pipeline: ticketPipelineStatusSchema,
});

export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type TicketType = z.infer<typeof ticketTypeSchema>;
export type TicketStepName = z.infer<typeof ticketStepNameSchema>;
export type StepExecutionStatus = z.infer<typeof stepExecutionStatusSchema>;
export type TicketSortBy = z.infer<typeof ticketSortBySchema>;
export type TicketPipelineStepExecutionEntity = z.infer<
  typeof ticketPipelineStepExecutionSchema
>;
export type TicketContract = z.infer<typeof ticketSchema>;
export type TicketIngestInput = z.infer<typeof ticketIngestSchema>;
export type IngestTicketsRequest = z.infer<typeof ingestTicketsRequestSchema>;
export type JiraBatchIngestRequest = z.infer<
  typeof jiraBatchIngestRequestSchema
>;
export type JiraModifiedSinceIngestRequest = z.infer<
  typeof jiraModifiedSinceIngestRequestSchema
>;
export type JiraBoardIngestRequest = z.infer<
  typeof jiraBoardIngestRequestSchema
>;
export type TicketSearchQuery = z.infer<typeof ticketSearchQuerySchema>;
export type PaginatedTicketsResponse = z.infer<
  typeof paginatedTicketsResponseSchema
>;
export type TicketStepExecution = z.infer<typeof ticketStepExecutionSchema>;
export type TicketDetailResponse = z.infer<typeof ticketDetailResponseSchema>;
