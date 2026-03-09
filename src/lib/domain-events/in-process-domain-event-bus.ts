import type { DbTransaction } from "@/lib/db/db-executor";
import type { DomainEvent, DomainEventHandler } from "./domain-event";

export class InProcessDomainEventBus {
  private readonly handlers = new Map<string, DomainEventHandler[]>();

  register<TEvent extends DomainEvent>(
    eventType: TEvent["type"],
    handler: DomainEventHandler<TEvent>,
  ): void {
    const registeredHandlers = this.handlers.get(eventType) ?? [];
    registeredHandlers.push(handler as DomainEventHandler);
    this.handlers.set(eventType, registeredHandlers);
  }

  async publish(events: DomainEvent[], tx: DbTransaction): Promise<void> {
    for (const event of events) {
      const handlers = this.handlers.get(event.type) ?? [];
      for (const handler of handlers) {
        await handler.handle(event, { tx });
      }
    }
  }
}
