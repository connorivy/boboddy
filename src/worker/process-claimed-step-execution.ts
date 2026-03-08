import { AppContext } from "@/lib/di";
import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import {
  type StepExecutionStepName,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  FAILING_TEST_FIX_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { triggerTicketFailingTestFixStep } from "@/modules/step-executions/github_fix_failing_test/application/trigger-ticket-failing-test-fix-step";
import { triggerTicketFailingTestReproStep } from "@/modules/step-executions/github_repro_failing_test/application/trigger-ticket-failing-test-repro-step";
import { triggerTicketDescriptionEnrichmentStep } from "@/modules/step-executions/ticket_description_enrichment/application/trigger-ticket-description-enrichment-step";
import { triggerTicketDescriptionQualityStep } from "@/modules/step-executions/ticket_description_quality_rank/application/trigger-ticket-description-quality-step";
import { triggerTicketDuplicateCandidatesStep } from "@/modules/step-executions/ticket_duplicate_candidates/application/trigger-ticket-duplicate-candidates-step";
import {
  ClaimedExecutionStepRepo,
  resolveTicketId,
} from "./queued-step-execution-worker";

export async function processClaimedStepExecution(
  claimedExecution: TicketPipelineStepExecutionEntity,
): Promise<void> {
  const stepExecutionRepo = new ClaimedExecutionStepRepo(
    AppContext.stepExecutionRepo,
    claimedExecution,
  );
  const ticketId = await resolveTicketId(claimedExecution.pipelineId);

  switch (claimedExecution.stepName as StepExecutionStepName) {
    case TICKET_DESCRIPTION_QUALITY_STEP_NAME:
      await triggerTicketDescriptionQualityStep(
        { ticketId },
        {
          ...AppContext,
          stepExecutionRepo,
        },
      );
      return;
    case TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME:
      await triggerTicketDescriptionEnrichmentStep(
        { ticketId },
        {
          ...AppContext,
          stepExecutionRepo,
        },
      );
      return;
    case TICKET_DUPLICATE_CANDIDATES_STEP_NAME:
      await triggerTicketDuplicateCandidatesStep(
        { ticketId },
        {
          ...AppContext,
          stepExecutionRepo,
        },
      );
      return;
    case FAILING_TEST_REPRO_STEP_NAME:
      await triggerTicketFailingTestReproStep(
        { ticketId },
        {
          ...AppContext,
          stepExecutionRepo,
        },
      );
      return;
    case FAILING_TEST_FIX_STEP_NAME: {
      const ticket = await AppContext.ticketRepo.loadById(ticketId, {
        loadTicketGitEnvironmentAggregate: true,
      });
      if (!ticket) {
        throw new Error(`Ticket with ID ${ticketId} not found`);
      }

      const ticketGitEnvironmentId =
        ticket.ticketGitEnvironmentAggregate?.id ??
        ticket.defaultGitEnvironmentId;

      if (ticketGitEnvironmentId === undefined) {
        throw new Error(
          `Ticket ${ticketId} does not have a default git environment assigned`,
        );
      }

      await triggerTicketFailingTestFixStep(
        {
          ticketNumber: ticket.ticketNumber,
          ticketGitEnvironmentId,
        },
        {
          ...AppContext,
          stepExecutionRepo,
        },
      );
      return;
    }
    default:
      throw new Error(
        `Unsupported queued step '${claimedExecution.stepName}' for execution ${claimedExecution.id}`,
      );
  }
}
