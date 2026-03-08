import { TicketGitEnvironmentAggregate } from "@/modules/environments/domain/ticket-git-environment-aggregate";
import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import type {
  TicketPipelineStepExecutionEntity as TicketPipelineStepExecutionContract,
  StepExecutionStatus,
  TicketContract,
  TicketIngestInput,
} from "@/modules/tickets/contracts/ticket-contracts";
import { TicketGithubIssueEntity } from "@/modules/tickets/domain/ticket-github-issue.entity";

export type TicketAggregateProps = {
  ticketNumber: string;
  title: string;
  slackThread: string | null;
  status: TicketIngestInput["status"];
  description: string;
  companyNames: string[];
  employeeEmails: string[];
  priority: TicketIngestInput["priority"];
  ticketType: TicketIngestInput["ticketType"];
  dueDate: string | null;
  reporter: string;
  assignee: string | null;
  jiraCreatedAt: string | null;
  jiraUpdatedAt: string | null;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  defaultGitEnvironmentId?: number;
  pipelineSteps?: TicketPipelineStepExecutionEntity[];
  githubIssue?: TicketGithubIssueEntity | null;
  ticketGitEnvironmentAggregate?: TicketGitEnvironmentAggregate | null;
};

const mapPipelineStepToContract = (
  step: TicketPipelineStepExecutionEntity,
): TicketPipelineStepExecutionContract => {
  if (step.createdAt === undefined || step.updatedAt === undefined) {
    throw new Error(
      "Ticket pipeline step execution must have persistence metadata to be converted to TicketContract",
    );
  }

  return {
    id: step.id,
    pipelineId: step.pipelineId,
    stepName: step.stepName,
    status: step.status,
    idempotencyKey: step.idempotencyKey,
    startedAt: step.startedAt,
    endedAt: step.endedAt ?? null,
    createdAt: step.createdAt,
    updatedAt: step.updatedAt,
    result: null,
  };
};

const mapDefaultGitEnvironmentToContract = (
  ticketGitEnvironmentAggregate?: TicketGitEnvironmentAggregate | null,
) => {
  if (!ticketGitEnvironmentAggregate) {
    return undefined;
  }

  if (ticketGitEnvironmentAggregate.id === undefined) {
    throw new Error(
      "Ticket git environment aggregate must have persistence metadata to be converted to TicketContract",
    );
  }

  return {
    id: ticketGitEnvironmentAggregate.id,
    ticketId: ticketGitEnvironmentAggregate.ticketId,
    baseEnvironmentId: ticketGitEnvironmentAggregate.baseEnvironmentId,
    devBranch: ticketGitEnvironmentAggregate.devBranch,
  };
};

export class TicketAggregate {
  public readonly ticketNumber: string;
  public readonly title: string;
  public readonly slackThread: string | null;
  public readonly status: TicketIngestInput["status"];
  public readonly description: string;
  public readonly companyNames: string[];
  public readonly employeeEmails: string[];
  public readonly priority: TicketIngestInput["priority"];
  public readonly ticketType: TicketIngestInput["ticketType"];
  public readonly dueDate: string | null;
  public readonly reporter: string;
  public readonly assignee: string | null;
  public readonly jiraCreatedAt: string | null;
  public readonly jiraUpdatedAt: string | null;
  public readonly id?: string;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;
  public readonly pipelineSteps?: TicketPipelineStepExecutionEntity[];
  public readonly githubIssue?: TicketGithubIssueEntity | null;
  public readonly defaultGitEnvironmentId?: number;
  public readonly ticketGitEnvironmentAggregate?: TicketGitEnvironmentAggregate | null;

  private constructor(props: TicketAggregateProps) {
    this.ticketNumber = props.ticketNumber;
    this.title = props.title;
    this.slackThread = props.slackThread;
    this.status = props.status;
    this.description = props.description;
    this.companyNames = [...props.companyNames];
    this.employeeEmails = [...props.employeeEmails];
    this.priority = props.priority;
    this.ticketType = props.ticketType;
    this.dueDate = props.dueDate;
    this.reporter = props.reporter;
    this.assignee = props.assignee;
    this.jiraCreatedAt = props.jiraCreatedAt;
    this.jiraUpdatedAt = props.jiraUpdatedAt;
    this.id = props.id;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.pipelineSteps = props.pipelineSteps;
    this.githubIssue = props.githubIssue;
    this.defaultGitEnvironmentId = props.defaultGitEnvironmentId;
    this.ticketGitEnvironmentAggregate = props.ticketGitEnvironmentAggregate;
  }

