import {
  type AnyPgColumn,
  customType,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  date,
  integer,
  real,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

export const ticketStatusEnum = pgEnum("ticket_status", [
  "needs_more_information",
  "needs_triage",
  "triaged_backlog",
  "in_progress",
  "ops_resolution_needed",
  "done",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "lowest",
  "low",
  "medium",
  "high",
  "highest",
]);

export const ticketTypeEnum = pgEnum("ticket_type", [
  "bug",
  "manual support",
  "enhancement",
  "report request",
]);

export const stepExecutionStatusEnum = pgEnum("step_execution_status", [
  "not_started",
  "queued",
  "running",
  "waiting_for_user_feedback",
  "succeeded",
  "failed",
  "skipped",
  "failed_timeout",
]);

export const reproAttemptStatusEnum = pgEnum("repro_attempt_status", [
  "queued",
  "issue_created",
  "agent_requested",
  "running",
  "completed",
  "failed",
  "timed_out",
]);

export const reproAttemptOutcomeEnum = pgEnum("repro_attempt_outcome", [
  "reproduced",
  "not_reproducible",
  "needs_user_feedback",
  "agent_error",
  "cancelled",
]);
export const agentStatusEnum = pgEnum("agent_status", [
  "complete",
  "error",
  "abort",
  "timeout",
  "user_exit",
]);
export const githubMergeStatusEnum = pgEnum("github_merge_status", [
  "draft",
  "open",
  "closed",
  "merged",
]);
export const pipelineRunStatusEnum = pgEnum("pipeline_run_status", [
  "queued",
  "running",
  "waiting",
  "halted",
  "succeeded",
  "failed",
  "cancelled",
]);

export const environmentAreaEnum = pgEnum("environment_area", [
  "adm",
  "mem",
  "ps",
]);

const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    if (!config) {
      throw new Error("Vector dimensions are required");
    }

    return `vector(${config.dimensions})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
});

export const tickets = pgTable("tickets", {
  id: text("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull().unique(),
  title: text("title").notNull(),
  slackThread: text("slack_thread"),
  status: ticketStatusEnum("status").notNull(),
  description: text("description").notNull(),
  companyNames: text("company_names").array().notNull().default([]),
  employeeEmails: text("employee_emails").array().notNull().default([]),
  priority: ticketPriorityEnum("priority").notNull(),
  ticketType: ticketTypeEnum("ticket_type").notNull().default("manual support"),
  dueDate: date("due_date", { mode: "string" }),
  reporter: text("reporter").notNull(),
  assignee: text("assignee"),
  defaultGitEnvironmentId: integer("default_git_environment_id").references(
    (): AnyPgColumn => ticketGitEnvironments.id,
    { onDelete: "set null" },
  ),
  jiraCreatedAt: timestamp("jira_created_at", { withTimezone: true }),
  jiraUpdatedAt: timestamp("jira_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ticketGithubIssues = pgTable(
  "ticket_github_issues",
  {
    id: serial("id").primaryKey(),
    ticketId: text("ticket_id")
      .references(() => tickets.id, { onDelete: "cascade" })
      .notNull(),
    githubIssueNumber: integer("github_issue_number").notNull(),
    githubIssueId: text("github_issue_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ticket_github_issues_ticket_id_unique").on(table.ticketId),
  ],
);

export const pipelineRuns = pgTable("pipeline_runs", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id")
    .references(() => tickets.id, { onDelete: "cascade" })
    .notNull(),
  status: pipelineRunStatusEnum("status").notNull().default("queued"),
  currentStepName: text("current_step_name"),
  currentStepExecutionId: integer("current_step_execution_id").references(
    (): AnyPgColumn => ticketStepExecutionsTph.id,
    { onDelete: "set null" },
  ),
  lastCompletedStepName: text("last_completed_step_name"),
  haltReason: text("halt_reason"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ticketStepExecutions = pgTable(
  "ticket_step_executions",
  {
    id: serial("id").primaryKey(),
    ticketId: text("ticket_id")
      .references(() => tickets.id, { onDelete: "cascade" })
      .notNull(),
    stepName: text("step_name").notNull(),
    status: stepExecutionStatusEnum("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ticket_step_executions_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
  ],
);

export const ticketEmbeddings = pgTable(
  "ticket_embeddings",
  {
    id: serial("id").primaryKey(),
    ticketId: text("ticket_id")
      .references(() => tickets.id, { onDelete: "cascade" })
      .notNull(),
    model: text("model").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ticket_embeddings_ticket_id_unique").on(table.ticketId),
  ],
);

export const failingTestReproAttempts = pgTable(
  "failing_test_repro_attempts",
  {
    id: serial("id").primaryKey(),
    ticketId: text("ticket_id")
      .references(() => tickets.id, { onDelete: "cascade" })
      .notNull(),
    stepExecutionId: integer("step_execution_id")
      .references(() => ticketStepExecutions.id, { onDelete: "cascade" })
      .notNull(),
    status: reproAttemptStatusEnum("status").notNull().default("queued"),
    outcome: reproAttemptOutcomeEnum("outcome"),
    idempotencyKey: text("idempotency_key").notNull(),
    githubIssueNumber: integer("github_issue_number"),
    githubIssueId: text("github_issue_id"),
    githubAgentRunId: text("github_agent_run_id"),
    agentStatus: agentStatusEnum("agent_status"),
    githubMergeStatus: githubMergeStatusEnum("github_merge_status")
      .notNull()
      .default("draft"),
    githubPrTargetBranch: text("github_pr_target_branch"),
    agentBranch: text("agent_branch"),
    failingTestPath: text("failing_test_path"),
    failingTestCommitSha: text("failing_test_commit_sha"),
    failureReason: text("failure_reason"),
    rawResultJson: jsonb("raw_result_json"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("failing_test_repro_attempts_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
  ],
);

export const ticketDescriptionQualityAssessments = pgTable(
  "ticket_description_quality_assessments",
  {
    id: serial("id").primaryKey(),
    ticketId: text("ticket_id")
      .references(() => tickets.id, { onDelete: "cascade" })
      .notNull(),
    stepExecutionId: text("step_execution_id").notNull(),
    stepsToReproduceScore: integer("steps_to_reproduce_score").notNull(),
    expectedBehaviorScore: integer("expected_behavior_score").notNull(),
    observedBehaviorScore: integer("observed_behavior_score").notNull(),
    reasoning: text("reasoning").notNull(),
    rawResponse: text("raw_response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
);

export const environments = pgTable("environments", {
  id: serial("id").primaryKey(),
  environmentKey: text("environment_key").notNull().unique(),
  area: environmentAreaEnum("area").notNull(),
  number: integer("number").notNull(),
  region: text("region").notNull().default("unknown"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ticketGitEnvironments = pgTable("ticket_git_environments", {
  id: serial("id").primaryKey(),
  ticketId: text("ticket_id")
    .references((): AnyPgColumn => tickets.id, { onDelete: "cascade" })
    .notNull(),
  baseEnvironmentId: text("base_environment_id")
    .references(() => environments.environmentKey, { onDelete: "restrict" })
    .notNull(),
  devBranch: text("dev_branch").notNull(),
});

export const ticketStepExecutionsTph = pgTable(
  "ticket_step_executions_tph",
  {
    id: serial("id").primaryKey(),
    ticketId: text("ticket_id")
      .references(() => tickets.id, { onDelete: "cascade" })
      .notNull(),
    stepName: text("step_name").notNull(),
    type: text("type").notNull(),
    status: stepExecutionStatusEnum("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),

    // Discriminator columns for TPH
    // For description quality step
    stepsToReproduceScore: integer("steps_to_reproduce_score"),
    expectedBehaviorScore: integer("expected_behavior_score"),
    observedBehaviorScore: integer("observed_behavior_score"),
    reasoning: text("reasoning"),
    rawResponse: text("raw_response"),

    // For failing test repro step
    outcome: reproAttemptOutcomeEnum("outcome"),
    githubIssueNumber: integer("github_issue_number"),
    githubIssueId: text("github_issue_id"),
    githubAgentRunId: text("github_agent_run_id"),
    agentStatus: agentStatusEnum("agent_status"),
    githubMergeStatus: githubMergeStatusEnum("github_merge_status"),
    githubPrTargetBranch: text("github_pr_target_branch"),
    agentBranch: text("agent_branch"),
    agentSummary: text("agent_summary"),
    failingTestPath: text("failing_test_path"),
    failingTestCommitSha: text("failing_test_commit_sha"),
    failureReason: text("failure_reason"),
    summaryOfFindings: text("summary_of_findings"),
    confidenceLevel: real("confidence_level"),
    rawResultJson: jsonb("raw_result_json"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),

    // For failing test fix step
    fixOperationOutcome: text("fix_operation_outcome"),
    fixedTestPath: text("fixed_test_path"),
    summaryOfFix: text("summary_of_fix"),
    fixConfidenceLevel: real("fix_confidence_level"),

    // For duplicate candidates step
    duplicateCandidatesProposed: text("duplicate_candidates_proposed"),
    duplicateCandidatesDismissed: text("duplicate_candidates_dismissed"),
    duplicateCandidatesPromoted: text("duplicate_candidates_promoted"),
  },
  (table) => [
    uniqueIndex("ticket_step_executions_tph_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
  ],
);

export type TicketRow = typeof tickets.$inferSelect;
export type NewTicketRow = typeof tickets.$inferInsert;
export type TicketGithubIssueRow = typeof ticketGithubIssues.$inferSelect;
export type NewTicketGithubIssueRow = typeof ticketGithubIssues.$inferInsert;
export type PipelineRunRow = typeof pipelineRuns.$inferSelect;
export type NewPipelineRunRow = typeof pipelineRuns.$inferInsert;
export type TicketStepExecutionRow = typeof ticketStepExecutions.$inferSelect;
export type NewTicketStepExecutionRow =
  typeof ticketStepExecutions.$inferInsert;
export type TicketEmbeddingRow = typeof ticketEmbeddings.$inferSelect;
export type NewTicketEmbeddingRow = typeof ticketEmbeddings.$inferInsert;
export type FailingTestReproAttemptRow =
  typeof failingTestReproAttempts.$inferSelect;
export type NewFailingTestReproAttemptRow =
  typeof failingTestReproAttempts.$inferInsert;
export type TicketDescriptionQualityAssessmentRow =
  typeof ticketDescriptionQualityAssessments.$inferSelect;
export type NewTicketDescriptionQualityAssessmentRow =
  typeof ticketDescriptionQualityAssessments.$inferInsert;
export type EnvironmentRow = typeof environments.$inferSelect;
export type NewEnvironmentRow = typeof environments.$inferInsert;
export type TicketGitEnvironmentRow = typeof ticketGitEnvironments.$inferSelect;
export type NewTicketGitEnvironmentRow =
  typeof ticketGitEnvironments.$inferInsert;
