import type { DbTransaction } from "@/lib/db/db-executor";

export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export interface DomainEventHandler<TEvent extends DomainEvent = DomainEvent> {
  handle(event: TEvent, deps: { tx: DbTransaction }): Promise<void>;
}
