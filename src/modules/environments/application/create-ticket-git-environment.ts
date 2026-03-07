"use server";
import { AppContext } from "@/lib/di";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { Octokit } from "octokit";
import {
  type CreateEnvironmentRequest,
  type TicketGitEnvironmentResponse,
  createEnvironmentRequestSchema,
  parseEnvironmentId,
} from "../contracts/environment-contracts";
import { TicketGitEnvironmentAggregate } from "../domain/ticket-git-environment-aggregate";
import { EnvironmentRepo } from "./environment-repo";
import { ticketGitEnvironmentAggregateToContract } from "./ticket-git-environment-aggregate-to-contract";
import type { TicketGitEnvironmentRepo } from "./ticket-git-environment-repo";

export async function createTicketGitEnvironment(
  rawInput: CreateEnvironmentRequest,
  {
    ticketRepo,
    environmentRepo,
    ticketGitEnvironmentRepo,
  }: {
    ticketRepo: TicketRepo;
    environmentRepo: EnvironmentRepo;
    ticketGitEnvironmentRepo: TicketGitEnvironmentRepo;
  } = AppContext,
): Promise<TicketGitEnvironmentResponse> {
  console.log("Assigning environment with input:", rawInput);
  const input = createEnvironmentRequestSchema.parse(rawInput);
  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket ${input.ticketId} not found`);
  }

  const baseEnvironmentId =
    input.baseEnvironmentId ??
    (
      await environmentRepo.loadByTicketIdKeyOrMostRecentlyUpdatedHealthy(
        input.ticketId,
      )
    ).environmentId;

  const { normalizedEnvironmentId } = parseEnvironmentId(baseEnvironmentId);

  const devBranch =
    input.devBranch?.trim() ?? buildDevBranch(normalizedEnvironmentId);
  const baseEnvironmentDefaultBranch = buildEnvironmentDefaultBranch(
    normalizedEnvironmentId,
  );
  const octokit = new Octokit({ auth: getRequiredEnv("GITHUB_TOKEN") });
  const { owner, repo } = getRepoCoordinates();
  console.log(`Using GitHub repository: ${owner}/${repo}`);
  console.log(
    `Base environment default branch: ${baseEnvironmentDefaultBranch}`,
  );
  console.log(`Dev branch to create: ${devBranch}`);
  const baseRef = await octokit.request(
    "GET /repos/{owner}/{repo}/git/ref/{ref}",
    {
      owner,
      repo,
      ref: `heads/${baseEnvironmentDefaultBranch}`,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  const baseSha = baseRef.data.object.sha;

  try {
    await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
      owner,
      repo,
      ref: `refs/heads/${devBranch}`,
      sha: baseSha,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    });
  } catch (error) {
    console.error("Error creating dev branch:", error);
    const status = getGitHubErrorStatus(error);
    const message = getGitHubErrorMessage(error) ?? "";
    const isAlreadyExistsError = /already exists/i.test(message);

    if (status !== 422 || !isAlreadyExistsError) {
      throw error;
    }

    const existingDevRef = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      {
        owner,
        repo,
        ref: `heads/${devBranch}`,
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
    const existingDevSha = existingDevRef.data.object.sha;

    if (existingDevSha !== baseSha) {
      throw new Error(
        `Branch ${devBranch} already exists and was not created from ${baseEnvironmentDefaultBranch}`,
      );
    }
  }

  const persistedEnvironment = await ticketGitEnvironmentRepo.save(
    new TicketGitEnvironmentAggregate(
      input.ticketId,
      baseEnvironmentId,
      devBranch,
    ),
  );

  if (persistedEnvironment.id === undefined) {
    throw new Error("Ticket git environment ID missing after persistence");
  }

  return ticketGitEnvironmentAggregateToContract(persistedEnvironment);
}

const getRepoCoordinates = (): { owner: string; repo: string } => {
  const fromPair = process.env.GITHUB_REPOSITORY?.trim();
  if (fromPair) {
    const [owner, repo, ...rest] = fromPair.split("/");
    if (owner && repo && rest.length === 0) {
      return { owner, repo };
    }
  }

  return {
    owner: getRequiredEnv("GITHUB_REPO_OWNER"),
    repo: getRequiredEnv("GITHUB_REPO_NAME"),
  };
};

const getGitHubErrorStatus = (error: unknown): number | null => {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }

  const { status } = error as { status?: unknown };
  return typeof status === "number" ? status : null;
};

const getGitHubErrorMessage = (error: unknown): string | null => {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  if (
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return null;
};

const buildDevBranch = (environmentId: string): string =>
  `ephemeral-${environmentId.toUpperCase().replace("-", "")}-dev${Math.floor(Math.random() * 1000)}`;

const buildEnvironmentDefaultBranch = (environmentId: string): string =>
  `ephemeral-${environmentId.toUpperCase().replace("-", "")}`;

const getRequiredEnv = (
  name: "GITHUB_TOKEN" | "GITHUB_REPO_OWNER" | "GITHUB_REPO_NAME",
): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
};
