import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import {
  type StepExecutionDefinition,
  parseIsoDateOrThrow,
} from "@/modules/step-executions/domain/step-execution-definition";
import { failingTestFixStepDefinition } from "@/modules/step-executions/github_fix_failing_test/domain/failing-test-fix-step-definition";
import { finalizeFailingTestReproPrStepDefinition } from "@/modules/step-executions/github_finalize_failing_test_repro_pr/domain/finalize-failing-test-repro-pr-step-definition";
import { failingTestReproStepDefinition } from "@/modules/step-executions/github_repro_failing_test/domain/failing-test-repro-step-definition";
import { ticketDescriptionEnrichmentStepDefinition } from "@/modules/step-executions/ticket_description_enrichment/domain/ticket-description-enrichment-step-definition";
import { ticketDescriptionQualityStepDefinition } from "@/modules/step-executions/ticket_description_quality_rank/domain/ticket-description-quality-step-definition";
import { ticketDuplicateCandidatesStepDefinition } from "@/modules/step-executions/ticket_duplicate_candidates/domain/ticket-duplicate-candidates-step-definition";
import type { StepExecutionStepName } from "@/modules/step-executions/domain/step-execution.types";

export { parseIsoDateOrThrow } from "@/modules/step-executions/domain/step-execution-definition";

export const stepExecutionDefinitions = [
  ticketDescriptionQualityStepDefinition,
  ticketDescriptionEnrichmentStepDefinition,
  ticketDuplicateCandidatesStepDefinition,
  failingTestReproStepDefinition,
  finalizeFailingTestReproPrStepDefinition,
  failingTestFixStepDefinition,
] as const;

const stepExecutionDefinitionMap = new Map(
  stepExecutionDefinitions.map((definition) => [definition.stepName, definition]),
);

export function getStepExecutionDefinition(
  stepName: StepExecutionStepName,
): StepExecutionDefinition {
  const definition = stepExecutionDefinitionMap.get(stepName);
  if (!definition) {
    throw new Error(`Unsupported pipeline step '${stepName}'`);
  }

  return definition;
}

export function getStepExecutionDefinitionForExecution(
  execution: TicketPipelineStepExecutionEntity,
): StepExecutionDefinition {
  const definition = stepExecutionDefinitions.find((candidate) =>
    candidate.isExecution(execution),
  );
  if (!definition) {
    throw new Error(
      `Unsupported pipeline step execution type: ${execution.constructor.name}`,
    );
  }

  return definition;
}
