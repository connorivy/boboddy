import { startSandboxAgentService } from "@/modules/ai/infra/sandbox-agent-service";
import { startQueuedStepExecutionWorker } from "@/worker/queued-step-execution-worker";

startSandboxAgentService();
void startQueuedStepExecutionWorker();
