export const PIPELINE_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
  "skipped",
] as const;

export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number];

export type PipelineRunAggregateProps = {
  ticketId: string;
  pipelineName: string;
  status: PipelineRunStatus;
  failureReason?: string;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class PipelineRunAggregate {
  public readonly ticketId: string;
  public readonly pipelineName: string;
  public readonly status: PipelineRunStatus;
  public readonly failureReason?: string;
  public readonly id?: string;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  private constructor(props: PipelineRunAggregateProps) {
    this.ticketId = props.ticketId;
    this.pipelineName = props.pipelineName;
    this.status = props.status;
    this.failureReason = props.failureReason;
    this.id = props.id;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(
    props: Omit<PipelineRunAggregateProps, "id" | "createdAt" | "updatedAt">,
  ): PipelineRunAggregate {
    return new PipelineRunAggregate(props);
  }

  static rehydrate(props: PipelineRunAggregateProps): PipelineRunAggregate {
    return new PipelineRunAggregate(props);
  }
}
