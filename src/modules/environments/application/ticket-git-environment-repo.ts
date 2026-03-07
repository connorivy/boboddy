import { TicketGitEnvironmentAggregate } from "../domain/ticket-git-environment-aggregate";
import type { DbExecutor } from "@/lib/db/db-executor";

export type TicketGitEnvironmentRepo = {
  save(
    ticketGitEnvironment: TicketGitEnvironmentAggregate,
    dbExecutor?: DbExecutor,
  ): Promise<TicketGitEnvironmentAggregate>;
  loadById(id: number): Promise<TicketGitEnvironmentAggregate | null>;
  loadManyByTicketId(ticketId: string): Promise<TicketGitEnvironmentAggregate[]>;
  loadByTicketId(ticketId: string): Promise<TicketGitEnvironmentAggregate | null>;
};
