export class TicketGithubIssueEntity {
  constructor(
    public readonly ticketId: string,
    public readonly githubIssueNumber: number,
    public readonly githubIssueId: string,
    public readonly id?: number,
    public readonly createdAt?: string,
    public readonly updatedAt?: string,
  ) {}
}
