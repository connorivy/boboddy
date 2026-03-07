import {
  ticketGitEnvironmentResponseSchema,
  type TicketGitEnvironmentResponse,
} from "@/modules/environments/contracts/environment-contracts";
import type { TicketGitEnvironmentAggregate } from "@/modules/environments/domain/ticket-git-environment-aggregate";

export const ticketGitEnvironmentAggregateToContract = (
  ticketGitEnvironment: TicketGitEnvironmentAggregate,
): TicketGitEnvironmentResponse => {
  if (ticketGitEnvironment.id === undefined) {
    throw new Error(
      "Ticket git environment aggregate must have persistence metadata to be converted to contract",
    );
  }

  return ticketGitEnvironmentResponseSchema.parse({
    id: ticketGitEnvironment.id,
    ticketId: ticketGitEnvironment.ticketId,
    baseEnvironmentId: ticketGitEnvironment.baseEnvironmentId,
    devBranch: ticketGitEnvironment.devBranch,
  });
};
