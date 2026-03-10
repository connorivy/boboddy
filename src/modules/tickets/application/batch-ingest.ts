"use server";

import { randomUUID } from "node:crypto";
import { ticketAggregateToContract } from "./ticket-aggregate-to-contract";
import { AppContext } from "@/lib/di";
import { JiraTicketRepo, TicketRepo } from "./jira-ticket-repo";
import { getDb } from "@/lib/db";
import type { PipelineRunRepo } from "@/modules/pipeline-runs/application/pipeline-run-repo";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { TicketAggregate } from "../domain/ticket-aggregate";
import {
  ingestTicketsRequestSchema,
  type IngestTicketsRequest,
} from "../contracts/ticket-contracts";
import { DbExecutor } from "@/lib/db/db-executor";

type TicketIngestDeps = {
  ticketRepo: TicketRepo;
  jiraTicketRepo: JiraTicketRepo;
  pipelineRunRepo: PipelineRunRepo;
  stepExecutionRepo: StepExecutionRepo;
};

type TicketIngestFromBoardsDeps = TicketIngestDeps & {
  pipelineRunRepo: PipelineRunRepo;
  stepExecutionRepo: StepExecutionRepo;
};
export async function ingestTickets(
  ticketNumbers: string[],
  {
    ticketRepo,
    jiraTicketRepo,
    pipelineRunRepo,
    stepExecutionRepo,
  }: TicketIngestDeps = AppContext,
) {
  const jiraTickets = await jiraTicketRepo.fetchByTicketNumbers(ticketNumbers);
  return await getDb().transaction(async (tx) => {
    const persistedTickets = await ticketRepo.saveMany(jiraTickets, tx);
    return persistedTickets.map((t) => ticketAggregateToContract(t.entity));
  });
}

export async function ingestTicketsModifiedSince(
  sinceDate: string,
  {
    ticketRepo,
    jiraTicketRepo,
    pipelineRunRepo,
    stepExecutionRepo,
  }: TicketIngestDeps = AppContext,
) {
  const jiraTickets = await jiraTicketRepo.fetchModifiedSince(sinceDate);
  return await getDb().transaction(async (tx) => {
    const persistedTickets = await ticketRepo.saveMany(jiraTickets, tx);
    return persistedTickets.map((t) => ticketAggregateToContract(t.entity));
  });
}

export async function ingestTicketContracts(
  rawRequest: IngestTicketsRequest,
  {
    ticketRepo,
    pipelineRunRepo,
    stepExecutionRepo,
  }: Pick<
    TicketIngestDeps,
    "ticketRepo" | "pipelineRunRepo" | "stepExecutionRepo"
  > = AppContext,
) {
  const request = ingestTicketsRequestSchema.parse(rawRequest);
  const tickets = request.tickets.map((ticket) =>
    TicketAggregate.create(ticket),
  );

  return await getDb().transaction(async (tx) => {
    const persistedTickets = await ticketRepo.saveMany(tickets, tx);
    return persistedTickets.map((t) => ticketAggregateToContract(t.entity));
  });
}

export async function ingestTicketsFromBoards({
  ticketRepo,
  jiraTicketRepo,
  pipelineRunRepo,
  stepExecutionRepo,
}: TicketIngestFromBoardsDeps = AppContext) {
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
  return await getDb().transaction(async (tx) => {
    const persistedTickets = await ticketRepo.saveMany(
      [...admTickets, ...vocTickets],
      tx,
    );
    // await persistTicketsAndPipelines(
    //   persistedTickets,
    //   pipelineRunRepo,
    //   stepExecutionRepo,
    //   tx,
    // );
    return persistedTickets.map((t) => ticketAggregateToContract(t.entity));
  });
}

async function persistTicketsAndPipelines(
  persistedTickets: {
    entity: TicketAggregate;
    persistenceStatus: "created" | "updated";
  }[],
  pipelineRunRepo: PipelineRunRepo,
  stepExecutionRepo: StepExecutionRepo,
  tx: DbExecutor,
) {
  if (persistedTickets.length === 0) {
    return [];
  }

  const queuedAt = new Date();
  const pipelineRuns = persistedTickets
    .filter((ticket) => ticket.persistenceStatus === "created")
    .map((ticket) =>
      PipelineRunEntity.createAndQueueFirstStep({
        ticketId: ticket.entity.id ?? ticket.entity.ticketNumber,
        queuedAt,
      }),
    );

  const createdRuns = await pipelineRunRepo.createMany(pipelineRuns, tx);
  const pipelineRunById = new Map(
    pipelineRuns.map((pipelineRun) => [pipelineRun.id, pipelineRun]),
  );

  const firstSteps = createdRuns.flatMap((createdRun) => {
    const firstStep =
      pipelineRunById.get(createdRun.id)?.pipelineSteps?.[0] ?? null;
    return firstStep ? [firstStep] : [];
  });
  await stepExecutionRepo.saveMany(firstSteps, tx);
}
