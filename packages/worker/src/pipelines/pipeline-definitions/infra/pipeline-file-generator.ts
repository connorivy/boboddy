import { keyToVarName } from "../../../steps/step-definitions/infra/step-file-generator";

type InputBinding =
  | { source: "pipeline_input"; path: string | null }
  | { source: "step_output"; stepKey: string; path?: string | null }
  | { source: "step_signal"; stepKey: string; signalKey: string }
  | { source: "literal"; value: unknown };

type AdvancementPolicyRule = {
  conditions: {
    all?: SerializedCondition[];
    any?: SerializedCondition[];
  };
  event: { type: string; params?: Record<string, unknown> | null };
};

type SerializedLeafCondition = { fact: string; operator: string; value: unknown };
type SerializedConditionGroup = { all?: SerializedCondition[]; any?: SerializedCondition[] };
type SerializedCondition = SerializedLeafCondition | SerializedConditionGroup;

type AdvancementPolicy = {
  rulesJson: { rules: AdvancementPolicyRule[] };
  defaultEventType: string;
  defaultEventParamsJson: Record<string, unknown> | null;
  allowedEventTypes: string[];
};

export type PipelineStepContract = {
  stepDefinitionId: string;
  stepDefinitionVersion: number;
  key: string;
  name: string;
  description: string | null;
  position: number;
  inputBindingsJson: Record<string, InputBinding> | null;
  timeoutSeconds: number | null;
  advancementPolicyDefinition: AdvancementPolicy;
};

export type PipelineContract = {
  key: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  stepDefinitions: PipelineStepContract[];
};

type StepKeyMap = Map<string, string>; // stepDefinitionId → varName

// ─── Advancement policy reconstruction ───────────────────────────────────────

function reconstructOutcome(eventType: string, params: Record<string, unknown> | null | undefined): string {
  if (!params || Object.keys(params).length === 0) return JSON.stringify(eventType);
  return `{ outcome: ${JSON.stringify(eventType)}, outcomeJson: ${JSON.stringify(params)} }`;
}

function isLeafCondition(c: SerializedCondition): c is SerializedLeafCondition {
  return "fact" in c;
}

function reconstructCondition(cond: SerializedCondition, indent: string): string {
  if (isLeafCondition(cond)) {
    return `Rule.signal(${JSON.stringify(cond.fact)}, "${cond.operator}", ${JSON.stringify(cond.value)})`;
  }
  const mode = cond.all ? "all" : "any";
  const children = (cond[mode] ?? []).map((c) => reconstructCondition(c, indent + "  ")).join(`, `);
  return `Rule.${mode}([${children}])`;
}

function reconstructRule(rule: AdvancementPolicyRule): string {
  const outcome = reconstructOutcome(rule.event.type, rule.event.params);
  const mode = rule.conditions.all ? "all" : "any";
  const conditions = rule.conditions[mode] ?? [];

  if (mode === "all" && conditions.length === 1 && isLeafCondition(conditions[0]!)) {
    const cond = conditions[0] as SerializedLeafCondition;
    return `Rule.when(${JSON.stringify(cond.fact)}, "${cond.operator}", ${JSON.stringify(cond.value)}, ${outcome})`;
  }

  const condExprs = conditions.map((c) => reconstructCondition(c, "        ")).join(", ");
  return `Rule.${mode}([${condExprs}], ${outcome})`;
}

function reconstructAdvancementPolicy(policy: AdvancementPolicy): string | null {
  const rules = policy.rulesJson.rules;
  const defaultOutcome = reconstructOutcome(policy.defaultEventType, policy.defaultEventParamsJson);
  const isDefaultContinueNoRules =
    policy.defaultEventType === "continue" && (!policy.defaultEventParamsJson || Object.keys(policy.defaultEventParamsJson).length === 0) && rules.length === 0;

  if (isDefaultContinueNoRules) return null;

  const lines: string[] = [`defaultOutcome: ${defaultOutcome}`];
  if (rules.length > 0) {
    const ruleExprs = rules.map(reconstructRule).map((r) => `          ${r}`).join(",\n");
    lines.push(`rules: [\n${ruleExprs},\n        ]`);
  }
  return `{\n        ${lines.join(",\n        ")}\n      }`;
}

// ─── Input binding reconstruction ────────────────────────────────────────────

function reconstructBinding(
  binding: InputBinding,
  stepVarMap: StepKeyMap,
  inputSchemaVarName: string | null,
): string {
  switch (binding.source) {
    case "pipeline_input":
      return `fromPipelineInput(${inputSchemaVarName ?? "inputSchema"}, ${JSON.stringify(binding.path ?? "")})`;
    case "step_signal":
      return `fromSignal(${stepVarMap.get(binding.stepKey) ?? JSON.stringify(binding.stepKey)}, ${JSON.stringify(binding.signalKey)})`;
    case "step_output":
      return `stepOutput(${stepVarMap.get(binding.stepKey) ?? JSON.stringify(binding.stepKey)})`;
    case "literal":
      return `/* TODO: literal binding (value: ${JSON.stringify(binding.value)}) — not supported in SDK */ (undefined as never)`;
  }
}

