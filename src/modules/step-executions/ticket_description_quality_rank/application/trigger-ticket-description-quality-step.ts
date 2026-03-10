import {
  triggerTicketDescriptionQualityStepRequestSchema,
  triggerTicketDescriptionQualityStepResponseSchema,
  type TriggerTicketDescriptionQualityStepRequest,
  type TriggerTicketDescriptionQualityStepResponse,
} from "@/modules/step-executions/ticket_description_quality_rank/contracts/trigger-ticket-description-quality-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import { CodexCliTicketDescriptionQualityAi } from "@/modules/step-executions/ticket_description_quality_rank/infra/ticket-description-quality-ai";
import { AppContext } from "@/lib/di";
import type { TimeProvider } from "@/lib/time-provider";
import {
  TicketDescriptionQualityStepExecutionEntity,
  TicketDescriptionQualityStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import type { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export const triggerTicketDescriptionQualityStep = async (
  rawInput: TriggerTicketDescriptionQualityStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    timeProvider,
  }: {
    ticketRepo: Pick<TicketRepo, "loadById">;
    stepExecutionRepo: StepExecutionRepo;
    timeProvider: TimeProvider;
  } = AppContext,
): Promise<TriggerTicketDescriptionQualityStepResponse> => {
  const input =
    triggerTicketDescriptionQualityStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = timeProvider.now();
  const execution = new TicketDescriptionQualityStepExecutionEntity(
    null,
    input.ticketId,
    "running",
    null,
    now,
  );

  await stepExecutionRepo.save(execution);

  try {
    const aiResult =
      await new CodexCliTicketDescriptionQualityAi().rankTicketDescription({
        title: ticket.title,
        description: ticket.description,
      });

    execution.setResult({
      status: "succeeded",
      endedAt: timeProvider.now(),
      result: new TicketDescriptionQualityStepResultEntity(
        aiResult.stepsToReproduceScore,
        aiResult.expectedBehaviorScore,
        aiResult.observedBehaviorScore,
        aiResult.reasoning,
        aiResult.rawResponse,
      ),
    });

    await stepExecutionRepo.save(execution);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    execution.setResult({
      status: "failed",
      endedAt: timeProvider.now(),
      failureReason: errorMessage,
    });
    await stepExecutionRepo.save(execution);
    throw error;
  }

  return triggerTicketDescriptionQualityStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(execution),
    },
  });
};
