import { spawn } from "node:child_process";
import { z } from "zod";

export type EnrichTicketDescriptionInput = {
  ticketId: string;
  ticketNumber: string;
  title: string;
  description: string;
  companyNames: string[];
  employeeEmails: string[];
  postgresMcpConnectionString?: string;
};

export type EnrichTicketDescriptionOutput = {
  operationOutcome:
    | "enriched"
    | "insufficient_evidence"
    | "agent_error"
    | "cancelled";
  summaryOfEnrichment: string;
  enrichedTicketDescription: string;
  confidenceLevel: number | null;
  datadogQueryTerms: string[];
  datadogTimeRange: string | null;
  keyIdentifiers: string[];
  rawResultJson: Record<string, unknown>;
  rawResponse: string;
};

export interface TicketDescriptionEnrichmentAi {
  enrichTicketDescription(
    input: EnrichTicketDescriptionInput,
  ): Promise<EnrichTicketDescriptionOutput>;
}

const codexResponseSchema = z.object({
  operationOutcome: z.enum([
    "enriched",
    "insufficient_evidence",
    "agent_error",
    "cancelled",
  ]),
  summaryOfEnrichment: z.string().min(1),
  enrichedTicketDescription: z.string().min(1),
  confidenceLevel: z.number().min(0).max(1).nullable(),
  datadogQueryTerms: z.array(z.string().min(1)),
  datadogTimeRange: z.string().min(1).nullable(),
  keyIdentifiers: z.array(z.string().min(1)),
  rawResultJson: z.record(z.string(), z.unknown()).default({}),
});

const buildPrompt = (
  input: EnrichTicketDescriptionInput,
): string => `You are enriching a support ticket with actionable debugging context.

Return strictly valid JSON using exactly this shape:
{
  "operationOutcome": "enriched" | "insufficient_evidence" | "agent_error" | "cancelled",
  "summaryOfEnrichment": "...",
  "enrichedTicketDescription": "...",
  "confidenceLevel": 0..1 or null,
  "datadogQueryTerms": ["..."],
  "datadogTimeRange": "..." or null,
  "keyIdentifiers": ["..."],
  "rawResultJson": { ... }
}

Rules:
- Include concrete evidence and identifiers when available.
- If Datadog evidence is unavailable in this environment, set operationOutcome to "insufficient_evidence" and explain what queries would be run.
- Keep summary concise and enrichedTicketDescription ticket-ready.

Ticket ID: ${input.ticketId}
Ticket number: ${input.ticketNumber}
Title: ${input.title}
Description:
${input.description}

Company names: ${input.companyNames.join(", ") || "none"}
Employee emails: ${input.employeeEmails.join(", ") || "none"}
`;

const extractJsonObject = (rawOutput: string): string => {
  const start = rawOutput.indexOf("{");
  const end = rawOutput.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Codex CLI did not return valid JSON");
  }
  return rawOutput.slice(start, end + 1);
};

const escapeCodexConfigString = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const buildCodexArgs = (
  prompt: string,
  postgresMcpConnectionString?: string,
): string[] => {
  if (!postgresMcpConnectionString) {
    return ["exec", prompt];
  }

  const escapedConnectionString = escapeCodexConfigString(
    postgresMcpConnectionString,
  );

  return [
    "-c",
    'mcp_servers.pg_local.command="npx"',
    "-c",
    'mcp_servers.pg_local.args=["-y","@modelcontextprotocol/server-postgres"]',
    "-c",
    `mcp_servers.pg_local.env={DATABASE_URL="${escapedConnectionString}"}`,
    "exec",
    prompt,
  ];
};

const runCodexCli = (
  prompt: string,
  postgresMcpConnectionString?: string,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "codex",
      buildCodexArgs(prompt, postgresMcpConnectionString),
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(
      () => {
        child.kill();
        reject(new Error("Codex CLI timed out"));
      },
      10 * 60 * 1000, // 10 minutes
    );

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

export class CodexCliTicketDescriptionEnrichmentAi implements TicketDescriptionEnrichmentAi {
  async enrichTicketDescription(
    input: EnrichTicketDescriptionInput,
  ): Promise<EnrichTicketDescriptionOutput> {
    const rawResponse = await runCodexCli(
      buildPrompt(input),
      input.postgresMcpConnectionString,
    );
    const parsed = codexResponseSchema.parse(
      JSON.parse(extractJsonObject(rawResponse)),
    );

    return {
      ...parsed,
      rawResponse,
    };
  }
}
