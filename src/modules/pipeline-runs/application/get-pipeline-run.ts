import { AppContext } from "@/lib/di";
import type { PipelineRunContract } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import type { PipelineRunRepo } from "./pipeline-run-repo";
import { pipelineRunEntityToContract } from "./pipeline-run-entity-to-contract";

export async function getPipelineRun(
  pipelineRunId: string,
  { pipelineRunRepo }: { pipelineRunRepo: PipelineRunRepo } = AppContext,
): Promise<PipelineRunContract | null> {
  const pipelineRun = await pipelineRunRepo.loadById(pipelineRunId, {
    includePipelineSteps: true,
  });
  if (!pipelineRun) {
    return null;
  }

  return pipelineRunEntityToContract(pipelineRun);
}
