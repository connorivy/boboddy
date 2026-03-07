"use server";

import { AppContext } from "@/lib/di";
import {
  paginatedTicketsResponseSchema,
  ticketDetailResponseSchema,
  ticketSearchQuerySchema,
  PaginatedTicketsResponse,
  TicketDetailResponse,
  TicketSearchQuery,
} from "../contracts/ticket-contracts";
import { TicketRepo } from "./jira-ticket-repo";
import { ticketAggregateToContract } from "./ticket-aggregate-to-contract";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export async function searchTickets(
  rawSearchParams: TicketSearchQuery,
  { ticketRepo }: { ticketRepo: TicketRepo } = AppContext,
): Promise<PaginatedTicketsResponse> {
  const searchParams = ticketSearchQuerySchema.parse(rawSearchParams);
  const [tickets, total] = await Promise.all([
    ticketRepo.load(searchParams, {
      loadTicketPipeline: true,
      loadTicketGitEnvironmentAggregate: true,
    }),
    ticketRepo.count(searchParams),
  ]);

  return paginatedTicketsResponseSchema.parse({
    items: tickets.map(ticketAggregateToContract),
    pagination: {
      page: searchParams.page,
      pageSize: searchParams.pageSize,
      total,
    },
  });
}

export async function loadTicketDetail(
  ticketId: string,
  {
    ticketRepo,
    stepExecutionRepo,
  }: {
    ticketRepo: TicketRepo;
    stepExecutionRepo: StepExecutionRepo;
  } = AppContext,
): Promise<TicketDetailResponse> {
  const [ticket, stepExecutions] = await Promise.all([
    ticketRepo.loadById(ticketId, {
      loadTicketGitEnvironmentAggregate: true,
    }),
    stepExecutionRepo.loadByTicketId(ticketId),
  ]);

  if (!ticket) {
    throw new Error(`Ticket with ID ${ticketId} not found`);
  }

  return ticketDetailResponseSchema.parse({
    ticket: ticketAggregateToContract(ticket),
    pipeline: {
      stepExecutions: stepExecutions.map(stepExecutionEntityToContract),
    },
  });
}
