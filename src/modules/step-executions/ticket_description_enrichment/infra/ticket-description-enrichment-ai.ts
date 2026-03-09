import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  type TicketDescriptionEnrichmentCodeUnit,
  ticketDescriptionEnrichmentEvidenceFieldsSchema,
  type TicketDescriptionEnrichmentDatabaseFinding,
  type TicketDescriptionEnrichmentDatadogSessionFinding,
  type TicketDescriptionEnrichmentLogFinding,
} from "@/modules/step-executions/ticket_description_enrichment/shared/ticket-description-enrichment-result";

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
    | "findings_recorded"
    | "inconclusive"
    | "agent_error"
    | "cancelled";
  summaryOfInvestigation: string;
  investigationReport: string;
  whatHappened: string;
  confidenceLevel: number | null;
  datadogQueryTerms: string[];
  datadogTimeRange: string | null;
  keyIdentifiers: string[];
  exactEventTimes: string[];
  codeUnitsInvolved: TicketDescriptionEnrichmentCodeUnit[];
  databaseFindings: TicketDescriptionEnrichmentDatabaseFinding[];
  logFindings: TicketDescriptionEnrichmentLogFinding[];
  datadogSessionFindings: TicketDescriptionEnrichmentDatadogSessionFinding[];
  investigationGaps: string[];
  recommendedNextQueries: string[];
  rawResultJson: Record<string, unknown>;
  rawResponse: string;
};

export interface TicketDescriptionEnrichmentAi {
  enrichTicketDescription(
    input: EnrichTicketDescriptionInput,
  ): Promise<EnrichTicketDescriptionOutput>;
}

const codexResponseSchema = ticketDescriptionEnrichmentEvidenceFieldsSchema
  .extend({
    operationOutcome: z.enum([
      "findings_recorded",
      "inconclusive",
      "agent_error",
      "cancelled",
    ]),
    summaryOfInvestigation: z.string().min(1),
    investigationReport: z.string().min(1),
    confidenceLevel: z.number().min(0).max(1).nullable(),
    rawResultJson: z.record(z.string(), z.unknown()).default({}),
  })
  .transform((result) => ({
    ...result,
    rawResultJson: {
      ...result.rawResultJson,
      summaryOfInvestigation: result.summaryOfInvestigation,
      whatHappened: result.whatHappened,
      datadogQueryTerms: result.datadogQueryTerms,
      datadogTimeRange: result.datadogTimeRange,
      keyIdentifiers: result.keyIdentifiers,
      exactEventTimes: result.exactEventTimes,
      codeUnitsInvolved: result.codeUnitsInvolved,
      databaseFindings: result.databaseFindings,
      logFindings: result.logFindings,
      datadogSessionFindings: result.datadogSessionFindings,
      investigationGaps: result.investigationGaps,
      recommendedNextQueries: result.recommendedNextQueries,
      investigationReport: result.investigationReport,
      operationOutcome: result.operationOutcome,
    },
  }));

const buildPrompt = (
  input: EnrichTicketDescriptionInput,
): string => {
  const frontendWebPath = path.resolve(process.cwd(), "../frontend-web");
  const hasFrontendWebProject = existsSync(frontendWebPath);

  return `You are investigating a support ticket to determine what actually happened.

Return strictly valid JSON using exactly this shape:
{
  "operationOutcome": "findings_recorded" | "inconclusive" | "agent_error" | "cancelled",
  "summaryOfInvestigation": "...",
  "investigationReport": "...",
  "whatHappened": "...",
  "confidenceLevel": 0..1 or null,
  "datadogQueryTerms": ["..."],
  "datadogTimeRange": "..." or null,
  "keyIdentifiers": ["..."],
  "exactEventTimes": ["..."],
  "codeUnitsInvolved": [
    {
      "kind": "api_route" | "frontend_route" | "method" | "class" | "frontend_component" | "function" | "module" | "unknown",
      "name": "...",
      "filePath": "..." or null,
      "symbol": "..." or null,
      "relevance": "...",
      "evidence": ["..."],
      "notes": ["..."]
    }
  ],
  "databaseFindings": [
    {
      "entityType": "...",
      "relationToTicket": "...",
      "identifiers": ["..."],
      "records": [{ "...": "..." }],
      "comparisonNotes": ["..."],
      "notes": ["..."]
    }
  ],
  "logFindings": [
    {
      "source": "frontend_route" | "application_log" | "datadog_log" | "trace" | "unknown",
      "routeOrCodePath": "..." or null,
      "queryOrFilter": "..." or null,
      "timestamp": "..." or null,
      "message": "...",
      "identifiers": ["..."],
      "evidence": ["..."],
      "notes": ["..."]
    }
  ],
  "datadogSessionFindings": [
    {
      "userIdentifier": "...",
      "sessionId": "..." or null,
      "timeWindow": "...",
      "events": [
        {
          "timestamp": "..." or null,
          "type": "...",
          "description": "...",
          "route": "..." or null,
          "metadata": { "...": "..." }
        }
      ],
      "notes": ["..."]
    }
  ],
  "investigationGaps": ["..."],
  "recommendedNextQueries": ["..."],
  "rawResultJson": { ... }
}

Primary goal:
- Determine WHAT happened, using concrete evidence from the database, code, logs, traces, and Datadog sessions when available.

Required workflow:
1. Identify likely entities involved in the ticket. If the description suggests records were created, updated, deleted, duplicated, or mismatched, use the Postgres MCP server to inspect the relevant tables and rows.
2. Put actual pertinent database fields into databaseFindings.records. Favor IDs, status/state, timestamps such as createdAt/updatedAt, ownership/company links, and any values that explain the issue.
3. If multiple records are involved, compare them and describe the meaningful differences in comparisonNotes.
4. Identify the concrete code units most likely involved. Capture API routes, frontend routes, methods, classes, frontend components, functions, or modules in codeUnitsInvolved, including file paths and symbols when you can find them.
5. Infer likely frontend routes or actions from the ticket description. If a sibling codebase such as ../frontend-web exists, inspect its TypeScript routes/components and look for matching log or error messages. If it is not available, note that in investigationGaps.
6. Put log evidence into logFindings. Include the route or code path you traced, any query/filter you would use, exact messages when found, and identifiers such as user IDs or company IDs.
7. If you know an exact event time or can narrow it to a tight window, look for Datadog user session activity from 1 minute before through 10 seconds after the error. Put the event sequence into datadogSessionFindings.events.
8. If a tool or data source is unavailable, do not invent evidence. Record the gap and the next best queries in investigationGaps and recommendedNextQueries.

Additional rules:
- Prefer concrete evidence over speculation.
- operationOutcome should be "findings_recorded" when you found meaningful evidence from at least one source. Use "inconclusive" when you investigated but could not establish enough concrete evidence for a stronger conclusion.
- Keep summaryOfInvestigation concise.
- Keep investigationReport ticket-ready and structured as an investigation report, not generic prose.
- exactEventTimes should contain any precise timestamps you established.
- codeUnitsInvolved should prioritize the units directly tied to the failing flow and explain why each one matters.
- rawResultJson may contain supplemental details, but the main findings must be present in the top-level fields above.

Ticket ID: ${input.ticketId}
Ticket number: ${input.ticketNumber}
Title: ${input.title}
Description:
${input.description}

Company names: ${input.companyNames.join(", ") || "none"}
Employee emails: ${input.employeeEmails.join(", ") || "none"}
Available local codebase: ${process.cwd()}
Sibling frontend-web project available: ${hasFrontendWebProject ? frontendWebPath : "not found"}
`;
};

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
