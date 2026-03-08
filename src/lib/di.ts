import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { JiraTicketRepoByHttpClient } from "@/modules/tickets/infra/jira-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { DrizzleTicketVectorRepo } from "@/modules/step-executions/ticket_duplicate_candidates/infra/ticket-vector.repository";
import { DrizzleEnvironmentRepo } from "@/modules/environments/infra/drizzle-environment-repo";
import { DrizzleTicketGitEnvironmentRepo } from "@/modules/environments/infra/drizzle-ticket-git-environment-repo";
import { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";

let githubServiceInstance: GithubApiService | null = null;
const getGithubService = (): GithubApiService => {
  if (!githubServiceInstance) {
    githubServiceInstance = new GithubApiService();
  }

  return githubServiceInstance;
};

export const AppContext = {
  ticketRepo: new DrizzleTicketRepo(),
  jiraTicketRepo: new JiraTicketRepoByHttpClient(),
  stepExecutionRepo: new DrizzleStepExecutionRepo(),
  ticketVectorRepo: new DrizzleTicketVectorRepo(),
  environmentRepo: new DrizzleEnvironmentRepo(),
  ticketGitEnvironmentRepo: new DrizzleTicketGitEnvironmentRepo(),
  get githubService() {
    return getGithubService();
  },
};
