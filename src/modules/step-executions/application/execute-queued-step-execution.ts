import { AppContext } from "@/lib/di";
import type { TimeProvider } from "@/lib/time-provider";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import {
  executeQueuedStepExecutionRequestSchema,
  executeQueuedStepExecutionResponseSchema,
  type ExecuteQueuedStepExecutionRequest,
  type ExecuteQueuedStepExecutionResponse,
} from "@/modules/step-executions/contracts/execute-queued-step-execution-contracts";
import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import {
  type StepExecutionStepName,
  FAILING_TEST_FIX_STEP_NAME,
  FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { triggerTicketFailingTestFixStep } from "@/modules/step-executions/github_fix_failing_test/application/trigger-ticket-failing-test-fix-step";
import { triggerFinalizeFailingTestReproPrStep } from "@/modules/step-executions/github_finalize_failing_test_repro_pr/application/trigger-finalize-failing-test-repro-pr-step";
import { triggerTicketFailingTestReproStep } from "@/modules/step-executions/github_repro_failing_test/application/trigger-ticket-failing-test-repro-step";
import { triggerTicketDescriptionEnrichmentStep } from "@/modules/step-executions/ticket_description_enrichment/application/trigger-ticket-description-enrichment-step";
import { triggerTicketDescriptionQualityStep } from "@/modules/step-executions/ticket_description_quality_rank/application/trigger-ticket-description-quality-step";
import { triggerTicketDuplicateCandidatesStep } from "@/modules/step-executions/ticket_duplicate_candidates/application/trigger-ticket-duplicate-candidates-step";
import type { PipelineStepExecutionsQuery } from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";
import type { DbExecutor } from "@/lib/db/db-executor";

class ClaimedExecutionStepRepo implements StepExecutionRepo {
  private hasRemappedFirstSave = false;

  constructor(
    private readonly delegate: StepExecutionRepo,
    private readonly claimedExecution: TicketPipelineStepExecutionEntity,
  ) {}

  private remapToClaimedExecution(
    stepExecution: TicketPipelineStepExecutionEntity,
  ): void {
    stepExecution.id = this.claimedExecution.id;
    stepExecution.pipelineId = this.claimedExecution.pipelineId;
    stepExecution.ticketId = this.claimedExecution.ticketId;
    stepExecution.createdAt = this.claimedExecution.createdAt;
    stepExecution.updatedAt = this.claimedExecution.updatedAt;
  }

  async load(id: string): Promise<TicketPipelineStepExecutionEntity | null> {
    return this.delegate.load(id);
  }

  async loadQueued(
    limit: number,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.delegate.loadQueued(limit);
  }

  async claimQueued(
    id: string,
  ): Promise<TicketPipelineStepExecutionEntity | null> {
    return this.delegate.claimQueued(id);
  }

  async loadByPipelineId(
    pipelineId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.delegate.loadByPipelineId(pipelineId);
  }

  async loadByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.delegate.loadByTicketId(ticketId);
  }

  async getByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.delegate.getByTicketId(ticketId);
  }

  async loadPage(
    query: PipelineStepExecutionsQuery,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.delegate.loadPage(query);
  }

  async count(query: PipelineStepExecutionsQuery): Promise<number> {
    return this.delegate.count(query);
  }

  async save(
    stepExecution: TicketPipelineStepExecutionEntity,
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity> {
    if (!this.hasRemappedFirstSave) {
      this.remapToClaimedExecution(stepExecution);
      this.hasRemappedFirstSave = true;
    }

    return this.delegate.save(stepExecution, dbExecutor);
  }

  async saveMany(
    stepExecutions: TicketPipelineStepExecutionEntity[],
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    if (stepExecutions.length === 0) {
      return [];
    }

    if (!this.hasRemappedFirstSave) {
      this.remapToClaimedExecution(stepExecutions[0]);
      this.hasRemappedFirstSave = true;
    }

    return this.delegate.saveMany(stepExecutions, dbExecutor);
  }
}

async function resolveTicketId(
  pipelineId: string | null | undefined,
  fallbackTicketId?: string,
): Promise<string> {
  if (!pipelineId) {
    if (!fallbackTicketId) {
      throw new Error("Cannot resolve ticket ID without pipelineId or fallback");
    }

    return fallbackTicketId;
  }

  const pipelineRun = await AppContext.pipelineRunRepo.loadById(pipelineId);
  return pipelineRun?.ticketId ?? fallbackTicketId ?? pipelineId;
}

