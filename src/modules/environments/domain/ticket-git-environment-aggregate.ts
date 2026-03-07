export class TicketGitEnvironmentAggregate {
  constructor(
    public readonly ticketId: string,
    public readonly baseEnvironmentId: string,
    public readonly devBranch: string,
    public readonly id?: number,
  ) {}

  withId(id: number): TicketGitEnvironmentAggregate {
    return new TicketGitEnvironmentAggregate(
      this.ticketId,
      this.baseEnvironmentId,
      this.devBranch,
      id,
    );
  }
}
