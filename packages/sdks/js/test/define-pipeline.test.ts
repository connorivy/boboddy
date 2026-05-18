import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineStep } from "../src/definitions/steps/define-step";
import {
  definePipeline,
  fromPipelineInput,
  fromSignal,
  stepOutput,
  Rule,
} from "../src/definitions/pipelines/define-pipeline";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const reproduceStep = defineStep({
  key: "reproduce",
  name: "Reproduce Issue",
  input: z.object({ title: z.string(), description: z.string() }),
  result: z.object({ url: z.string(), success: z.boolean() }),
  signals: [{ sourcePath: "url", key: "repro_url" }, { sourcePath: "success" }],
});

const verifyStep = defineStep({
  key: "verify",
  name: "Verify Fix",
  input: z.object({ reproUrl: z.string(), checkSuccess: z.boolean() }),
  result: z.object({ passed: z.boolean(), notes: z.string() }),
  signals: [{ sourcePath: "passed" }],
});

const pipelineInput = z.object({ title: z.string(), description: z.string() });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("definePipeline", () => {
  test.concurrent("applies sensible defaults", () => {
    const pipeline = definePipeline({
      key: "my-pipeline",
      name: "My Pipeline",
      steps: [{ step: reproduceStep }],
    });

    expect(pipeline).toMatchObject({
      key: "my-pipeline",
      name: "My Pipeline",
      description: null,
      version: 1,
      status: "active",
    });
    expect(pipeline.steps).toHaveLength(1);
  });

  test.concurrent("respects explicit version, status, and description", () => {
    const pipeline = definePipeline({
      key: "my-pipeline",
      name: "My Pipeline",
      description: "Does stuff",
      version: 3,
      status: "draft",
      steps: [],
    });

    expect(pipeline.description).toBe("Does stuff");
    expect(pipeline.version).toBe(3);
    expect(pipeline.status).toBe("draft");
  });

  describe("step ordering", () => {
    test.concurrent("assigns positions 1-indexed in declaration order", () => {
      const pipeline = definePipeline({
        key: "p",
        name: "P",
        steps: [{ step: reproduceStep }, { step: verifyStep }],
      });

      expect(pipeline.steps[0]!.position).toBe(1);
      expect(pipeline.steps[1]!.position).toBe(2);
    });

    test.concurrent("carries step key and name into the output", () => {
      const pipeline = definePipeline({
        key: "p",
        name: "P",
        steps: [{ step: reproduceStep }],
      });

      expect(pipeline.steps[0]!.stepKey).toBe("reproduce");
      expect(pipeline.steps[0]!.stepName).toBe("Reproduce Issue");
    });
  });

  describe("fromPipelineInput", () => {
    test.concurrent(
      "serializes to source:pipeline_input with the given path",
      () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              input: {
                title: fromPipelineInput(pipelineInput, "title"),
                description: fromPipelineInput(pipelineInput, "description"),
              },
            },
          ],
        });

        expect(pipeline.steps[0]!.inputBindingsJson).toEqual({
          title: { source: "pipeline_input", path: "title" },
          description: { source: "pipeline_input", path: "description" },
        });
      },
    );
  });

  describe("fromSignal", () => {
    test.concurrent(
      "serializes to source:step_signal with the prior step's key and signal key",
      () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            { step: reproduceStep },
            {
              step: verifyStep,
              input: {
                reproUrl: fromSignal(reproduceStep, "repro_url"),
                checkSuccess: fromSignal(reproduceStep, "success"),
              },
            },
          ],
        });

        expect(pipeline.steps[1]!.inputBindingsJson).toEqual({
          reproUrl: {
            source: "step_signal",
            stepKey: "reproduce",
            signalKey: "repro_url",
          },
          checkSuccess: {
            source: "step_signal",
            stepKey: "reproduce",
            signalKey: "success",
          },
        });
      },
    );
  });

  describe("stepOutput", () => {
    test.concurrent(
      "serializes to source:step_output with the prior step's key and no path",
      () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            { step: reproduceStep },
            {
              step: verifyStep,
              input: {
                reproUrl: stepOutput(reproduceStep),
                checkSuccess: stepOutput(reproduceStep),
              },
            },
          ],
        });

        expect(pipeline.steps[1]!.inputBindingsJson).toEqual({
          reproUrl: { source: "step_output", stepKey: "reproduce" },
          checkSuccess: { source: "step_output", stepKey: "reproduce" },
        });
      },
    );
  });

  describe("mixed bindings", () => {
    test.concurrent(
      "a single step can mix pipeline_input, step_signal, and step_output bindings",
      () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              input: { title: fromPipelineInput(pipelineInput, "title") },
            },
            {
              step: verifyStep,
              input: {
                reproUrl: fromSignal(reproduceStep, "repro_url"),
                checkSuccess: stepOutput(reproduceStep),
              },
            },
          ],
        });

        const bindings = pipeline.steps[1]!.inputBindingsJson;
        expect(bindings["reproUrl"]).toMatchObject({ source: "step_signal" });
        expect(bindings["checkSuccess"]).toMatchObject({
          source: "step_output",
        });
      },
    );
  });

  describe("advancement policy", () => {
    test.concurrent("defaults to continue when advancement is omitted", () => {
      const pipeline = definePipeline({
        key: "p",
        name: "P",
        steps: [{ step: reproduceStep }],
      });

      expect(pipeline.steps[0]!.advancementPolicyDefinition).toEqual({
        rulesJson: { rules: [] },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      });
    });

    test.concurrent("serializes block defaultOutcome", () => {
      const pipeline = definePipeline({
        key: "p",
        name: "P",
        steps: [
          { step: reproduceStep, advancement: { defaultOutcome: "block" } },
        ],
      });

      expect(pipeline.steps[0]!.advancementPolicyDefinition).toMatchObject({
        defaultEventType: "block",
        allowedEventTypes: ["block"],
      });
    });

    test.concurrent("each step can have an independent advancement policy", () => {
      const pipeline = definePipeline({
        key: "p",
        name: "P",
        steps: [
          { step: reproduceStep, advancement: { defaultOutcome: "block" } },
          { step: verifyStep, advancement: { defaultOutcome: "continue" } },
        ],
      });

      expect(pipeline.steps[0]!.advancementPolicyDefinition.defaultEventType).toBe("block");
      expect(pipeline.steps[1]!.advancementPolicyDefinition.defaultEventType).toBe("continue");
    });

    describe("Rule.when", () => {
      test.concurrent("serializes to an all-mode json-rules-engine condition", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [Rule.when("success", "equal", true, "continue")],
              },
            },
          ],
        });

        const policy = pipeline.steps[0]!.advancementPolicyDefinition;
        expect(policy.defaultEventType).toBe("block");
        expect(policy.allowedEventTypes).toEqual(expect.arrayContaining(["block", "continue"]));
        expect(policy.rulesJson.rules[0]).toEqual({
          conditions: { all: [{ fact: "success", operator: "equal", value: true }] },
          event: { type: "continue" },
        });
      });

      test.concurrent("object outcome serializes outcomeJson as event params", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [Rule.when("success", "equal", false, { outcome: "needs_review", outcomeJson: { reason: "failed check" } })],
              },
            },
          ],
        });

        expect(pipeline.steps[0]!.advancementPolicyDefinition.rulesJson.rules[0]!.event).toEqual({
          type: "needs_review",
          params: { reason: "failed check" },
        });
      });

      test.concurrent("object outcome with no outcomeJson omits params from the event", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [Rule.when("success", "equal", true, { outcome: "continue" })],
              },
            },
          ],
        });

        const event = pipeline.steps[0]!.advancementPolicyDefinition.rulesJson.rules[0]!.event;
        expect(event).toEqual({ type: "continue" });
        expect(event.params).toBeUndefined();
      });

      test.concurrent("greaterThanInclusive operator serializes correctly", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [Rule.when("success", "greaterThanInclusive", 80, "continue")],
              },
            },
          ],
        });

        const conditions = pipeline.steps[0]!.advancementPolicyDefinition.rulesJson.rules[0]!
          .conditions as { all: { fact: string; operator: string; value: unknown }[] };
        expect(conditions.all[0]).toEqual({ fact: "success", operator: "greaterThanInclusive", value: 80 });
      });

      test.concurrent("in operator accepts an array value", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [Rule.when("repro_url", "in", ["https://a.com", "https://b.com"], "continue")],
              },
            },
          ],
        });

        const conditions = pipeline.steps[0]!.advancementPolicyDefinition.rulesJson.rules[0]!
          .conditions as { all: { fact: string; operator: string; value: unknown }[] };
        expect(conditions.all[0]!.operator).toBe("in");
        expect(conditions.all[0]!.value).toEqual(["https://a.com", "https://b.com"]);
      });
    });

    describe("Rule.all", () => {
      test.concurrent("all conditions must match — serializes to an all-mode rule", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [
                  Rule.all([
                    Rule.signal("success", "equal", true),
                    Rule.signal("repro_url", "contains", "https"),
                  ], "continue"),
                ],
              },
            },
          ],
        });

        const conditions = pipeline.steps[0]!.advancementPolicyDefinition.rulesJson.rules[0]!
          .conditions as { all: { fact: string; operator: string; value: unknown }[] };
        expect(conditions.all).toHaveLength(2);
        expect(conditions.all[0]).toEqual({ fact: "success", operator: "equal", value: true });
        expect(conditions.all[1]).toEqual({ fact: "repro_url", operator: "contains", value: "https" });
      });

      test.concurrent("outcome appears in allowedEventTypes", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [Rule.all([Rule.signal("success", "equal", true)], "continue")],
              },
            },
          ],
        });

        expect(pipeline.steps[0]!.advancementPolicyDefinition.allowedEventTypes).toEqual(
          expect.arrayContaining(["block", "continue"]),
        );
      });
    });

    describe("Rule.any", () => {
      test.concurrent("any condition matching — serializes to an any-mode rule", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [
                  Rule.any([
                    Rule.signal("success", "equal", true),
                    Rule.signal("repro_url", "contains", "localhost"),
                  ], "continue"),
                ],
              },
            },
          ],
        });

        const conditions = pipeline.steps[0]!.advancementPolicyDefinition.rulesJson.rules[0]!
          .conditions as { any: { fact: string; operator: string; value: unknown }[] };
        expect(conditions.any).toHaveLength(2);
        expect(conditions.any[0]).toEqual({ fact: "success", operator: "equal", value: true });
        expect(conditions.any[1]).toEqual({ fact: "repro_url", operator: "contains", value: "localhost" });
      });
    });

    describe("nesting", () => {
      test.concurrent("Rule.all can contain a nested Rule.any group", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [
                  Rule.all([
                    Rule.signal("success", "equal", true),
                    Rule.any([
                      Rule.signal("repro_url", "contains", "https"),
                      Rule.signal("repro_url", "equal", "localhost"),
                    ]),
                  ], "continue"),
                ],
              },
            },
          ],
        });

        const conditions = pipeline.steps[0]!.advancementPolicyDefinition.rulesJson.rules[0]!
          .conditions as { all: unknown[] };
        expect(conditions.all).toHaveLength(2);
        expect(conditions.all[0]).toEqual({ fact: "success", operator: "equal", value: true });
        expect(conditions.all[1]).toMatchObject({ any: expect.arrayContaining([
          { fact: "repro_url", operator: "contains", value: "https" },
          { fact: "repro_url", operator: "equal", value: "localhost" },
        ]) });
      });

      test.concurrent("Rule.any can contain a nested Rule.all group", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [
                  Rule.any([
                    Rule.signal("success", "equal", true),
                    Rule.all([
                      Rule.signal("repro_url", "contains", "https"),
                      Rule.signal("success", "notEqual", null),
                    ]),
                  ], "continue"),
                ],
              },
            },
          ],
        });

        const conditions = pipeline.steps[0]!.advancementPolicyDefinition.rulesJson.rules[0]!
          .conditions as { any: unknown[] };
        expect(conditions.any).toHaveLength(2);
        expect(conditions.any[0]).toEqual({ fact: "success", operator: "equal", value: true });
        expect(conditions.any[1]).toMatchObject({ all: expect.arrayContaining([
          { fact: "repro_url", operator: "contains", value: "https" },
        ]) });
      });

      test.concurrent("deeply nested all > any > all serializes correctly", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [
                  Rule.all([
                    Rule.signal("success", "equal", true),
                    Rule.any([
                      Rule.all([
                        Rule.signal("repro_url", "contains", "https"),
                        Rule.signal("success", "notEqual", null),
                      ]),
                      Rule.signal("repro_url", "equal", "localhost"),
                    ]),
                  ], "continue"),
                ],
              },
            },
          ],
        });

        const policy = pipeline.steps[0]!.advancementPolicyDefinition;
        expect(policy.rulesJson.rules).toHaveLength(1);
        expect(policy.rulesJson.rules[0]!.event.type).toBe("continue");
        // Verify the outer "all" has two entries
        const outerAll = (policy.rulesJson.rules[0]!.conditions as { all: unknown[] }).all;
        expect(outerAll).toHaveLength(2);
      });
    });

    describe("multiple rules", () => {
      test.concurrent("rules are serialized in order and all outcomes appear in allowedEventTypes", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [
                  Rule.when("success", "equal", true, "continue"),
                  Rule.when("success", "equal", false, "needs_review"),
                ],
              },
            },
          ],
        });

        const policy = pipeline.steps[0]!.advancementPolicyDefinition;
        expect(policy.rulesJson.rules).toHaveLength(2);
        expect(policy.rulesJson.rules[0]!.event.type).toBe("continue");
        expect(policy.rulesJson.rules[1]!.event.type).toBe("needs_review");
        expect(policy.allowedEventTypes).toEqual(
          expect.arrayContaining(["block", "continue", "needs_review"]),
        );
      });

      test.concurrent("Rule.when and Rule.all can be mixed in the same rules array", () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            {
              step: reproduceStep,
              advancement: {
                defaultOutcome: "block",
                rules: [
                  Rule.when("success", "equal", true, "continue"),
                  Rule.all([
                    Rule.signal("repro_url", "contains", "https"),
                    Rule.signal("success", "notEqual", null),
                  ], "complete"),
                ],
              },
            },
          ],
        });

        const policy = pipeline.steps[0]!.advancementPolicyDefinition;
        expect(policy.rulesJson.rules).toHaveLength(2);
        expect(policy.rulesJson.rules[0]!.event.type).toBe("continue");
        expect(policy.rulesJson.rules[1]!.event.type).toBe("complete");
        expect(policy.allowedEventTypes).toEqual(
          expect.arrayContaining(["block", "continue", "complete"]),
        );
      });
    });
  });

  describe("timeout", () => {
    test.concurrent("timeoutSeconds defaults to null when omitted", () => {
      const pipeline = definePipeline({
        key: "p",
        name: "P",
        steps: [{ step: reproduceStep }],
      });

      expect(pipeline.steps[0]!.timeoutSeconds).toBeNull();
    });

    test.concurrent("timeoutSeconds is set when provided", () => {
      const pipeline = definePipeline({
        key: "p",
        name: "P",
        steps: [{ step: reproduceStep, timeout: 900 }],
      });

      expect(pipeline.steps[0]!.timeoutSeconds).toBe(900);
    });
  });

  test.concurrent(
    "steps with no input bindings produce an empty inputBindingsJson",
    () => {
      const pipeline = definePipeline({
        key: "p",
        name: "P",
        steps: [{ step: reproduceStep }],
      });

      expect(pipeline.steps[0]!.inputBindingsJson).toEqual({});
    },
  );
});