async function processClaimedStepExecution(
  claimedExecution: TicketPipelineStepExecutionEntity,
  deps: Pick<
    typeof AppContext,
    | "ticketRepo"
    | "environmentRepo"
    | "ticketGitEnvironmentRepo"
    | "pipelineRunRepo"
    | "ticketVectorRepo"
    | "githubService"
    | "agentRunLauncher"
  > & { stepExecutionRepo: StepExecutionRepo; timeProvider: TimeProvider },
): Promise<void> {
  const stepExecutionRepo = new ClaimedExecutionStepRepo(
    deps.stepExecutionRepo,
    claimedExecution,
  );
  const ticketId = await resolveTicketId(
    claimedExecution.pipelineId,
    claimedExecution.ticketId,
  );

  switch (claimedExecution.stepName as StepExecutionStepName) {
    case TICKET_DESCRIPTION_QUALITY_STEP_NAME:
      await triggerTicketDescriptionQualityStep(
        { ticketId },
        {
          ticketRepo: deps.ticketRepo,
          stepExecutionRepo,
          timeProvider: deps.timeProvider,
        },
      );
      return;
    case TICKET_INVESTIGATION_STEP_NAME:
      await triggerTicketDescriptionEnrichmentStep(
        { ticketId },
        {
          ticketRepo: deps.ticketRepo,
          environmentRepo: deps.environmentRepo,
          ticketGitEnvironmentRepo: deps.ticketGitEnvironmentRepo,
          pipelineRunRepo: deps.pipelineRunRepo,
          githubService: deps.githubService,
          agentRunLauncher: deps.agentRunLauncher,
          stepExecutionRepo,
          timeProvider: deps.timeProvider,
        },
      );
      return;
    case TICKET_DUPLICATE_CANDIDATES_STEP_NAME:
      await triggerTicketDuplicateCandidatesStep(
        { ticketId },
        {
          ticketRepo: deps.ticketRepo,
          ticketVectorRepo: deps.ticketVectorRepo,
          stepExecutionRepo,
          timeProvider: deps.timeProvider,
        },
      );
      return;
    case FAILING_TEST_REPRO_STEP_NAME:
      await triggerTicketFailingTestReproStep(
        { ticketId },
        {
          ticketRepo: deps.ticketRepo,
          environmentRepo: deps.environmentRepo,
          ticketGitEnvironmentRepo: deps.ticketGitEnvironmentRepo,
          pipelineRunRepo: deps.pipelineRunRepo,
          githubService: deps.githubService,
          agentRunLauncher: deps.agentRunLauncher,
          stepExecutionRepo,
          timeProvider: deps.timeProvider,
        },
      );
      return;
    case FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME:
      await triggerFinalizeFailingTestReproPrStep(
        { ticketId },
        {
          stepExecutionRepo,
          githubService: deps.githubService,
          timeProvider: deps.timeProvider,
        },
      );
      return;
    case FAILING_TEST_FIX_STEP_NAME: {
      const ticket = await deps.ticketRepo.loadById(ticketId, {
        loadTicketGitEnvironmentAggregate: true,
      });
      if (!ticket) {
        throw new Error(`Ticket with ID ${ticketId} not found`);
      }

      const ticketGitEnvironmentId =
        ticket.ticketGitEnvironmentAggregate?.id ??
        ticket.defaultGitEnvironmentId;

      if (ticketGitEnvironmentId === undefined) {
        throw new Error(
          `Ticket ${ticketId} does not have a default git environment assigned`,
        );
      }

      await triggerTicketFailingTestFixStep(
        {
          ticketNumber: ticket.ticketNumber,
          ticketGitEnvironmentId,
        },
        {
          ticketRepo: deps.ticketRepo,
          environmentRepo: deps.environmentRepo,
          ticketGitEnvironmentRepo: deps.ticketGitEnvironmentRepo,
          githubService: deps.githubService,
          agentRunLauncher: deps.agentRunLauncher,
          stepExecutionRepo,
          timeProvider: deps.timeProvider,
        },
      );
      return;
    }
    default:
      throw new Error(
        `Unsupported queued step '${claimedExecution.stepName}' for execution ${claimedExecution.id}`,
      );
  }
}

export async function executeQueuedStepExecution(
  rawInput: ExecuteQueuedStepExecutionRequest,
  {
    stepExecutionRepo,
    timeProvider,
    ticketRepo,
    environmentRepo,
    ticketGitEnvironmentRepo,
    pipelineRunRepo,
    ticketVectorRepo,
    githubService,
    agentRunLauncher,
  }: {
    stepExecutionRepo: StepExecutionRepo;
    timeProvider: TimeProvider;
    ticketRepo: (typeof AppContext)["ticketRepo"];
    environmentRepo: (typeof AppContext)["environmentRepo"];
    ticketGitEnvironmentRepo: (typeof AppContext)["ticketGitEnvironmentRepo"];
    pipelineRunRepo: (typeof AppContext)["pipelineRunRepo"];
    ticketVectorRepo: (typeof AppContext)["ticketVectorRepo"];
    githubService: (typeof AppContext)["githubService"];
    agentRunLauncher: (typeof AppContext)["agentRunLauncher"];
  } = AppContext,
): Promise<ExecuteQueuedStepExecutionResponse> {
  const input = executeQueuedStepExecutionRequestSchema.parse(rawInput);

  const claimedExecution = await stepExecutionRepo.claimQueued(
    input.stepExecutionId,
  );
  if (!claimedExecution) {
    return executeQueuedStepExecutionResponseSchema.parse({
      ok: true,
      data: {
        stepExecution: null,
      },
    });
  }

  await processClaimedStepExecution(claimedExecution, {
    stepExecutionRepo,
    timeProvider,
    ticketRepo,
    environmentRepo,
    ticketGitEnvironmentRepo,
    pipelineRunRepo,
    ticketVectorRepo,
    githubService,
    agentRunLauncher,
  });

  const persistedExecution =
    (await stepExecutionRepo.load(claimedExecution.id)) ?? claimedExecution;

  return executeQueuedStepExecutionResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(persistedExecution),
    },
  });
}
