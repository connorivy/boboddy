import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { JiraTicketRepoByHttpClient } from "@/modules/tickets/infra/jira-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { DrizzleTicketVectorRepo } from "@/modules/step-executions/infra/ticket-vector.repository";
import { DrizzlePipelineRunRepo } from "@/modules/pipeline-runs/infra/pipeline-run-repo";
import { DrizzleEnvironmentRepo } from "@/modules/environments/infra/drizzle-environment-repo";
import { DrizzleTicketGitEnvironmentRepo } from "@/modules/environments/infra/drizzle-ticket-git-environment-repo";
import { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";

let githubServiceInstance: GithubApiService | null = null;
let jiraTicketRepoInstance: JiraTicketRepoByHttpClient | null = null;

const getJiraTicketRepo = (): JiraTicketRepoByHttpClient => {
  if (!jiraTicketRepoInstance) {
    jiraTicketRepoInstance = new JiraTicketRepoByHttpClient();
  }

  return jiraTicketRepoInstance;
};

const getGithubService = (): GithubApiService => {
  if (!githubServiceInstance) {
    githubServiceInstance = new GithubApiService();
  }

  return githubServiceInstance;
};

export const AppContext = {
  ticketRepo: new DrizzleTicketRepo(),
  stepExecutionRepo: new DrizzleStepExecutionRepo(),
  pipelineRunRepo: new DrizzlePipelineRunRepo(),
  ticketVectorRepo: new DrizzleTicketVectorRepo(),
  environmentRepo: new DrizzleEnvironmentRepo(),
  ticketGitEnvironmentRepo: new DrizzleTicketGitEnvironmentRepo(),
  get jiraTicketRepo() {
    return getJiraTicketRepo();
  },
  get githubService() {
    return getGithubService();
  },
};