  private toConstructorProps(): TicketAggregateProps {
    return {
      ticketNumber: this.ticketNumber,
      title: this.title,
      slackThread: this.slackThread,
      status: this.status,
      description: this.description,
      companyNames: this.companyNames,
      employeeEmails: this.employeeEmails,
      priority: this.priority,
      ticketType: this.ticketType,
      dueDate: this.dueDate,
      reporter: this.reporter,
      assignee: this.assignee,
      jiraCreatedAt: this.jiraCreatedAt,
      jiraUpdatedAt: this.jiraUpdatedAt,
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      defaultGitEnvironmentId: this.defaultGitEnvironmentId,
      pipelineSteps: this.pipelineSteps,
      githubIssue: this.githubIssue,
      ticketGitEnvironmentAggregate: this.ticketGitEnvironmentAggregate,
    };
  }

  static create(
    props: Omit<TicketAggregateProps, "id" | "createdAt" | "updatedAt">,
  ): TicketAggregate {
    return new TicketAggregate({
      ...props,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    });
  }

  static rehydrate(props: TicketAggregateProps): TicketAggregate {
    return new TicketAggregate(props);
  }

  withPipelineSteps(
    pipelineSteps?: TicketPipelineStepExecutionEntity[],
  ): TicketAggregate {
    return new TicketAggregate({
      ...this.toConstructorProps(),
      pipelineSteps,
    });
  }

  withGithubIssue(
    githubIssue?: TicketGithubIssueEntity | null,
  ): TicketAggregate {
    return new TicketAggregate({
      ...this.toConstructorProps(),
      githubIssue,
    });
  }

  withTicketGitEnvironmentAggregate(
    ticketGitEnvironmentAggregate?: TicketGitEnvironmentAggregate | null,
  ): TicketAggregate {
    return new TicketAggregate({
      ...this.toConstructorProps(),
      defaultGitEnvironmentId: ticketGitEnvironmentAggregate?.id,
      ticketGitEnvironmentAggregate,
    });
  }

  assignDefaultGitEnvironment(
    defaultGitEnvironmentId: number,
  ): TicketAggregate {
    if (!this.id) {
      throw new Error(
        "Cannot assign default git environment to a ticket without persistence metadata",
      );
    }

    return new TicketAggregate({
      ...this.toConstructorProps(),
      defaultGitEnvironmentId,
    });
  }

  getLatestPipelineStep(
    stepName: string,
  ): TicketPipelineStepExecutionEntity | undefined {
    if (!this.pipelineSteps) {
      throw new Error(
        "Cannot get pipeline step from aggregate without pipeline steps loaded",
      );
    }

    return this.pipelineSteps
      ?.filter((step) => step.stepName === stepName)
      .sort(
        (a, b) =>
          new Date(b.endedAt ?? 0).getTime() -
          new Date(a.endedAt ?? 0).getTime(),
      )[0];
  }

  toTicket(): TicketContract {
    if (!this.id || !this.createdAt || !this.updatedAt) {
      throw new Error(
        "Cannot convert aggregate to ticket without persistence metadata",
      );
    }

    return {
      ticketNumber: this.ticketNumber,
      title: this.title,
      slackThread: this.slackThread,
      status: this.status,
      description: this.description,
      companyNames: [...this.companyNames],
      employeeEmails: [...this.employeeEmails],
      priority: this.priority,
      ticketType: this.ticketType,
      dueDate: this.dueDate,
      reporter: this.reporter,
      assignee: this.assignee,
      jiraCreatedAt: this.jiraCreatedAt,
      jiraUpdatedAt: this.jiraUpdatedAt,
      defaultGitEnvironmentId: this.defaultGitEnvironmentId,
      defaultGitEnvironment: mapDefaultGitEnvironmentToContract(
        this.ticketGitEnvironmentAggregate,
      ),
      id: this.id,
      pipelineSteps: this.pipelineSteps?.map(mapPipelineStepToContract),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  getStatusForStep(stepName: string): StepExecutionStatus {
    const stepExecution = this.pipelineSteps?.find(
      (step) => step.stepName === stepName,
    );
    return stepExecution?.status ?? "not_started";
  }
}
