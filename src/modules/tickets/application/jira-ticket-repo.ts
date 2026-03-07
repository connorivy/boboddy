import { TicketSearchQuery } from "../contracts/ticket-contracts";
import { TicketAggregate } from "../domain/ticket-aggregate";
import { TicketGithubIssueEntity } from "../domain/ticket-github-issue.entity";
import type { DbExecutor } from "@/lib/db/db-executor";

export type LoadTicketsOptions = {
  loadTicketPipeline?: boolean;
  loadGithubIssue?: boolean;
  loadTicketGitEnvironmentAggregate?: boolean;
};

export type JiraTicketRepo = {
  fetchByTicketNumbers(ticketNumbers: string[]): Promise<TicketAggregate[]>;
  fetchModifiedSince(sinceDate: string): Promise<TicketAggregate[]>;
  fetchByBoardId(boardId: number, sinceDate?: Date): Promise<TicketAggregate[]>;
};

export type TicketRepo = {
  createMany(tickets: TicketAggregate[]): Promise<TicketAggregate[]>;
  load(
    query: TicketSearchQuery,
    options?: LoadTicketsOptions,
  ): Promise<TicketAggregate[]>;
  loadMostRecentlyModified(): Promise<TicketAggregate>;
  count(query: TicketSearchQuery): Promise<number>;
  loadByTicketNumbers(ticketNumbers: string[]): Promise<TicketAggregate[]>;
  loadById(
    ticketId: string,
    options?: LoadTicketsOptions,
  ): Promise<TicketAggregate | null>;
  saveDefaultGitEnvironment(
    ticket: TicketAggregate,
    dbExecutor?: DbExecutor,
  ): Promise<TicketAggregate>;
  saveGithubIssue(
    githubIssue: TicketGithubIssueEntity,
  ): Promise<TicketGithubIssueEntity>;
};
