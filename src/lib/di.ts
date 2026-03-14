import { InProcessDomainEventBus } from "@/lib/domain-events/in-process-domain-event-bus";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { JiraTicketRepoByHttpClient } from "@/modules/tickets/infra/jira-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { DrizzleTicketVectorRepo } from "@/modules/step-executions/ticket_duplicate_candidates/infra/ticket-vector.repository";
import { DrizzleEnvironmentRepo } from "@/modules/environments/infra/drizzle-environment-repo";
import { DrizzleTicketGitEnvironmentRepo } from "@/modules/environments/infra/drizzle-ticket-git-environment-repo";
import {
  createAgentRunLauncher,
  type AgentRunLauncher,
} from "@/modules/ai/infra/agent-run-launcher";
import { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";
import { DrizzlePipelineRunRepo } from "@/modules/pipeline-runs/infra/drizzle-pipeline-run-repo";
import { QueueNextPipelineStepOnStepExecutionCompleted } from "@/modules/pipeline-runs/application/queue-next-pipeline-step-on-step-execution-completed";
import { PipelineAdvancementPolicy } from "@/modules/pipeline-runs/domain/pipeline-advancement-policy";
import { STEP_EXECUTION_COMPLETED_DOMAIN_EVENT_TYPE } from "@/modules/step-executions/domain/step-execution-completed.domain-event";
import { systemTimeProvider, TimeProvider } from "@/lib/time-provider";

export function createAppContext(customTimeProvider?: TimeProvider) {
  let githubServiceInstance: GithubApiService | null = null;
  let agentRunLauncherInstance: AgentRunLauncher | null = null;
  const domainEventBus = new InProcessDomainEventBus();
  const timeProvider = customTimeProvider ?? systemTimeProvider;
  const stepExecutionRepo = new DrizzleStepExecutionRepo(
    domainEventBus,
    timeProvider,
  );
  const pipelineRunRepo = new DrizzlePipelineRunRepo();
  const ticketRepo = new DrizzleTicketRepo(undefined, undefined, timeProvider);

  domainEventBus.register(
    STEP_EXECUTION_COMPLETED_DOMAIN_EVENT_TYPE,
    new QueueNextPipelineStepOnStepExecutionCompleted(
      stepExecutionRepo,
      pipelineRunRepo,
      new PipelineAdvancementPolicy(timeProvider),
    ),
  );

  const getGithubService = (): GithubApiService => {
    if (!githubServiceInstance) {
      githubServiceInstance = new GithubApiService();
    }

    return githubServiceInstance;
  };

  const context = {
    timeProvider,
    ticketRepo,
    jiraTicketRepo: new JiraTicketRepoByHttpClient(),
    stepExecutionRepo,
    ticketVectorRepo: new DrizzleTicketVectorRepo(),
    environmentRepo: new DrizzleEnvironmentRepo(),
    ticketGitEnvironmentRepo: new DrizzleTicketGitEnvironmentRepo(),
    pipelineRunRepo,
    domainEventBus,
    get githubService() {
      return getGithubService();
    },
    get agentRunLauncher() {
      if (!agentRunLauncherInstance) {
        agentRunLauncherInstance = createAgentRunLauncher(context.githubService);
      }

      return agentRunLauncherInstance;
    },
  };

  return context;
}

export type AppContext = ReturnType<typeof createAppContext>;

export const AppContext = createAppContext();
