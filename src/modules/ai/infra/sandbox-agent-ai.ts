import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { generateText, Output } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
  type StepExecutionStepName,
} from "@/modules/step-executions/domain/step-execution.types";
import { completeTicketDescriptionEnrichmentStepRequestBodySchema } from "@/modules/step-executions/ticket_description_enrichment/contracts/complete-ticket-description-enrichment-step-contracts";
import { completeTicketFailingTestFixStepRequestBodySchema } from "@/modules/step-executions/github_fix_failing_test/contracts/complete-ticket-failing-test-fix-step-contracts";
import { completeTicketFailingTestReproStepRequestBodySchema } from "@/modules/step-executions/github_repro_failing_test/contracts/complete-ticket-failing-test-repro-step-contracts";

const MAX_TREE_ENTRIES = 200;
const MAX_FILE_BYTES = 12_000;

const githubModels = createOpenAICompatible({
  name: "github-models",
  baseURL: "https://models.github.ai/inference",
  apiKey: process.env.GITHUB_MODELS_API_KEY,
});

function getRequiredEnv(name: "GITHUB_MODELS_API_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function getSandboxModel() {
  getRequiredEnv("GITHUB_MODELS_API_KEY");
  const modelName =
    process.env.SANDBOX_AGENT_MODEL?.trim() || "openai/gpt-4.1-mini";
  return githubModels(modelName);
}

async function walkWorkspace(
  root: string,
  current = root,
  entries: string[] = [],
): Promise<string[]> {
  if (entries.length >= MAX_TREE_ENTRIES) {
    return entries;
  }

  const children = await readdir(current, { withFileTypes: true });
  children.sort((a, b) => a.name.localeCompare(b.name));

  for (const child of children) {
    if (entries.length >= MAX_TREE_ENTRIES) {
      break;
    }

    if (
      child.name === ".git" ||
      child.name === "node_modules" ||
      child.name === ".next"
    ) {
      continue;
    }

    const childPath = join(current, child.name);
    const relPath = relative(root, childPath) || ".";
    entries.push(child.isDirectory() ? `${relPath}/` : relPath);

    if (child.isDirectory()) {
      await walkWorkspace(root, childPath, entries);
    }
  }

  return entries;
}

async function readContextFile(workspacePath: string, filePath: string) {
  const absolutePath = join(workspacePath, filePath);
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return null;
    }

    const contents = await readFile(absolutePath, "utf8");
    return `File: ${filePath}\n${contents.slice(0, MAX_FILE_BYTES)}`;
  } catch {
    return null;
  }
}

async function buildRepoContext(workspacePath: string): Promise<string> {
  const tree = await walkWorkspace(workspacePath);
  const snippets = await Promise.all(
    [
      "package.json",
      "README.md",
      "boboddy-state.json",
      "src/app/api/webhooks/failing-test-repro-step-output/route.ts",
      "src/app/api/webhooks/failing-test-fix-step-output/route.ts",
      "src/app/api/webhooks/ticket-investigation-step-output/route.ts",
    ].map((filePath) => readContextFile(workspacePath, filePath)),
  );

  return [
    "Repository file tree:",
    tree.map((entry) => `- ${entry}`).join("\n"),
    "",
    "Selected file contents:",
    snippets.filter(Boolean).join("\n\n---\n\n"),
  ]
    .filter((part) => part.trim().length > 0)
    .join("\n");
}

function getSchemaForStep(stepName: StepExecutionStepName): z.ZodTypeAny {
  if (stepName === TICKET_INVESTIGATION_STEP_NAME) {
    return completeTicketDescriptionEnrichmentStepRequestBodySchema;
  }

  if (stepName === FAILING_TEST_REPRO_STEP_NAME) {
    return completeTicketFailingTestReproStepRequestBodySchema;
  }

  if (stepName === FAILING_TEST_FIX_STEP_NAME) {
    return completeTicketFailingTestFixStepRequestBodySchema;
  }

  throw new Error(`Unsupported sandbox step "${stepName}"`);
}

type GenerateSandboxAgentPayloadInput = {
  workspacePath: string;
  stepName: StepExecutionStepName;
  customInstructions: string;
};

export async function generateSandboxAgentPayload(
  input: GenerateSandboxAgentPayloadInput,
): Promise<Record<string, unknown>> {
  const schema = getSchemaForStep(input.stepName);
  const repoContext = await buildRepoContext(input.workspacePath);

  const prompt = [
    input.customInstructions,
    "",
    "You are running inside a sandbox with a checked-out repository.",
    "Use the repository context below to complete the task.",
    "Return only the structured result body that matches the required schema.",
    "",
    repoContext,
  ].join("\n");

  const { output } = await generateText({
    model: getSandboxModel(),
    output: Output.object({ schema }),
    prompt,
  });

  return schema.parse(output) as Record<string, unknown>;
}

export const sandboxAgentAiInternals = {
  buildRepoContext,
};
