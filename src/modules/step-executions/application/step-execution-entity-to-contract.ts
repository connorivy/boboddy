import {
  stepExecutionContractSchema,
  type StepExecutionContract,
} from "@/modules/step-executions/contracts/step-execution-contracts";
import {
  getStepExecutionDefinitionForExecution,
} from "@/modules/step-executions/domain/step-execution-registry";
import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";

export const stepExecutionEntityToContract = (
  stepExecution: TicketPipelineStepExecutionEntity,
): StepExecutionContract => {
  if (
    stepExecution.createdAt === undefined ||
    stepExecution.updatedAt === undefined
  ) {
    throw new Error(
      "Cannot map step execution to contract without persistence metadata",
    );
  }

  const definition = getStepExecutionDefinitionForExecution(stepExecution);

  return stepExecutionContractSchema.parse({
    id: stepExecution.id,
    pipelineId: stepExecution.pipelineId,
    ticketId: stepExecution.ticketId,
    stepName: stepExecution.stepName,
    status: stepExecution.status,
    startedAt: stepExecution.startedAt,
    endedAt: stepExecution.endedAt ?? null,
    createdAt: stepExecution.createdAt,
    updatedAt: stepExecution.updatedAt,
    failureReason: stepExecution.failureReason ?? null,
    result: definition.mapResultToContract(stepExecution as never),
  });
};
