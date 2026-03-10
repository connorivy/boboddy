import { InProcessDomainEventBus } from "@/lib/domain-events/in-process-domain-event-bus";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { JiraTicketRepoByHttpClient } from "@/modules/tickets/infra/jira-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { DrizzleTicketVectorRepo } from "@/modules/step-executions/ticket_duplicate_candidates/infra/ticket-vector.repository";
import { DrizzleEnvironmentRepo } from "@/modules/environments/infra/drizzle-environment-repo";
import { DrizzleTicketGitEnvironmentRepo } from "@/modules/environments/infra/drizzle-ticket-git-environment-repo";
import { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";
import { DrizzlePipelineRunRepo } from "@/modules/pipeline-runs/infra/drizzle-pipeline-run-repo";
import { QueueNextPipelineStepOnStepExecutionCompleted } from "@/modules/pipeline-runs/application/queue-next-pipeline-step-on-step-execution-completed";
import { STEP_EXECUTION_COMPLETED_DOMAIN_EVENT_TYPE } from "@/modules/step-executions/domain/step-execution-completed.domain-event";
import { appTimeProvider, type TimeProvider } from "@/lib/time-provider";

let githubServiceInstance: GithubApiService | null = null;
const domainEventBus = new InProcessDomainEventBus();
const stepExecutionRepo = new DrizzleStepExecutionRepo(domainEventBus);
const pipelineRunRepo = new DrizzlePipelineRunRepo();

domainEventBus.register(
  STEP_EXECUTION_COMPLETED_DOMAIN_EVENT_TYPE,
  new QueueNextPipelineStepOnStepExecutionCompleted(
    stepExecutionRepo,
    pipelineRunRepo,
  ),
);

const getGithubService = (): GithubApiService => {
  if (!githubServiceInstance) {
    githubServiceInstance = new GithubApiService();
  }

  return githubServiceInstance;
};

export const AppContext = {
  ticketRepo: new DrizzleTicketRepo(),
  jiraTicketRepo: new JiraTicketRepoByHttpClient(),
  stepExecutionRepo,
  ticketVectorRepo: new DrizzleTicketVectorRepo(),
  environmentRepo: new DrizzleEnvironmentRepo(),
  ticketGitEnvironmentRepo: new DrizzleTicketGitEnvironmentRepo(),
  pipelineRunRepo,
  domainEventBus,
  get timeProvider() {
    return appTimeProvider.current;
  },
  set timeProvider(timeProvider: TimeProvider) {
    appTimeProvider.current = timeProvider;
  },
  get githubService() {
    return getGithubService();
  },
};
