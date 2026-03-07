"use server";

import { AppContext } from "@/lib/di";
import type { TicketGitEnvironmentResponse } from "@/modules/environments/contracts/environment-contracts";
import type { TicketGitEnvironmentRepo } from "./ticket-git-environment-repo";
import { ticketGitEnvironmentAggregateToContract } from "./ticket-git-environment-aggregate-to-contract";

export async function getTicketGitEnvironments(
  ticketId: string,
  {
    ticketGitEnvironmentRepo,
  }: {
    ticketGitEnvironmentRepo: TicketGitEnvironmentRepo;
  } = AppContext,
): Promise<TicketGitEnvironmentResponse[]> {
  const environments = await ticketGitEnvironmentRepo.loadManyByTicketId(ticketId);
  return environments.map(ticketGitEnvironmentAggregateToContract);
}
