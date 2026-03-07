import { AgileClient, Version3Client, type AgileModels, type Version3Models } from "jira.js";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import type {
  TicketPriority,
  TicketStatus,
  TicketType,
} from "@/modules/tickets/contracts/ticket-contracts";
import { JiraTicketRepo } from "../application/jira-ticket-repo";

const JIRA_FIELDS = [
  "summary",
  "description",
  "status",
  "issuetype",
  "priority",
  "duedate",
  "reporter",
  "assignee",
  "created",
  "updated",
] as const;

const MAX_JIRA_PAGE_SIZE = 100;

type JiraIssue = {
  key?: string;
  fields?: unknown;
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
};

const asStringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const mapStatus = (status: unknown): TicketStatus => {
  const parsedStatus = asObject(status);
  const name = asStringOrNull(parsedStatus?.name)?.toLowerCase() ?? "";
  const statusCategory = asObject(parsedStatus?.statusCategory);
  const category = asStringOrNull(statusCategory?.key);

  if (category === "done") return "done";
  if (name.includes("more information")) return "needs_more_information";
  if (name.includes("triage")) return "needs_triage";
  if (name.includes("backlog")) return "triaged_backlog";
  if (name.includes("progress")) return "in_progress";
  if (name.includes("ops")) return "ops_resolution_needed";
  if (category === "indeterminate") return "in_progress";

  return "needs_triage";
};

const mapPriority = (priority: unknown): TicketPriority => {
  const parsedPriority = asObject(priority);
  const value = asStringOrNull(parsedPriority?.name)?.toLowerCase();
  if (value === "lowest") return "lowest";
  if (value === "low") return "low";
  if (value === "high") return "high";
  if (value === "highest") return "highest";

  return "medium";
};

const mapTicketType = (issueType: unknown): TicketType => {
  const parsedIssueType = asObject(issueType);
  const value = asStringOrNull(parsedIssueType?.name)?.toLowerCase().trim();

  if (!value) return "manual support";
  if (value.includes("bug")) return "bug";
  if (value.includes("enhancement")) return "enhancement";
  if (value.includes("report")) return "report request";
  if (value.includes("support")) return "manual support";

  return "manual support";
};

const toPlainText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => toPlainText(item))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (value && typeof value === "object") {
    const item = value as { text?: unknown; content?: unknown };
    return [toPlainText(item.text), toPlainText(item.content)]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  return "";
};

const mapUser = (user: unknown) => {
  const parsedUser = asObject(user);
  return (
    asStringOrNull(parsedUser?.emailAddress) ??
    asStringOrNull(parsedUser?.displayName) ??
    asStringOrNull(parsedUser?.accountId) ??
    null
  );
};

const toIsoDateTimeOrNull = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const toJqlDate = (value: Date): string => value.toISOString().slice(0, 10);

const getRequiredEnv = (
  name: "JIRA_HOST" | "JIRA_EMAIL" | "JIRA_API_TOKEN",
) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
};

const getJiraClientConfig = () => ({
  host: getRequiredEnv("JIRA_HOST"),
  authentication: {
    basic: {
      email: getRequiredEnv("JIRA_EMAIL"),
      apiToken: getRequiredEnv("JIRA_API_TOKEN"),
    },
  },
});

export class JiraTicketRepoByHttpClient implements JiraTicketRepo {
  private readonly version3Client: Version3Client;
  private readonly agileClient: AgileClient;

  constructor(version3Client?: Version3Client, agileClient?: AgileClient) {
    const config = getJiraClientConfig();
    this.version3Client = version3Client ?? new Version3Client(config);
    this.agileClient = agileClient ?? new AgileClient(config);
  }

  async fetchByTicketNumbers(
    ticketNumbers: string[],
  ): Promise<TicketAggregate[]> {
    if (ticketNumbers.length === 0) {
      return [];
    }

    const jql = `issuekey in (${ticketNumbers.join(",")})`;

    const result =
      await this.version3Client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
        jql,
        fields: [...JIRA_FIELDS],
      });

    const issues = (result.issues ?? []) as JiraIssue[];
    return this.createAggregates(issues);
  }

  async fetchModifiedSince(sinceDate: string): Promise<TicketAggregate[]> {
    const jql = `updated >= "${sinceDate}" ORDER BY updated ASC`;
    let nextPageToken: string | undefined = undefined;
    const issues: JiraIssue[] = [];

    while (true) {
      const page: Version3Models.SearchAndReconcileResults =
        await this.version3Client.issueSearch.searchForIssuesUsingJqlEnhancedSearch(
          {
            jql,
            fields: [...JIRA_FIELDS],
            nextPageToken,
            maxResults: MAX_JIRA_PAGE_SIZE,
          },
        );

      const pageIssues = (page.issues ?? []) as JiraIssue[];
      issues.push(...pageIssues);

      if (!page.nextPageToken) {
        break;
      }

      nextPageToken = page.nextPageToken;
    }

    return this.createAggregates(issues);
  }

  async fetchByBoardId(
    boardId: number,
    sinceDate?: Date,
  ): Promise<TicketAggregate[]> {
    let startAt = 0;
    const issues: JiraIssue[] = [];
    const jql = sinceDate
      ? `updated >= "${toJqlDate(sinceDate)}" ORDER BY updated ASC`
      : undefined;

    while (true) {
      const page: AgileModels.SearchResults =
        await this.agileClient.board.getIssuesForBoard({
          boardId,
          startAt,
          maxResults: MAX_JIRA_PAGE_SIZE,
          jql,
          fields: [...JIRA_FIELDS],
        });

      const pageIssues = page.issues as JiraIssue[];
      issues.push(...pageIssues);

      if (pageIssues.length === 0) {
        break;
      }

      const nextStartAt = page.startAt + pageIssues.length;
      if (nextStartAt >= page.total) {
        break;
      }

      startAt = nextStartAt;
    }

    return this.createAggregates(issues);
  }

  private createAggregates(issues: JiraIssue[]): TicketAggregate[] {
    return issues.flatMap((issue) => {
      const ticketNumber = issue.key?.trim();
      if (!ticketNumber) {
        return [];
      }

      const fields = asObject(issue.fields) ?? {};
      const title = asStringOrNull(fields.summary)?.trim() || ticketNumber;
      const description = toPlainText(fields.description) || title;
      const dueDateValue = asStringOrNull(fields.duedate);
      const dueDate =
        dueDateValue && /^\d{4}-\d{2}-\d{2}$/.test(dueDateValue)
          ? dueDateValue
          : null;

      return [
        TicketAggregate.create({
          ticketNumber,
          title,
          slackThread: null,
          status: mapStatus(fields.status),
          description,
          companyNames: [],
          employeeEmails: [],
          priority: mapPriority(fields.priority),
          ticketType: mapTicketType(fields.issuetype),
          dueDate,
          reporter: mapUser(fields.reporter) ?? "unknown@jira",
          assignee: mapUser(fields.assignee),
          jiraCreatedAt: toIsoDateTimeOrNull(
            asStringOrNull(fields.created) ?? undefined,
          ),
          jiraUpdatedAt: toIsoDateTimeOrNull(
            asStringOrNull(fields.updated) ?? undefined,
          ),
        }),
      ];
    });
  }
}
