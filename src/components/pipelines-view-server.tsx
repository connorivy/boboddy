import { unstable_noStore as noStore } from "next/cache";
import { PipelinesView } from "@/components/pipelines-view";
import { getPipelines } from "@/modules/pipeline-runs/application/get-pipelines";
import { getPipelineStepExecutions } from "@/modules/step-executions/application/get-pipeline-step-executions";

export const PipelinesViewServer = async () => {
  noStore();
  const initialPipelines = await getPipelines({
    page: 1,
    pageSize: 25,
    q: "",
  });
  const initialStepExecutions = await getPipelineStepExecutions({
    page: 1,
    pageSize: 25,
    q: "",
  });

  return (
    <PipelinesView
      initialPipelines={initialPipelines}
      initialStepExecutions={initialStepExecutions}
    />
  );
};
