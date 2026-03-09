import { z } from "zod";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { ticketDescriptionEnrichmentEvidenceFieldsSchema } from "@/modules/step-executions/ticket_description_enrichment/shared/ticket-description-enrichment-result";

const uuidV7Schema = z
  .string()
  .uuid()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

export const ticketDescriptionQualityResultContractSchema = z.object({
  executionId: uuidV7Schema,
  stepName: z.literal(TICKET_DESCRIPTION_QUALITY_STEP_NAME),
  stepsToReproduceScore: z.number().min(0).max(1),
  expectedBehaviorScore: z.number().min(0).max(1),
  observedBehaviorScore: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  rawResponse: z.string().min(1),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});

export const ticketDescriptionEnrichmentResultContractSchema =
  ticketDescriptionEnrichmentEvidenceFieldsSchema.extend({
    executionId: uuidV7Schema,
    stepName: z.literal(TICKET_INVESTIGATION_STEP_NAME),
    summaryOfInvestigation: z.string().min(1),
    investigationReport: z.string().min(1),
    confidenceLevel: z.number().min(0).max(1).nullable(),
    agentStatus: z.enum(["complete", "error", "abort", "timeout", "user_exit"]),
    agentBranch: z.string().min(1),
    operationOutcome: z.enum([
      "findings_recorded",
      "inconclusive",
      "agent_error",
      "cancelled",
    ]),
    rawResultJson: z.record(z.string(), z.unknown()),
    createdAt: z.iso.datetime().optional(),
    updatedAt: z.iso.datetime().optional(),
  });

export const duplicateCandidateResultContractSchema = z.object({
  candidateTicketId: z.string().min(1),
  score: z.number().min(0).max(1),
});

export const ticketDuplicateCandidatesStepResultContractSchema = z.object({
  executionId: uuidV7Schema,
  stepName: z.literal(TICKET_DUPLICATE_CANDIDATES_STEP_NAME),
  proposed: z.array(duplicateCandidateResultContractSchema),
  dismissed: z.array(duplicateCandidateResultContractSchema),
  promoted: z.array(duplicateCandidateResultContractSchema),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});

export const failingTestReproStepResultContractSchema = z.object({
  executionId: uuidV7Schema,
  stepName: z.literal(FAILING_TEST_REPRO_STEP_NAME),
  githubIssueNumber: z.number().int().nullable(),
  githubIssueId: z.string().nullable(),
  githubAgentRunId: z.string().nullable(),
  githubMergeStatus: z.enum(["draft", "open", "closed", "merged"]),
  githubPrTargetBranch: z.string().nullable(),
  agentStatus: z
    .enum(["complete", "error", "abort", "timeout", "user_exit"])
    .nullable(),
  agentBranch: z.string().nullable(),
  failingTestPaths: z.array(z.string()).nullable(),
  failingTestCommitSha: z.string().nullable(),
  outcome: z
    .enum([
      "reproduced",
      "not_reproducible",
      "needs_user_feedback",
      "agent_error",
      "cancelled",
    ])
    .nullable(),
  summaryOfFindings: z.string().nullable(),
  confidenceLevel: z.number().min(0).max(1).nullable(),
  feedbackRequest: z
    .object({
      requestId: z.string().min(1),
      reason: z.string().min(1),
      questions: z.array(z.string().min(1)),
      assumptions: z.array(z.string().min(1)),
    })
    .nullable(),
  failureReason: z.string().nullable(),
  rawResultJson: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});

export const failingTestFixStepResultContractSchema = z.object({
  executionId: uuidV7Schema,
  stepName: z.literal(FAILING_TEST_FIX_STEP_NAME),
  githubIssueNumber: z.number().int().nullable(),
  githubIssueId: z.string().nullable(),
  githubAgentRunId: z.string().nullable(),
  githubMergeStatus: z.enum(["draft", "open", "closed", "merged"]),
  githubPrTargetBranch: z.string().nullable(),
  agentStatus: z
    .enum(["complete", "error", "abort", "timeout", "user_exit"])
    .nullable(),
  agentBranch: z.string().nullable(),
  agentSummary: z.string().nullable(),
  fixedTestPath: z.string().nullable(),
  failingTestCommitSha: z.string().optional().nullable(),
  fixOperationOutcome: z
    .enum(["fixed", "not_fixed", "agent_error", "cancelled"])
    .nullable(),
  summaryOfFix: z.string().nullable(),
  fixConfidenceLevel: z.number().min(0).max(1).nullable(),
  failureReason: z.string().nullable(),
  rawResultJson: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});

export const stepExecutionResultContractSchema = z.union([
  ticketDescriptionQualityResultContractSchema,
  ticketDescriptionEnrichmentResultContractSchema,
  ticketDuplicateCandidatesStepResultContractSchema,
  failingTestReproStepResultContractSchema,
  failingTestFixStepResultContractSchema,
]);

export const stepExecutionStatusEnumSchema = z.enum([
  "not_started",
  "queued",
  "running",
  "waiting_for_user_feedback",
  "succeeded",
  "failed",
  "skipped",
  "failed_timeout",
]);

export const stepExecutionContractSchema = z.object({
  id: uuidV7Schema,
  pipelineId: z.string().min(1).nullable(),
  ticketId: z.string().min(1),
  stepName: z.string().min(1),
  status: stepExecutionStatusEnumSchema,
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  failureReason: z.string().nullable(),
  result: stepExecutionResultContractSchema.nullable(),
});

export type StepExecutionStatus = z.infer<typeof stepExecutionStatusEnumSchema>;

export type TicketDescriptionQualityResultContract = z.infer<
  typeof ticketDescriptionQualityResultContractSchema
>;
export type TicketDescriptionEnrichmentResultContract = z.infer<
  typeof ticketDescriptionEnrichmentResultContractSchema
>;

export type DuplicateCandidateResultContract = z.infer<
  typeof duplicateCandidateResultContractSchema
>;

export type TicketDuplicateCandidatesStepResultContract = z.infer<
  typeof ticketDuplicateCandidatesStepResultContractSchema
>;

export type FailingTestReproStepResultContract = z.infer<
  typeof failingTestReproStepResultContractSchema
>;

export type FailingTestFixStepResultContract = z.infer<
  typeof failingTestFixStepResultContractSchema
>;

export type StepExecutionContract = z.infer<typeof stepExecutionContractSchema>;
