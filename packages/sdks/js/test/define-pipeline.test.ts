import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineStep } from "../src/definitions/steps/define-step";
import {
  definePipeline,
  fromPipelineInput,
  fromSignal,
  stepOutput,
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
        expect(bindings["checkSuccess"]).toMatchObject({ source: "step_output" });
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

    test.concurrent("serializes block advancement policy", () => {
      const pipeline = definePipeline({
        key: "p",
        name: "P",
        steps: [{ step: reproduceStep, advancement: { default: "block" } }],
      });

      expect(pipeline.steps[0]!.advancementPolicyDefinition).toMatchObject({
        defaultEventType: "block",
        allowedEventTypes: ["block"],
      });
    });

    test.concurrent(
      "each step can have an independent advancement policy",
      () => {
        const pipeline = definePipeline({
          key: "p",
          name: "P",
          steps: [
            { step: reproduceStep, advancement: { default: "block" } },
            { step: verifyStep, advancement: { default: "continue" } },
          ],
        });

        expect(
          pipeline.steps[0]!.advancementPolicyDefinition.defaultEventType,
        ).toBe("block");
        expect(
          pipeline.steps[1]!.advancementPolicyDefinition.defaultEventType,
        ).toBe("continue");
      },
    );
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
