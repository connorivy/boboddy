import { parseUuidV7, type UuidV7 } from "@boboddy/core/common/contracts/uuid-v7";

export type ProcessProjectWorkOptions = {
  projectId: string;
  batchSize?: number | undefined;
  leaseDurationSeconds?: number | undefined;
  workerId?: string | undefined;
};

export type ProcessProjectWorkResult = {
  claimedCount: number;
  processedCount: number;
  skippedCount: number;
};

type StepExecutionClaim = {
  stepExecution: {
    id: string;
  };
  claimToken: string;
};

type ClaimStepExecutionsFn = (
  input: {
    projectId: UuidV7;
    workerId: string;
    batchSize: number;
    leaseDurationSeconds: number;
  },
  deps: {
    stepExecutionRepo: unknown;
    stepDefinitionRepo: unknown;
    linearPipelineDefinitionRepo: unknown;
    linearPipelineExecutionRepo: unknown;
    timeProvider: unknown;
  },
) => Promise<StepExecutionClaim[]>;

export type ProcessProjectWorkDeps = {
  claimStepExecutions: ClaimStepExecutionsFn;
  appContext: {
    stepExecutionRepo: unknown;
    stepDefinitionRepo: unknown;
    linearPipelineDefinitionRepo: unknown;
    linearPipelineExecutionRepo: unknown;
    timeProvider: unknown;
  };
};

async function loadDefaultDeps(): Promise<ProcessProjectWorkDeps> {
  const claimModulePath =
    "@boboddy/core/step-executions/application/claim-step-executions";
  const diModulePath = "@boboddy/core/lib/di";
  const [{ claimStepExecutions }, { createAppContext }] = await Promise.all([
    import(claimModulePath),
    import(diModulePath),
  ]);

  return {
    claimStepExecutions: claimStepExecutions as ClaimStepExecutionsFn,
    appContext: createAppContext() as ProcessProjectWorkDeps["appContext"],
  };
}

export async function processProjectWork(
  options: ProcessProjectWorkOptions,
  deps?: ProcessProjectWorkDeps,
): Promise<ProcessProjectWorkResult> {
  const resolvedDeps = deps ?? (await loadDefaultDeps());
  const projectId: UuidV7 = parseUuidV7(options.projectId);
  const workerId = options.workerId?.trim() || `boboddy-work-${projectId}`;
  const claims = await resolvedDeps.claimStepExecutions(
    {
      projectId,
      workerId,
      batchSize: options.batchSize ?? 10,
      leaseDurationSeconds: options.leaseDurationSeconds ?? 30,
    },
    {
      stepExecutionRepo: resolvedDeps.appContext.stepExecutionRepo,
      stepDefinitionRepo: resolvedDeps.appContext.stepDefinitionRepo,
      linearPipelineDefinitionRepo:
        resolvedDeps.appContext.linearPipelineDefinitionRepo,
      linearPipelineExecutionRepo:
        resolvedDeps.appContext.linearPipelineExecutionRepo,
      timeProvider: resolvedDeps.appContext.timeProvider,
    },
  );

  return {
    claimedCount: claims.length,
    processedCount: claims.length,
    skippedCount: 0,
  };
}
