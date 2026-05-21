import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { loadAuthProfile } from "../../../auth/session/infra/auth-storage";
import { createLogger } from "../../../lib/logger";
import { createUuidV7, parseUuidV7 } from "../../../common/contracts/uuid-v7";
import { DockerAiContainerLauncher } from "../../../runtime/runtime-service/infra/docker-ai-container-launcher";
import { analyzeRepo, type RepoAnalysis } from "./repo-analysis";

const DEVCONTAINER_CONFIG_CANDIDATES = [
  ".devcontainer/devcontainer.json",
  "devcontainer.json",
] as const;

const POLL_INTERVAL_MS = 2_000;
const MAX_WAIT_MS = 120_000;

const logger = createLogger({
  name: "@boboddy/worker",
  level: process.env["BOBODDY_LOG_LEVEL"] ?? "info",
}).child({ scope: "ensure-devcontainer" });

export async function hasDevcontainer(rootDir: string): Promise<boolean> {
  for (const candidate of DEVCONTAINER_CONFIG_CANDIDATES) {
    try {
      await access(path.join(rootDir, candidate));
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

export function buildPrompt(
  analysis: RepoAnalysis,
  packageJsonContent: string,
): string {
  const frameworkLabel =
    analysis.framework === "nextjs"
      ? "Next.js"
      : analysis.framework === "vite"
        ? "Vite + React"
        : analysis.framework === "react"
          ? "React"
          : "unknown";

  return `Create a devcontainer configuration for this project at .devcontainer/devcontainer.json.

Project context:
- Framework: ${frameworkLabel}
- Has Playwright tests: ${analysis.hasPlaywright ? "yes" : "no"}
- package.json: ${packageJsonContent}

Guidelines:
- Choose an appropriate base image for the stack (node, bun, etc.)
- Forward the dev server port (infer from scripts in package.json)
- Include VS Code extensions relevant to the framework
- Keep it minimal — prefer just creating a devcontainer.json. Create Dockerfile or docker-compose.yml only if required
`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function ensureDevcontainer(input: {
  baseUrl: string;
  projectId: string;
  confirmed: boolean;
  workspacePath?: string;
}): Promise<void> {
  const rootDir = input.workspacePath ?? process.cwd();

  if (await hasDevcontainer(rootDir)) {
    logger.info("Devcontainer config found, skipping.");
    return;
  }

  if (!input.confirmed) {
    logger.info("Skipped devcontainer generation.");
    return;
  }

  const profile = loadAuthProfile(input.baseUrl);
  const requestedByUserId = profile?.userId
    ? parseUuidV7(profile.userId)
    : createUuidV7();

  let packageJsonContent = "not found";
  try {
    packageJsonContent = await readFile(
      path.join(rootDir, "package.json"),
      "utf8",
    );
  } catch {
    // no package.json
  }

  const analysis = await analyzeRepo(rootDir);
  const prompt = buildPrompt(analysis, packageJsonContent);

  const launcher = new DockerAiContainerLauncher();
  logger.info("Launching AI container to generate devcontainer config...");

  const aiResult = await launcher.launch({
    sessionId: createUuidV7(),
    projectId: parseUuidV7(input.projectId),
    requestedByUserId,
    workspacePath: rootDir,
  });

  try {
    const client = createOpencodeClient({
      baseUrl: aiResult.baseUrl,
      directory: "/workspace",
    });

    const sessionResponse = await client.session.create({
      body: { title: "Generate devcontainer config" },
    });
    const sessionId = sessionResponse.data?.id;

    if (!sessionId) {
      throw new Error("OpenCode did not return a session id");
    }

    await client.session.promptAsync({
      path: { id: sessionId },
      body: { parts: [{ type: "text", text: prompt }] },
    });

    logger.info("Waiting for AI to generate devcontainer config...");

    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      const statusMap = (await client.session.status()).data ?? {};
      const status = statusMap[sessionId];
      if (!status || status.type === "idle") {
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }
  } finally {
    await launcher.stop(aiResult.containerId);
  }

  const generated = await hasDevcontainer(rootDir);
  if (generated) {
    logger.info(
      "Devcontainer config generated at .devcontainer/devcontainer.json",
    );
  } else {
    logger.warn(
      "AI did not create a devcontainer config. Create one manually before running boboddy.",
    );
  }
}
