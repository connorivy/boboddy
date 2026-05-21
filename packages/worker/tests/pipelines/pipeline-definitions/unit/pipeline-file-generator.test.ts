import { describe, expect, test } from "bun:test";
import { generatePipelineFileContent, type PipelineContract, type PipelineStepContract } from "../../../../src/pipelines/pipeline-definitions/infra/pipeline-file-generator";

const NO_ADVANCEMENT = {
  rulesJson: { rules: [] },
  defaultEventType: "continue",
  defaultEventParamsJson: null,
  allowedEventTypes: ["continue"],
};

function makeStep(overrides: Partial<PipelineStepContract> = {}): PipelineStepContract {
  return {
    stepDefinitionId: "def-id",
    stepDefinitionVersion: 1,
    key: "review-code",
    name: "Review Code",
    description: null,
    position: 0,
    inputBindingsJson: null,
    timeoutSeconds: null,
    advancementPolicyDefinition: NO_ADVANCEMENT,
    computedSignalDefinitions: [],
    ...overrides,
  };
}

function makePipeline(steps: PipelineStepContract[], overrides: Partial<PipelineContract> = {}): PipelineContract {
  return {
    key: "my-pipeline",
    name: "My Pipeline",
    description: null,
    version: 1,
    status: "active",
    stepDefinitions: steps,
    ...overrides,
  };
}

function gen(pipeline: PipelineContract): string {
  return generatePipelineFileContent(pipeline, new Map());
}

// ─── Import line ──────────────────────────────────────────────────────────────

describe("imports", () => {
  test("includes Computed in import when step has computed signal definitions", () => {
    const step = makeStep({
      advancementPolicyDefinition: {
        rulesJson: {
          rules: [{
            conditions: { all: [{ fact: "sum_a_b", operator: "greaterThan", value: 3 }] },
            event: { type: "continue" },
          }],
        },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
      computedSignalDefinitions: [{
        key: "sum_a_b",
        type: "sum",
        inputSignalKeys: ["a", "b"],
        configJson: null,
        availableWhenResultStatusIn: null,
      }],
    });

    const output = gen(makePipeline([step]));
    expect(output).toContain("Computed");
    expect(output).toMatch(/import \{[^}]*Computed[^}]*\}/);
  });

  test("omits Computed from import when no computed signal definitions are present", () => {
    const step = makeStep({
      advancementPolicyDefinition: {
        rulesJson: {
          rules: [{
            conditions: { all: [{ fact: "score", operator: "greaterThan", value: 5 }] },
            event: { type: "continue" },
          }],
        },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
      computedSignalDefinitions: [],
    });

    const output = gen(makePipeline([step]));
    expect(output).not.toContain("Computed");
  });
});

// ─── Rule.when shorthand ──────────────────────────────────────────────────────

