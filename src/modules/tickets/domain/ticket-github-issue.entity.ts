const normalizeDate = (value: Date | string | undefined): Date | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return parsed;
};

export class TicketGithubIssueEntity {
  constructor(
    public readonly ticketId: string,
    public readonly githubIssueNumber: number,
    public readonly githubIssueId: string,
    public readonly id?: number,
    createdAt?: Date | string,
    updatedAt?: Date | string,
  ) {
    this.createdAt = normalizeDate(createdAt);
    this.updatedAt = normalizeDate(updatedAt);
  }

  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;
}
