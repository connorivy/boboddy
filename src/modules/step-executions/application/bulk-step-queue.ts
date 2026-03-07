"use client";

import { useSyncExternalStore } from "react";
import type { TicketStepName } from "@/modules/tickets/contracts/ticket-contracts";

export type BulkStepQueueItem = {
  id: number;
  ticketId: string;
  stepName: TicketStepName;
  createdAt: string;
};

let nextQueueItemId = 1;
let queueItems: BulkStepQueueItem[] = [];
const listeners = new Set<() => void>();

const emitQueueChanged = () => {
  listeners.forEach((listener) => listener());
};

const subscribeToQueue = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getQueueSnapshot = () => queueItems;

export const getBulkStepQueueItemsSnapshot = () => queueItems;

export const useBulkStepQueueItems = () =>
  useSyncExternalStore(subscribeToQueue, getQueueSnapshot, getQueueSnapshot);

export const enqueueBulkStepQueueItems = (
  items: Array<{ ticketId: string; stepName: TicketStepName }>,
) => {
  const existingKeys = new Set(
    queueItems.map((item) => `${item.ticketId}::${item.stepName}`),
  );

  const newItems: BulkStepQueueItem[] = [];
  for (const item of items) {
    const key = `${item.ticketId}::${item.stepName}`;
    if (existingKeys.has(key)) {
      continue;
    }

    existingKeys.add(key);
    newItems.push({
      id: nextQueueItemId++,
      ticketId: item.ticketId,
      stepName: item.stepName,
      createdAt: new Date().toISOString(),
    });
  }

  if (newItems.length > 0) {
    queueItems = [...queueItems, ...newItems];
    emitQueueChanged();
  }

  return {
    addedCount: newItems.length,
    skippedCount: items.length - newItems.length,
  };
};

export const removeBulkStepQueueItem = (id: number) => {
  const previousLength = queueItems.length;
  queueItems = queueItems.filter((item) => item.id !== id);

  if (queueItems.length !== previousLength) {
    emitQueueChanged();
  }
};