describe("Rule.when shorthand", () => {
  test("emits plain string key when fact has no matching computed definition", () => {
    const step = makeStep({
      advancementPolicyDefinition: {
        rulesJson: {
          rules: [{
            conditions: { all: [{ fact: "clarity_score", operator: "greaterThan", value: 7 }] },
            event: { type: "continue" },
          }],
        },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
      computedSignalDefinitions: [],
    });

    const output = gen(makePipeline([step]));
    expect(output).toContain(`Rule.when("clarity_score", "greaterThan", 7, "continue")`);
  });

  test("replaces fact with Computed.sum() in Rule.when shorthand", () => {
    const step = makeStep({
      advancementPolicyDefinition: {
        rulesJson: {
          rules: [{
            conditions: { all: [{ fact: "sum_score_a_score_b", operator: "greaterThan", value: 5 }] },
            event: { type: "continue" },
          }],
        },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
      computedSignalDefinitions: [{
        key: "sum_score_a_score_b",
        type: "sum",
        inputSignalKeys: ["score_a", "score_b"],
        configJson: null,
        availableWhenResultStatusIn: null,
      }],
    });

    const output = gen(makePipeline([step]));
    expect(output).toContain(`Rule.when(Computed.sum(["score_a","score_b"]), "greaterThan", 5, "continue")`);
  });
});

// ─── Multi-condition rules ────────────────────────────────────────────────────

describe("Rule.all with multiple conditions", () => {
  test("replaces computed fact and leaves plain fact untouched in the same rule", () => {
    const step = makeStep({
      advancementPolicyDefinition: {
        rulesJson: {
          rules: [{
            conditions: {
              all: [
                { fact: "average_quality_security", operator: "greaterThanInclusive", value: 7 },
                { fact: "flagged", operator: "equal", value: false },
              ],
            },
            event: { type: "continue" },
          }],
        },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
      computedSignalDefinitions: [{
        key: "average_quality_security",
        type: "average",
        inputSignalKeys: ["quality", "security"],
        configJson: null,
        availableWhenResultStatusIn: null,
      }],
    });

    const output = gen(makePipeline([step]));
    expect(output).toContain(`Computed.average(["quality","security"])`);
    expect(output).toContain(`Rule.signal("flagged", "equal", false)`);
  });

  test("handles computed signal in nested Rule.any condition group", () => {
    const step = makeStep({
      advancementPolicyDefinition: {
        rulesJson: {
          rules: [{
            conditions: {
              all: [
                { fact: "required_check", operator: "equal", value: true },
                { any: [{ fact: "sum_x_y", operator: "greaterThan", value: 10 }] },
              ],
            },
            event: { type: "continue" },
          }],
        },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
      computedSignalDefinitions: [{
        key: "sum_x_y",
        type: "sum",
        inputSignalKeys: ["x", "y"],
        configJson: null,
        availableWhenResultStatusIn: null,
      }],
    });

    const output = gen(makePipeline([step]));
    expect(output).toContain(`Computed.sum(["x","y"])`);
  });
});

// ─── All 8 Computed method mappings ──────────────────────────────────────────

describe("Computed method name mapping", () => {
  const cases: Array<[string, string]> = [
    ["average", "Computed.average"],
    ["weighted_average", "Computed.weightedAverage"],
    ["sum", "Computed.sum"],
    ["min", "Computed.min"],
    ["max", "Computed.max"],
    ["count", "Computed.count"],
    ["boolean_any", "Computed.booleanAny"],
    ["boolean_all", "Computed.booleanAll"],
  ];

  for (const [wireType, expectedMethod] of cases) {
    test(`maps wire type "${wireType}" to "${expectedMethod}"`, () => {
      const key = `${wireType}_sig_a_sig_b`;
      const step = makeStep({
        advancementPolicyDefinition: {
          rulesJson: {
            rules: [{
              conditions: { all: [{ fact: key, operator: "equal", value: true }] },
              event: { type: "continue" },
            }],
          },
          defaultEventType: "continue",
          defaultEventParamsJson: null,
          allowedEventTypes: ["continue"],
        },
        computedSignalDefinitions: [{
          key,
          type: wireType,
          inputSignalKeys: ["sig_a", "sig_b"],
          configJson: null,
          availableWhenResultStatusIn: null,
        }],
      });

      const output = gen(makePipeline([step]));
      expect(output).toContain(`${expectedMethod}(["sig_a","sig_b"])`);
    });
  }
});

// ─── Options passthrough ──────────────────────────────────────────────────────

describe("Computed options", () => {
  test("includes configJson in the Computed call when non-null", () => {
    const step = makeStep({
      advancementPolicyDefinition: {
        rulesJson: {
          rules: [{
            conditions: { all: [{ fact: "weighted_average_a_b", operator: "greaterThan", value: 0.5 }] },
            event: { type: "continue" },
          }],
        },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
      computedSignalDefinitions: [{
        key: "weighted_average_a_b",
        type: "weighted_average",
        inputSignalKeys: ["a", "b"],
        configJson: { weights: [0.3, 0.7] },
        availableWhenResultStatusIn: null,
      }],
    });

    const output = gen(makePipeline([step]));
    expect(output).toContain(`Computed.weightedAverage(["a","b"],`);
    expect(output).toContain(`"configJson"`);
    expect(output).toContain(`[0.3,0.7]`);
  });

  test("includes availableWhenResultStatusIn in the Computed call when non-null", () => {
    const step = makeStep({
      advancementPolicyDefinition: {
        rulesJson: {
          rules: [{
            conditions: { all: [{ fact: "sum_p_q", operator: "greaterThan", value: 1 }] },
            event: { type: "continue" },
          }],
        },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
      computedSignalDefinitions: [{
        key: "sum_p_q",
        type: "sum",
        inputSignalKeys: ["p", "q"],
        configJson: null,
        availableWhenResultStatusIn: ["success", "partial"],
      }],
    });

    const output = gen(makePipeline([step]));
    expect(output).toContain(`Computed.sum(["p","q"],`);
    expect(output).toContain(`"availableWhenResultStatusIn"`);
    expect(output).toContain(`"success"`);
    expect(output).toContain(`"partial"`);
  });

  test("omits options argument when both configJson and availableWhenResultStatusIn are null", () => {
    const step = makeStep({
      advancementPolicyDefinition: {
        rulesJson: {
          rules: [{
            conditions: { all: [{ fact: "min_a_b", operator: "greaterThan", value: 0 }] },
            event: { type: "continue" },
          }],
        },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
      computedSignalDefinitions: [{
        key: "min_a_b",
        type: "min",
        inputSignalKeys: ["a", "b"],
        configJson: null,
        availableWhenResultStatusIn: null,
      }],
    });

    const output = gen(makePipeline([step]));
    expect(output).toContain(`Computed.min(["a","b"])`);
    expect(output).not.toContain(`Computed.min(["a","b"],`);
  });
});
