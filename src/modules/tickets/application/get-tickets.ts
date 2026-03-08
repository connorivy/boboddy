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
import type { PipelineRunRepo } from "@/modules/pipeline-runs/application/pipeline-run-repo";
import { pipelineRunEntityToContract } from "@/modules/pipeline-runs/application/pipeline-run-entity-to-contract";

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
    pipelineRunRepo,
  }: {
    ticketRepo: TicketRepo;
    pipelineRunRepo: PipelineRunRepo;
  } = AppContext,
): Promise<TicketDetailResponse> {
  const ticket = await ticketRepo.loadById(ticketId, {
    loadTicketGitEnvironmentAggregate: true,
  });

  if (!ticket) {
    throw new Error(`Ticket with ID ${ticketId} not found`);
  }

  const pipelineRun = await pipelineRunRepo.loadLatestOrActiveByTicketId(ticketId);
  const stepExecutions = pipelineRun
    ? await pipelineRunRepo.loadExecutions(pipelineRun.id)
    : [];

  return ticketDetailResponseSchema.parse({
    ticket: ticketAggregateToContract(ticket),
    pipeline: {
      run: pipelineRun
        ? pipelineRunEntityToContract(pipelineRun, stepExecutions)
        : null,
      stepExecutions: stepExecutions.map(stepExecutionEntityToContract),
    },
  });
}
