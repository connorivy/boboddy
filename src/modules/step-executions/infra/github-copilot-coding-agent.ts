import { Octokit } from "@octokit/rest";

type RepoCoordinates = {
  owner: string;
  repo: string;
};

export type CreateIssueAndAssignCopilotInput = {
  title: string;
  body: string;
};

export type CreateIssueOutput = {
  issueNumber: number;
  issueId: string;
};

export type AssignCopilotInput = {
  issueNumber: number;
  baseBranch: string;
  customInstructions: string;
};

const COPILOT_MODEL = "gpt-5.3-codex";

const getRequiredEnv = (
  name: "GITHUB_TOKEN" | "GITHUB_REPO_OWNER" | "GITHUB_REPO_NAME",
): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
};

const getRepoCoordinates = (): RepoCoordinates => {
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

export class GithubApiService {
  private readonly octokit: Octokit;
  private readonly repo: RepoCoordinates;

  constructor() {
    this.octokit = new Octokit({ auth: getRequiredEnv("GITHUB_TOKEN") });
    this.repo = getRepoCoordinates();
  }

  async createIssue(
    input: CreateIssueAndAssignCopilotInput,
  ): Promise<CreateIssueOutput> {
    const createIssueResponse = await this.octokit.request(
      "POST /repos/{owner}/{repo}/issues",
      {
        owner: this.repo.owner,
        repo: this.repo.repo,
        title: input.title,
        body: input.body,
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );

    return {
      issueNumber: createIssueResponse.data.number,
      issueId: createIssueResponse.data.node_id,
    };
  }

  async unassignCopilot(issueNumber: number): Promise<void> {
    await this.octokit.request(
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/assignees",
      {
        owner: this.repo.owner,
        repo: this.repo.repo,
        issue_number: issueNumber,
        assignees: ["copilot-swe-agent[bot]"],
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
  }

  async assignCopilot(input: AssignCopilotInput): Promise<void> {
    const repository = `${this.repo.owner}/${this.repo.repo}`;

    await this.octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/assignees",
      {
        owner: this.repo.owner,
        repo: this.repo.repo,
        issue_number: input.issueNumber,
        assignees: ["copilot-swe-agent[bot]"],
        agent_assignment: {
          target_repo: repository,
          base_branch: input.baseBranch,
          model: COPILOT_MODEL,
          custom_instructions: input.customInstructions,
        },
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
  }

  async mergePullRequest(prNumber: number): Promise<void> {
    await this.octokit.request(
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
      {
        owner: this.repo.owner,
        repo: this.repo.repo,
        pull_number: prNumber,
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
  }
}
