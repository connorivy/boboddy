import { unstable_noStore as noStore } from "next/cache";
import { PipelinesView } from "@/components/pipelines-view";
import { getPipelineRuns } from "@/modules/pipeline-runs/application/get-pipeline-runs";

export const PipelinesViewServer = async () => {
  noStore();
  const initialPipelineRuns = await getPipelineRuns({
    page: 1,
    pageSize: 25,
  });

  return <PipelinesView initialPipelineRuns={initialPipelineRuns} />;
};
