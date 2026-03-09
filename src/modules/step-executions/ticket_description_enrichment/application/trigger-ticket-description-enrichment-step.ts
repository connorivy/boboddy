"use server";
import {
  triggerTicketDescriptionEnrichmentStepRequestSchema,
  triggerTicketDescriptionEnrichmentStepResponseSchema,
  type TriggerTicketDescriptionEnrichmentStepRequest,
  type TriggerTicketDescriptionEnrichmentStepResponse,
} from "@/modules/step-executions/ticket_description_enrichment/contracts/trigger-ticket-description-enrichment-step-contracts";
import { completeTicketDescriptionEnrichmentStepRequestBodySchema } from "@/modules/step-executions/ticket_description_enrichment/contracts/complete-ticket-description-enrichment-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TERMINAL_STEP_EXECUTION_STATUSES,
} from "@/modules/step-executions/domain/step-execution.types";
import type { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";
import { AppContext } from "@/lib/di";
import {
  TicketDescriptionEnrichmentStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { TicketGithubIssueEntity } from "@/modules/tickets/domain/ticket-github-issue.entity";
import { assignDefaultEnvironment } from "@/modules/environments/application/assign-environment";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { TicketGitEnvironmentAggregate } from "@/modules/environments/domain/ticket-git-environment-aggregate";
import { TicketGitEnvironmentRepo } from "@/modules/environments/application/ticket-git-environment-repo";
import { createTicketGitEnvironment } from "@/modules/environments/application/create-ticket-git-environment";
import z from "zod";

const WEBHOOK_PAYLOAD_PATH =
  "tmp/copilot-ticket-description-enrichment-webhook-payload.json";

function buildCustomInstructions(ticketId: string, pipelineId: string): string {
  const hardcodedTicketIdAndPipelineIdSchema =
    completeTicketDescriptionEnrichmentStepRequestBodySchema
      .omit({
        ticketId: true,
        pipelineId: true,
      })
      .extend({
        ticketId: z.literal(ticketId),
        pipelineId: z.literal(pipelineId),
      });
  const jsonSchemaText = JSON.stringify(
    hardcodedTicketIdAndPipelineIdSchema.toJSONSchema(),
    null,
    2,
  );

  return `You are investigating a support ticket to determine what actually happened.

Goal:
1. Determine what happened using concrete evidence from code, logs, traces, Datadog sessions, and the database when available.
2. Identify the involved entities, the code units involved, likely failing routes/actions, and any exact timestamps or identifiers.
3. Always write the final payload JSON to ${WEBHOOK_PAYLOAD_PATH}.

Required workflow:
1. Inspect the ticket description and repository context first.
2. Identify likely code units involved, including API routes, frontend routes, methods, classes, frontend components, functions, and modules.
3. Investigate logs and traces using any available telemetry tools. Prefer exact identifiers and messages.
4. If a Postgres MCP server is available in the environment, inspect relevant entities and include actual row fields that explain the issue.
5. If an exact timestamp is known, inspect Datadog user session activity from 1 minute before through 10 seconds after the failure.
6. Do not invent evidence. If a tool is unavailable, record the gap and the next best query.

Rules for operationOutcome:
- "findings_recorded": You found meaningful evidence from at least one source.
- "inconclusive": You investigated but could not establish enough concrete evidence for a stronger conclusion.
- "agent_error": Tooling/runtime/repo constraints prevented completion.
- "cancelled": You were explicitly interrupted/cancelled.

Rules for fields:
- summaryOfInvestigation: 1-4000 chars, concise and evidence-based.
- investigationReport: ticket-ready investigation report.
- whatHappened: direct explanation of the observed behavior based on evidence.
- codeUnitsInvolved: include concrete units with kind, name, filePath, symbol, relevance, and evidence.
- databaseFindings.records: include pertinent row fields rather than vague summaries.
- logFindings and datadogSessionFindings: include exact messages, timestamps, routes, identifiers, and queries when available.
- confidenceLevel: 0..1 when you have a defensible conclusion; otherwise null.
- ticketId and pipelineId must match exactly.

Required final action:
- Create ${WEBHOOK_PAYLOAD_PATH} with valid JSON matching this schema exactly:
${jsonSchemaText}
- No markdown, no comments, no trailing commas.
- Ensure the file is present even on failure paths.`;
}

export const triggerTicketDescriptionEnrichmentStep = async (
  rawInput: TriggerTicketDescriptionEnrichmentStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    ticketGitEnvironmentRepo,
    githubService,
  }: {
    ticketRepo: TicketRepo;
    stepExecutionRepo: StepExecutionRepo;
    ticketGitEnvironmentRepo: TicketGitEnvironmentRepo;
    githubService: GithubApiService;
  } = AppContext,
): Promise<TriggerTicketDescriptionEnrichmentStepResponse> => {
  const input =
    triggerTicketDescriptionEnrichmentStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId, {
    loadGithubIssue: true,
    loadTicketGitEnvironmentAggregate: true,
  });
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = new Date().toISOString();
  const execution = new TicketDescriptionEnrichmentStepExecutionEntity(
    null,
    input.ticketId,
    "running",
    null,
    now,
  );

  let savedExecution = await stepExecutionRepo.save(execution);

  try {
    let githubIssue = ticket.githubIssue;
    if (githubIssue === undefined) {
      throw new Error(
        "Ticket github issue relationship was expected to be loaded but was undefined",
      );
    }

    if (githubIssue === null) {
      const issue = await githubService.createIssue({
        title: ticket.title,
        body: ticket.description,
      });

      githubIssue = await ticketRepo.saveGithubIssue(
        new TicketGithubIssueEntity(
          input.ticketId,
          issue.issueNumber,
          issue.issueId,
        ),
      );
    } else {
      await githubService.unassignCopilot(githubIssue.githubIssueNumber);
    }

    let ticketGitEnvironment = ticket.ticketGitEnvironmentAggregate;
    if (ticketGitEnvironment === undefined) {
      throw new Error(
        "Ticket git environment relationship was expected to be loaded but was undefined",
      );
    }

    if (!ticketGitEnvironment) {
      const newEnvironment = await createTicketGitEnvironment({
        ticketId: input.ticketId,
      });
      await assignDefaultEnvironment(
        {
          ticketId: input.ticketId,
          ticketGitEnvironmentId: newEnvironment.id,
        },
        {
          ticketRepo,
          ticketGitEnvironmentRepo,
        },
      );
      ticketGitEnvironment = new TicketGitEnvironmentAggregate(
        input.ticketId,
        newEnvironment.baseEnvironmentId,
        newEnvironment.devBranch,
      );
    }

    await githubService.upsertFile(
      "boboddy-state.json",
      ticketGitEnvironment.devBranch,
      `
{
  "pipelineId": "${savedExecution.pipelineId}",
  "stepName": "${TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME}"
}
      `,
    );

    await githubService.assignCopilot({
      issueNumber: githubIssue.githubIssueNumber,
      baseBranch: ticketGitEnvironment.devBranch,
      customInstructions: buildCustomInstructions(
        input.ticketId,
        savedExecution.id,
      ),
    });

    savedExecution = await stepExecutionRepo.save(
      new TicketDescriptionEnrichmentStepExecutionEntity(
        savedExecution.pipelineId,
        savedExecution.ticketId,
        savedExecution.status,
        null,
        savedExecution.startedAt,
        savedExecution.endedAt,
        savedExecution.createdAt,
        savedExecution.updatedAt,
        savedExecution.id,
      ),
    );
  } catch (error) {
    if (!TERMINAL_STEP_EXECUTION_STATUSES.has(savedExecution.status)) {
      await stepExecutionRepo.save(
        new TicketDescriptionEnrichmentStepExecutionEntity(
          savedExecution.pipelineId,
          savedExecution.ticketId,
          "failed",
          null,
          savedExecution.startedAt,
          new Date().toISOString(),
          savedExecution.createdAt,
          savedExecution.updatedAt,
          savedExecution.id,
        ),
      );
    }

    throw error;
  }

  return triggerTicketDescriptionEnrichmentStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
