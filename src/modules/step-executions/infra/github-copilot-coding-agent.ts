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
  customAgent?: string;
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
          ...(input.customAgent
            ? { custom_agent: input.customAgent }
            : {}),
        },
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
  }

  private async findOpenPullRequestByBranches(
    base: string,
    target: string,
  ) {
    const head = `${this.repo.owner}:${target}`;
    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls",
      {
        owner: this.repo.owner,
        repo: this.repo.repo,
        state: "open",
        base,
        head,
        per_page: 1,
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );

    return response.data.find(
      (candidate) =>
        candidate.base.ref === base && candidate.head.ref === target,
    );
  }

  async mergePullRequest(base: string, target: string): Promise<void> {
    const pull = await this.findOpenPullRequestByBranches(base, target);

    if (!pull) {
      throw new Error(
        `No open PR found for base branch "${base}" and target branch "${target}"`,
      );
    }

    await this.octokit.request(
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
      {
        owner: this.repo.owner,
        repo: this.repo.repo,
        pull_number: pull.number,
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
  }

  async markPullRequestReadyForReview(
    base: string,
    target: string,
  ): Promise<void> {
    const pull = await this.findOpenPullRequestByBranches(base, target);

    if (!pull) {
      throw new Error(
        `No open PR found for base branch "${base}" and target branch "${target}"`,
      );
    }

    if (!pull.draft) {
      return;
    }

    await this.octokit.graphql(
      `
        mutation MarkPullRequestReadyForReview($pullRequestId: ID!) {
          markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
            pullRequest {
              id
              isDraft
            }
          }
        }
      `,
      {
        pullRequestId: pull.node_id,
        headers: {
          "x-github-api-version": "2022-11-28",
        },
      },
    );
  }

  async commentOnIssue(issueNum: number, message: string): Promise<void> {
    await this.octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        owner: this.repo.owner,
        repo: this.repo.repo,
        issue_number: issueNum,
        body: message,
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
  }

  async commentOnPrByBranches(
    base: string,
    target: string,
    message: string,
  ): Promise<void> {
    const pull = await this.findOpenPullRequestByBranches(base, target);

    if (!pull) {
      throw new Error(
        `No open PR found for base branch "${base}" and target branch "${target}"`,
      );
    }

    await this.commentOnIssue(pull.number, message);
  }

  async getShaIfExists(
    filePath: string,
    branchName: string,
  ): Promise<string | null> {
    try {
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner: this.repo.owner,
          repo: this.repo.repo,
          path: filePath,
          ref: branchName,
          headers: {
            accept: "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
          },
        },
      );

      if (Array.isArray(response.data)) {
        throw new Error(`Path ${filePath} is a directory, expected a file`);
      }

      return response.data.sha;
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 404
      ) {
        return null;
      }

      throw error;
    }
  }

  async upsertFile(
    filePath: string,
    branchName: string,
    contents: string,
  ): Promise<void> {
    const sha = await this.getShaIfExists(filePath, branchName);
    const encodedContents = Buffer.from(contents, "utf8").toString("base64");

    await this.octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner: this.repo.owner,
      repo: this.repo.repo,
      path: filePath,
      branch: branchName,
      message: `chore: upsert ${filePath}`,
      content: encodedContents,
      ...(sha ? { sha } : {}),
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    });
  }
}
