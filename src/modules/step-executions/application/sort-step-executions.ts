type SortableStepExecution = {
  id: string;
  startedAt: string;
};

export const sortStepExecutionsNewestFirst = <T extends SortableStepExecution>(
  stepExecutions: T[],
): T[] =>
  [...stepExecutions].sort((a, b) => {
    const startedAtDiff = Date.parse(b.startedAt) - Date.parse(a.startedAt);
    if (startedAtDiff !== 0) {
      return startedAtDiff;
    }
    return b.id.localeCompare(a.id);
  });
