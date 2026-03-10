import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import {
  TicketContract,
  TicketPipelineStepExecutionEntity as TicketPipelineStepExecutionContract,
} from "../contracts/ticket-contracts";
import { TicketAggregate } from "../domain/ticket-aggregate";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import { ticketGitEnvironmentAggregateToContract } from "@/modules/environments/application/ticket-git-environment-aggregate-to-contract";

const mapPipelineStepToContract = (
  step: TicketPipelineStepExecutionEntity,
): TicketPipelineStepExecutionContract => stepExecutionEntityToContract(step);

export function ticketAggregateToContract(
  ticket: TicketAggregate,
): TicketContract {
  if (!ticket.id || !ticket.createdAt || !ticket.updatedAt) {
    throw new Error(
      "TicketAggregate must have persistence metadata to be converted to TicketContract",
    );
  }
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    slackThread: ticket.slackThread,
    status: ticket.status,
    description: ticket.description,
    companyNames: [...ticket.companyNames],
    employeeEmails: [...ticket.employeeEmails],
    priority: ticket.priority,
    ticketType: ticket.ticketType,
    dueDate: ticket.dueDate,
    reporter: ticket.reporter,
    assignee: ticket.assignee,
    jiraCreatedAt: ticket.jiraCreatedAt?.toISOString() ?? null,
    jiraUpdatedAt: ticket.jiraUpdatedAt?.toISOString() ?? null,
    defaultGitEnvironmentId: ticket.defaultGitEnvironmentId,
    defaultGitEnvironment: ticket.ticketGitEnvironmentAggregate
      ? ticketGitEnvironmentAggregateToContract(
          ticket.ticketGitEnvironmentAggregate,
        )
      : undefined,
    pipelineSteps: ticket.pipelineSteps?.map(mapPipelineStepToContract),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}
