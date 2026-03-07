import { unstable_noStore as noStore } from "next/cache";
import { PipelinesView } from "@/components/pipelines-view";
import { getPipelineStepExecutions } from "@/modules/step-executions/application/get-pipeline-step-executions";

export const PipelinesViewServer = async () => {
  noStore();
  const initialStepExecutions = await getPipelineStepExecutions({
    page: 1,
    pageSize: 25,
  });

  return <PipelinesView initialStepExecutions={initialStepExecutions} />;
};
