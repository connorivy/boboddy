"use server";

import { ticketAggregateToContract } from "./ticket-aggregate-to-contract";
import { AppContext } from "@/lib/di";
import { JiraTicketRepo, TicketRepo } from "./jira-ticket-repo";

type TicketIngestDeps = {
  ticketRepo: TicketRepo;
  jiraTicketRepo: JiraTicketRepo;
};
export async function ingestTickets(
  ticketNumbers: string[],
  { ticketRepo, jiraTicketRepo }: TicketIngestDeps = AppContext,
) {
  const jiraTickets = await jiraTicketRepo.fetchByTicketNumbers(ticketNumbers);
  const result = await ticketRepo.createMany(jiraTickets);
  return result.map(ticketAggregateToContract);
}

export async function ingestTicketsModifiedSince(
  sinceDate: string,
  { ticketRepo, jiraTicketRepo }: TicketIngestDeps = AppContext,
) {
  const jiraTickets = await jiraTicketRepo.fetchModifiedSince(sinceDate);
  const result = await ticketRepo.createMany(jiraTickets);
  return result.map(ticketAggregateToContract);
}

export async function ingestTicketsFromBoards({
  ticketRepo,
  jiraTicketRepo,
}: TicketIngestDeps = AppContext) {
  const lastModifiedTicketDate = (await ticketRepo.loadMostRecentlyModified())
    .updatedAt;
  const admTickets = await jiraTicketRepo.fetchByBoardId(
    587,
    lastModifiedTicketDate,
  );
  const vocTickets = await jiraTicketRepo.fetchByBoardId(
    555,
    lastModifiedTicketDate,
  );
  const result = await ticketRepo.createMany([...admTickets, ...vocTickets]);
  return result.map(ticketAggregateToContract);
}
