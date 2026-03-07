"use server";

import { AppContext } from "@/lib/di";
import {
  AssignEnvironmentRequest,
  assignEnvironmentRequestSchema,
} from "@/modules/environments/contracts/environment-contracts";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { ticketAggregateToContract } from "@/modules/tickets/application/ticket-aggregate-to-contract";
import { TicketContract } from "@/modules/tickets/contracts/ticket-contracts";
import { TicketGitEnvironmentRepo } from "./ticket-git-environment-repo";

export async function assignDefaultEnvironment(
  rawInput: AssignEnvironmentRequest,
  {
    ticketRepo,
    ticketGitEnvironmentRepo,
  }: {
    ticketRepo: TicketRepo;
    ticketGitEnvironmentRepo: TicketGitEnvironmentRepo;
  } = AppContext,
): Promise<TicketContract> {
  console.log("Assigning environment with input:", rawInput);
  const input = assignEnvironmentRequestSchema.parse(rawInput);
  let ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket ${input.ticketId} not found`);
  }

  const gitEnv = await ticketGitEnvironmentRepo.loadById(
    input.ticketGitEnvironmentId,
  );
  console.log(
    `Loaded git environment ${input.ticketGitEnvironmentId} for ticket ${input.ticketId}:`,
    gitEnv,
  );

  if (!gitEnv) {
    throw new Error(
      `Git environment ${input.ticketGitEnvironmentId} not found`,
    );
  }

  ticket = ticket.withTicketGitEnvironmentAggregate(gitEnv);
  console.log(
    `Assigned git environment ${input.ticketGitEnvironmentId} to ticket ${input.ticketId}:`,
    ticket,
  );
  const persistedTicket = await ticketRepo.createMany([ticket]);
  return ticketAggregateToContract(persistedTicket[0]);
}
