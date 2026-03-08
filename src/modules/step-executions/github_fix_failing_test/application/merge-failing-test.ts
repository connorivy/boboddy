"use server";

import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";
import { TicketGitEnvironmentRepo } from "@/modules/environments/application/ticket-git-environment-repo";
import { AppContext } from "@/lib/di";
import { FailingTestReproStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export async function mergeFailingTest(
  ticketId: string,
  stepId: number,
  {
    ticketRepo,
    ticketGitEnvironmentRepo,
    stepExecutionRepo,
    githubService,
  }: {
    ticketRepo: TicketRepo;
    ticketGitEnvironmentRepo: TicketGitEnvironmentRepo;
    stepExecutionRepo: StepExecutionRepo;
    githubService: GithubApiService;
  } = AppContext,
): Promise<void> {
  const ticket = await ticketRepo.loadById(ticketId);

  if (!ticket) {
    throw new Error(`Ticket with ID ${ticketId} not found`);
  }

  if (!ticket.defaultGitEnvironmentId) {
    throw new Error(
      `Ticket with ID ${ticketId} does not have a default git environment set`,
    );
  }

  const gitEnvironment = await ticketGitEnvironmentRepo.loadById(
    ticket.defaultGitEnvironmentId,
  );
  if (!gitEnvironment) {
    throw new Error(
      `Git environment with ID ${ticket.defaultGitEnvironmentId} not found`,
    );
  }

  const stepExecution = await stepExecutionRepo.load(stepId);
  if (!stepExecution) {
    throw new Error(`Step execution with ID ${stepId} not found`);
  }

  if (!(stepExecution instanceof FailingTestReproStepExecutionEntity)) {
    throw new Error(
      `Step execution with ID ${stepId} is not a failing test repro step`,
    );
  }

  if (stepExecution.ticketId !== ticketId) {
    throw new Error(
      `Step execution with ID ${stepId} does not belong to ticket ${ticketId}`,
    );
  }

  if (stepExecution.status !== "succeeded") {
    throw new Error(
      `Step execution with ID ${stepId} has status '${stepExecution.status}' and cannot be merged`,
    );
  }

  if (!stepExecution.result) {
    throw new Error(
      `Step execution with ID ${stepId} does not have a failing test repro result payload`,
    );
  }

  if (
    stepExecution.result.githubPrTargetBranch?.trim() !==
    gitEnvironment.devBranch.trim()
  ) {
    throw new Error(
      `Step execution with ID ${stepId} does not target the default Git environment branch (${gitEnvironment.devBranch})`,
    );
  }

  if (!stepExecution.result.githubIssueNumber) {
    throw new Error(
      `Failing test repro step does not have an associated GitHub issue number`,
    );
  }

  await githubService.mergePullRequest(stepExecution.result.githubIssueNumber);
  stepExecution.result.githubMergeStatus = "merged";
  await stepExecutionRepo.save(stepExecution);
}
