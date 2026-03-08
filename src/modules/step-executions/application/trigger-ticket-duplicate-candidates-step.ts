"use server";

import { randomUUID } from "node:crypto";
import {
  triggerTicketDuplicateCandidatesStepRequestSchema,
  triggerTicketDuplicateCandidatesStepResponseSchema,
  type TriggerTicketDuplicateCandidatesStepRequest,
  type TriggerTicketDuplicateCandidatesStepResponse,
} from "@/modules/step-executions/contracts/trigger-ticket-duplicate-candidates-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  TERMINAL_STEP_EXECUTION_STATUSES,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { TicketDuplicateSemanticSearchService } from "@/modules/step-executions/infra/ticket-duplicate-semantic-search";
import { AppContext } from "@/lib/di";
import { TicketDuplicateCandidatesStepResultEntity, TicketPipelineStepExecutionEntity } from "../domain/step-execution-entity";
import { StepExecutionRepo } from "./step-execution-repo";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { DrizzleTicketVectorRepo } from "@/modules/step-executions/infra/ticket-vector.repository";

const DUPLICATE_TOP_K = 5;
const DUPLICATE_MIN_SCORE = 0.82;

export const triggerTicketDuplicateCandidatesStep = async (
  rawInput: TriggerTicketDuplicateCandidatesStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    ticketVectorRepo,
  }: {
    ticketRepo: TicketRepo;
    stepExecutionRepo: StepExecutionRepo;
    ticketVectorRepo: DrizzleTicketVectorRepo;
  } = {
    ticketRepo: AppContext.ticketRepo,
    stepExecutionRepo: AppContext.stepExecutionRepo,
    ticketVectorRepo: AppContext.ticketVectorRepo,
  },
): Promise<TriggerTicketDuplicateCandidatesStepResponse> => {
  const input =
    triggerTicketDuplicateCandidatesStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = new Date().toISOString();
  const execution = new TicketPipelineStepExecutionEntity(
    input.ticketId,
    input.pipelineRunId,
    TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
    "running",
    `${TICKET_DUPLICATE_CANDIDATES_STEP_NAME}:${input.ticketId}:${randomUUID()}`,
    now,
  );

  let savedExecution = await stepExecutionRepo.save(execution);

  try {
    const duplicateSearchService = new TicketDuplicateSemanticSearchService();
    const embeddingContent =
      duplicateSearchService.buildEmbeddingContent(ticket);
    const embedding =
      await duplicateSearchService.createEmbedding(embeddingContent);
    await ticketVectorRepo.saveTicketEmbedding({
      ticketId: input.ticketId,
      model: duplicateSearchService.model,
      content: embeddingContent,
      embedding,
    });

    const candidates = await ticketVectorRepo.findNearestNeighbors({
      ticketId: input.ticketId,
      embedding,
      limit: DUPLICATE_TOP_K,
      minScore: DUPLICATE_MIN_SCORE,
    });

    if (savedExecution.id === undefined) {
      throw new Error("Step execution ID missing after persistence");
    }

    savedExecution = await stepExecutionRepo.save(
      new TicketDuplicateCandidatesStepResultEntity(
        savedExecution.ticketId,
        savedExecution.pipelineRunId,
        "succeeded",
        savedExecution.idempotencyKey,
        candidates.map((candidate) => ({
          candidateTicketId: candidate.candidateTicketId,
          score: candidate.score,
          status: "proposed",
        })),
        savedExecution.startedAt,
        new Date().toISOString(),
        savedExecution.createdAt,
        savedExecution.updatedAt,
        savedExecution.id,
      ),
    );
  } catch (error) {
    if (!TERMINAL_STEP_EXECUTION_STATUSES.has(savedExecution.status)) {
      await stepExecutionRepo.save(
        new TicketPipelineStepExecutionEntity(
          savedExecution.ticketId,
          savedExecution.pipelineRunId,
          savedExecution.stepName,
          "failed",
          savedExecution.idempotencyKey,
          savedExecution.startedAt,
          new Date().toISOString(),
          savedExecution.id,
          savedExecution.createdAt,
          savedExecution.updatedAt,
        ),
      );
    }
    throw error;
  }

  return triggerTicketDuplicateCandidatesStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
