import { spawn } from "node:child_process";
import { z } from "zod";

export type RankTicketDescriptionInput = {
  title: string;
  description: string;
};

export type RankTicketDescriptionOutput = {
  stepsToReproduceScore: number;
  expectedBehaviorScore: number;
  observedBehaviorScore: number;
  reasoning: string;
  rawResponse: string;
};

export interface TicketDescriptionQualityAi {
  rankTicketDescription(
    input: RankTicketDescriptionInput,
  ): Promise<RankTicketDescriptionOutput>;
}

const codexResponseSchema = z.object({
  stepsToReproduceScore: z.number().min(0).max(1),
  expectedBehaviorScore: z.number().min(0).max(1),
  observedBehaviorScore: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

const buildPrompt = (
  input: RankTicketDescriptionInput,
): string => `You are evaluating ticket quality.
Given the ticket title and description below, rank from 0 to 1 (1 is best) how well the ticket describes:
1. Steps to reproduce
2. Expected behavior
3. Observed behavior (including any error messages)

Return strictly valid JSON using exactly this shape:
{
  "stepsToReproduceScore": 0-1,
  "expectedBehaviorScore": 0-1,
  "observedBehaviorScore": 0-1,
  "reasoning": "brief explanation"
}

Ticket title:
${input.title}

Ticket description:
${input.description}
`;

const extractJsonObject = (rawOutput: string): string => {
  const start = rawOutput.indexOf("{");
  const end = rawOutput.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    const snippet = rawOutput.slice(0, 500);
    throw new Error(
      `Codex CLI did not return valid JSON object. Output snippet: ${snippet || "[empty]"}`,
    );
  }
  return rawOutput.slice(start, end + 1);
};

const runCodexCli = (prompt: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn("codex", ["exec", prompt], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Codex CLI timed out"));
    }, 120_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Codex CLI failed: ${stderr || `exit ${code}`}`));
        return;
      }
      resolve(stdout.trim());
    });
  });

export class CodexCliTicketDescriptionQualityAi implements TicketDescriptionQualityAi {
  async rankTicketDescription(
    input: RankTicketDescriptionInput,
  ): Promise<RankTicketDescriptionOutput> {
    const rawResponse = await runCodexCli(buildPrompt(input));
    let parsed: z.infer<typeof codexResponseSchema>;
    try {
      parsed = codexResponseSchema.parse(
        JSON.parse(extractJsonObject(rawResponse)),
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown parse error";
      const snippet = rawResponse.slice(0, 500) || "[empty]";
      throw new Error(
        `Could not parse ticket description quality response from Codex CLI: ${reason}. Raw response snippet: ${snippet}`,
      );
    }

    return {
      ...parsed,
      rawResponse,
    };
  }
}
