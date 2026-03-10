"use server";
import {
  triggerTicketDuplicateCandidatesStepRequestSchema,
  triggerTicketDuplicateCandidatesStepResponseSchema,
  type TriggerTicketDuplicateCandidatesStepRequest,
  type TriggerTicketDuplicateCandidatesStepResponse,
} from "@/modules/step-executions/ticket_duplicate_candidates/contracts/trigger-ticket-duplicate-candidates-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  TERMINAL_STEP_EXECUTION_STATUSES,
} from "@/modules/step-executions/domain/step-execution.types";
import { TicketDuplicateSemanticSearchService } from "@/modules/step-executions/ticket_duplicate_candidates/infra/ticket-duplicate-semantic-search";
import { AppContext } from "@/lib/di";
import {
  TicketDuplicateCandidateResultItemEntity,
  TicketDuplicateCandidatesResultEntity,
  TicketDuplicateCandidatesStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import type { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import type { DrizzleTicketVectorRepo } from "@/modules/step-executions/ticket_duplicate_candidates/infra/ticket-vector.repository";

const DUPLICATE_TOP_K = 5;
const DUPLICATE_MIN_SCORE = 0.82;

export const triggerTicketDuplicateCandidatesStep = async (
  rawInput: TriggerTicketDuplicateCandidatesStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    ticketVectorRepo,
  }: {
    ticketRepo: Pick<TicketRepo, "loadById">;
    stepExecutionRepo: StepExecutionRepo;
    ticketVectorRepo: Pick<
      DrizzleTicketVectorRepo,
      "saveTicketEmbedding" | "findNearestNeighbors"
    >;
  } = AppContext,
): Promise<TriggerTicketDuplicateCandidatesStepResponse> => {
  const input =
    triggerTicketDuplicateCandidatesStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = AppContext.timeProvider.nowIso();
  const execution = new TicketDuplicateCandidatesStepResultEntity(
    input.ticketId,
    input.ticketId,
    "running",
    null,
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

    savedExecution.setResult({
      status: "succeeded",
      endedAt: AppContext.timeProvider.nowIso(),
      result: new TicketDuplicateCandidatesResultEntity(
        candidates.map(
          (candidate) =>
            new TicketDuplicateCandidateResultItemEntity(
              candidate.candidateTicketId,
              candidate.score,
            ),
        ),
        [],
        [],
      ),
    });
    savedExecution = await stepExecutionRepo.save(savedExecution);
  } catch (error) {
    if (!TERMINAL_STEP_EXECUTION_STATUSES.has(savedExecution.status)) {
      savedExecution.setResult({
        status: "failed",
        endedAt: AppContext.timeProvider.nowIso(),
      });
      await stepExecutionRepo.save(savedExecution);
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