// ─── Pipeline input schema inference ─────────────────────────────────────────

function inferInputSchemaPaths(steps: PipelineStepContract[]): string[] {
  const paths: string[] = [];
  for (const step of steps) {
    for (const binding of Object.values(step.inputBindingsJson ?? {})) {
      if (binding.source === "pipeline_input" && binding.path) {
        paths.push(binding.path);
      }
    }
  }
  return [...new Set(paths)];
}

// ─── File generator ───────────────────────────────────────────────────────────

export function generatePipelineFileContent(
  pipeline: PipelineContract,
  stepIdToKey: Map<string, string>,
): string {
  const sortedSteps = [...pipeline.stepDefinitions].sort((a, b) => a.position - b.position);

  // Build map from step key → var name (used for binding references)
  const stepVarMap: StepKeyMap = new Map();
  for (const step of sortedSteps) {
    stepVarMap.set(step.key, keyToVarName(step.key));
  }

  // Also map by stepDefinitionId for cross-pipeline references (unused here but consistent)
  for (const step of sortedSteps) {
    const defKey = stepIdToKey.get(step.stepDefinitionId);
    if (defKey && defKey !== step.key) stepVarMap.set(defKey, keyToVarName(defKey));
  }

  const inputPaths = inferInputSchemaPaths(sortedSteps);
  const hasPipelineInput = inputPaths.length > 0;

  // Determine which binding helpers are used
  let usesFromPipelineInput = false;
  let usesFromSignal = false;
  let usesStepOutput = false;
  let usesLiteral = false;
  let usesRules = false;

  for (const step of sortedSteps) {
    for (const binding of Object.values(step.inputBindingsJson ?? {})) {
      if (binding.source === "pipeline_input") usesFromPipelineInput = true;
      if (binding.source === "step_signal") usesFromSignal = true;
      if (binding.source === "step_output") usesStepOutput = true;
      if (binding.source === "literal") usesLiteral = true;
    }
    if (step.advancementPolicyDefinition.rulesJson.rules.length > 0) usesRules = true;
  }

  // Build imports
  const pipelineImports: string[] = ["definePipeline"];
  if (usesFromPipelineInput) pipelineImports.push("fromPipelineInput");
  if (usesFromSignal) pipelineImports.push("fromSignal");
  if (usesStepOutput) pipelineImports.push("stepOutput");
  if (usesRules) pipelineImports.push("Rule");

  const stepVarNames = sortedSteps.map((s) => keyToVarName(s.key));
  const uniqueStepVarNames = [...new Set(stepVarNames)];

  const lines: string[] = [];

  if (hasPipelineInput || usesLiteral) lines.push(`import { z } from "zod";`);
  lines.push(`import { ${pipelineImports.join(", ")} } from "@boboddy/sdk/definitions/pipelines";`);
  if (uniqueStepVarNames.length > 0) {
    lines.push(`import { ${uniqueStepVarNames.join(", ")} } from "./steps";`);
  }

  lines.push("");

  if (hasPipelineInput) {
    lines.push(`const inputSchema = z.unknown(); // TODO: replace with your pipeline's input schema`);
    lines.push("");
  }

  // Build pipeline definePipeline call
  const pipelineFields: string[] = [
    `  key: ${JSON.stringify(pipeline.key)}`,
    `  name: ${JSON.stringify(pipeline.name)}`,
  ];
  if (pipeline.description) pipelineFields.push(`  description: ${JSON.stringify(pipeline.description)}`);
  pipelineFields.push(`  version: ${String(pipeline.version)}`);
  pipelineFields.push(`  status: ${JSON.stringify(pipeline.status)} as const`);

  const stepEntries = sortedSteps.map((step) => {
    const varName = keyToVarName(step.key);
    const stepLines: string[] = [`      step: ${varName}`];

    // Input bindings
    const bindings = Object.entries(step.inputBindingsJson ?? {});
    if (bindings.length > 0) {
      const bindingLines = bindings.map(([fieldKey, binding]) => {
        const expr = reconstructBinding(binding, stepVarMap, hasPipelineInput ? "inputSchema" : null);
        return `        ${JSON.stringify(fieldKey)}: ${expr}`;
      });
      stepLines.push(`      input: {\n${bindingLines.join(",\n")}\n      }`);
    }

    if (step.timeoutSeconds !== null) {
      stepLines.push(`      timeout: ${String(step.timeoutSeconds)}`);
    }

    const advancementExpr = reconstructAdvancementPolicy(step.advancementPolicyDefinition);
    if (advancementExpr !== null) {
      stepLines.push(`      advancement: ${advancementExpr}`);
    }

    return `    {\n${stepLines.join(",\n")}\n    }`;
  });

  pipelineFields.push(`  steps: [\n${stepEntries.join(",\n")}\n  ]`);

  lines.push(`export default definePipeline({\n${pipelineFields.join(",\n")},\n});`);

  return lines.join("\n") + "\n";
}
