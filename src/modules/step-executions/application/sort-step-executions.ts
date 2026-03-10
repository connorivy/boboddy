type SortableStepExecution = {
  id: string;
  startedAt: Date | string;
};

const toTimestamp = (value: Date | string): number =>
  value instanceof Date ? value.getTime() : Date.parse(value);

export const sortStepExecutionsNewestFirst = <T extends SortableStepExecution>(
  stepExecutions: T[],
): T[] =>
  [...stepExecutions].sort((a, b) => {
    const startedAtDiff = toTimestamp(b.startedAt) - toTimestamp(a.startedAt);
    if (startedAtDiff !== 0) {
      return startedAtDiff;
    }
    return b.id.localeCompare(a.id);
  });
