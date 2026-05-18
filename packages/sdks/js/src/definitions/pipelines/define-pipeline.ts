import type { ZodType } from "zod";
import type { DotPaths, TypedStepDefinitionSpec } from "../steps/define-step";

type AnyTypedStep = TypedStepDefinitionSpec<any, any, any>;

// ─── Input binding types ──────────────────────────────────────────────────────

export type PipelineInputBinding = {
  source: "pipeline_input";
  path: string;
};

export type StepSignalBinding = {
  source: "step_signal";
  step: AnyTypedStep;
  signalKey: string;
};

export type StepOutputBinding = {
  source: "step_output";
  step: AnyTypedStep;
  path: string;
};

export type AnyBinding = PipelineInputBinding | StepSignalBinding | StepOutputBinding;

// ─── Input binding helpers ────────────────────────────────────────────────────

/**
 * Binds a step input field to a field of the pipeline's top-level input.
 * The `path` is validated against the pipeline input schema at compile time.
 */
export function fromPipelineInput<T extends ZodType>(
  _schema: T,
  path: DotPaths<T["_output"]>,
): PipelineInputBinding {
  return { source: "pipeline_input", path };
}

/**
 * Binds a step input field to a named signal from a prior step.
 * `signalKey` is validated against the prior step's declared signal keys.
 */
export function fromSignal<TStep extends AnyTypedStep>(
  step: TStep,
  signalKey: TStep["__signalKeys"],
): StepSignalBinding {
  return { source: "step_signal", step, signalKey };
}

/**
 * Binds a step input field to a dot-notation path within a prior step's full agent output.
 * `path` is validated against the prior step's result type at compile time.
 */
export function fromOutput<TStep extends AnyTypedStep>(
  step: TStep,
  path: DotPaths<TStep["__resultType"]>,
): StepOutputBinding {
  return { source: "step_output", step, path };
}

// ─── Advancement policy ───────────────────────────────────────────────────────

export type AdvancementPolicy = {
  default: "continue" | "block";
};

type SerializedAdvancementPolicy = {
  rulesJson: { rules: unknown[] };
  defaultEventType: string;
  defaultEventParamsJson: null;
  allowedEventTypes: string[];
};

function serializeAdvancementPolicy(
  policy: AdvancementPolicy | undefined,
): SerializedAdvancementPolicy {
  const eventType = policy?.default ?? "continue";
  return {
    rulesJson: { rules: [] },
    defaultEventType: eventType,
    defaultEventParamsJson: null,
    allowedEventTypes: [eventType],
  };
}

// ─── Pipeline step config ─────────────────────────────────────────────────────

export type PipelineStepConfig<TStep extends AnyTypedStep = AnyTypedStep> = {
  step: TStep;
  /** Maps each step input field to an input source. Extra keys are ignored at runtime. */
  input?: Partial<{
    [K in keyof NonNullable<TStep["__inputType"]> & string]: AnyBinding;
  }>;
  timeout?: number | null;
  advancement?: AdvancementPolicy;
};

// ─── Output spec ──────────────────────────────────────────────────────────────

type SerializedBinding =
  | { source: "pipeline_input"; path: string }
  | { source: "step_signal"; stepKey: string; signalKey: string }
  | { source: "step_output"; stepKey: string; path: string };

export type PipelineDefinitionSpec = {
  key: string;
  name: string;
  description: string | null;
  version: number;
  status: "draft" | "active" | "archived";
  steps: Array<{
    stepKey: string;
    stepName: string;
    stepDescription: string | null;
    position: number;
    inputBindingsJson: Record<string, SerializedBinding>;
    timeoutSeconds: number | null;
    advancementPolicyDefinition: SerializedAdvancementPolicy;
  }>;
};

// ─── definePipeline ───────────────────────────────────────────────────────────

export type DefinePipelineInput = {
  key: string;
  name: string;
  description?: string | null;
  version?: number;
  status?: "draft" | "active";
  steps: Array<PipelineStepConfig>;
};

function serializeBinding(binding: AnyBinding): SerializedBinding {
  if (binding.source === "pipeline_input") {
    return { source: "pipeline_input", path: binding.path };
  }
  if (binding.source === "step_signal") {
    return {
      source: "step_signal",
      stepKey: binding.step.key,
      signalKey: binding.signalKey,
    };
  }
  return { source: "step_output", stepKey: binding.step.key, path: binding.path };
}

export function definePipeline(config: DefinePipelineInput): PipelineDefinitionSpec {
  return {
    key: config.key,
    name: config.name,
    description: config.description ?? null,
    version: config.version ?? 1,
    status: config.status ?? "active",
    steps: config.steps.map((stepConfig, index) => ({
      stepKey: stepConfig.step.key,
      stepName: stepConfig.step.name,
      stepDescription: stepConfig.step.description,
      position: index + 1,
      inputBindingsJson: Object.fromEntries(
        Object.entries(stepConfig.input ?? {})
          .filter((entry): entry is [string, AnyBinding] => entry[1] !== undefined)
          .map(([key, binding]) => [key, serializeBinding(binding)]),
      ),
      timeoutSeconds: stepConfig.timeout ?? null,
      advancementPolicyDefinition: serializeAdvancementPolicy(stepConfig.advancement),
    })),
  };
}
