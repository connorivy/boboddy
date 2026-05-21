import type { ZodType } from "zod";
import type { DotPaths, StepDefinitionSpec, TypedStepDefinitionSpec } from "../steps/define-step";
import {
  type AdvancementPolicy,
  extractInlineComputedSignals,
  serializeAdvancementPolicy,
  type SerializedAdvancementPolicy,
  type SerializedComputedSignalDefinition,
} from "../advancement-policies/define-advancement-policy";

export type {
  AdvancementPolicy,
  PipelineStepComputedSignalType,
} from "../advancement-policies/define-advancement-policy";
export {
  Computed,
  Rule,
} from "../advancement-policies/define-advancement-policy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
};

export type AnyBinding =
  | PipelineInputBinding
  | StepSignalBinding
  | StepOutputBinding;

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
 * Binds a step input field to the entire agent output of a prior step.
 * Use this when your consumer handles the full output object directly.
 * For a stable contract, prefer fromSignal() instead.
 */
export function stepOutput(step: AnyTypedStep): StepOutputBinding {
  return { source: "step_output", step };
}

// ─── Pipeline step config ─────────────────────────────────────────────────────

export type PipelineStepConfig<TStep extends AnyTypedStep = AnyTypedStep> = {
  step: TStep;
  /** Maps each step input field to an input source. Extra keys are ignored at runtime. */
  input?: Partial<{
    [K in keyof NonNullable<TStep["__inputType"]> & string]: AnyBinding;
  }>;
  timeout?: number | null;
  /**
   * Controls when and how this step advances in the pipeline.
   * Signal keys in `Rule.signal()` / `Rule.when()` calls are type-checked
   * against the step's declared signals. Inline `Computed.X(...)` tokens can
   * also appear in the signal position; they're hoisted into the step's
   * `computedSignalDefinitions` at serialization time.
   * Defaults to `{ defaultOutcome: "continue" }` when omitted.
   */
  advancement?: AdvancementPolicy<TStep["__signalKeys"]>;
};

// ─── Output spec ──────────────────────────────────────────────────────────────

type SerializedBinding =
  | { source: "pipeline_input"; path: string }
  | { source: "step_signal"; stepKey: string; signalKey: string }
  | { source: "step_output"; stepKey: string };

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
    computedSignalDefinitions: SerializedComputedSignalDefinition[];
  }>;
  /** Step specs referenced by this pipeline. Populated by definePipeline so the push command can auto-push steps that aren't explicitly exported. */
  _stepDefinitions?: StepDefinitionSpec[];
};

// ─── definePipeline ───────────────────────────────────────────────────────────

/**
 * Untyped input shape used for documentation and as the internal implementation
 * target. Call sites use the generic overload below which provides per-step
 * signal key validation.
 */
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
  return { source: "step_output", stepKey: binding.step.key };
}

/**
 * Defines a pipeline from an ordered list of step configs.
 *
 * Each step's `advancement` policy is typed against that step's declared signal
 * keys — passing an unknown signal key to `Rule.signal()` / `Rule.when()` is a
 * compile-time error. Inline `Computed.X(...)` tokens can also be used in the
 * signal position; they're walked out of the rules tree at serialization time
 * and emitted as the step's `computedSignalDefinitions`.
 *
 * TypeScript achieves per-element signal key checking by constraining `TSteps`
 * to a tuple of step instances (`AnyTypedStep[]`), not step configs. Each element
 * of `steps` is then typed as `PipelineStepConfig<TSteps[K]>`, giving TypeScript
 * a direct inference site: `step: TSteps[K]` matches the concrete step instance,
 * which carries the signal key union via `__signalKeys`.
 */
export function definePipeline<
  const TSteps extends ReadonlyArray<AnyTypedStep>,
>(config: {
  key: string;
  name: string;
  description?: string | null;
  version?: number;
  status?: "draft" | "active";
  steps: { [K in keyof TSteps]: PipelineStepConfig<TSteps[K]> };
}): PipelineDefinitionSpec {
  const steps = config.steps as ReadonlyArray<PipelineStepConfig>;
  const stepDefMap = new Map<string, StepDefinitionSpec>();
  for (const stepConfig of steps) {
    const mapKey = `${stepConfig.step.key}@v${String(stepConfig.step.version)}`;
    if (!stepDefMap.has(mapKey)) {
      stepDefMap.set(mapKey, stepConfig.step as StepDefinitionSpec);
    }
  }
  return {
    key: config.key,
    name: config.name,
    description: config.description ?? null,
    version: config.version ?? 1,
    status: config.status ?? "active",
    _stepDefinitions: [...stepDefMap.values()],
    steps: steps.map((stepConfig, index) => ({
      stepKey: stepConfig.step.key,
      stepName: stepConfig.step.name,
      stepDescription: stepConfig.step.description,
      position: index + 1,
      inputBindingsJson: Object.fromEntries(
        Object.entries(stepConfig.input ?? {})
          .filter(
            (entry): entry is [string, AnyBinding] => entry[1] !== undefined,
          )
          .map(([key, binding]) => [key, serializeBinding(binding)]),
      ),
      timeoutSeconds: stepConfig.timeout ?? null,
      advancementPolicyDefinition: serializeAdvancementPolicy(
        stepConfig.advancement,
      ),
      computedSignalDefinitions: extractInlineComputedSignals(
        stepConfig.advancement,
      ),
    })),
  };
}
