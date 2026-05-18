import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineStep } from "../src/definitions/steps/define-step";

describe("defineStep", () => {
  test("applies sensible defaults", () => {
    const spec = defineStep({ key: "my-step", name: "My Step" });
    expect(spec).toMatchObject({
      version: 1,
      kind: "user_defined",
      status: "active",
      description: null,
      prompt: null,
      inputSchemaJson: null,
      resultSchemaJson: null,
      signalExtractorDefinitions: [],
      computedSignalDefinitions: [],
      opencodeMcpJson: null,
    });
  });

  test("converts a complex nested result schema to JSON Schema", () => {
    const resultSchema = z
      .object({
        outcome: z.enum([
          "reproduced",
          "not_reproducible",
          "needs_user_feedback",
          "agent_error",
          "cancelled",
        ]),
        summaryOfFindings: z.string().min(1),
        stepsTried: z.array(z.string().min(1)),
        observedBehavior: z.string().nullable().optional(),
        expectedBehavior: z.string().nullable().optional(),
        failureReason: z.string().nullable().optional(),
        rawResultJson: z.record(z.string(), z.unknown()).nullable().optional(),
        feedbackRequestsV1: z
          .array(
            z.object({
              question: z.string(),
              category: z.string(),
              suggestedKey: z.string(),
            }),
          )
          .optional(),
      })
      .loose();

    const spec = defineStep({
      key: "debug-issue",
      name: "Debug Issue",
      result: resultSchema,
      signals: [
        { sourcePath: "outcome" },
        { sourcePath: "summaryOfFindings" },
      ],
    });

    expect(spec.resultSchemaJson).toMatchObject({
      type: "object",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      required: expect.arrayContaining(["outcome", "summaryOfFindings", "stepsTried"]),
      properties: {
        outcome: {
          type: "string",
          enum: ["reproduced", "not_reproducible", "needs_user_feedback", "agent_error", "cancelled"],
        },
        summaryOfFindings: { type: "string", minLength: 1 },
        stepsTried: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
        feedbackRequestsV1: {
          type: "array",
          items: {
            type: "object",
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            required: expect.arrayContaining(["question", "category", "suggestedKey"]),
            properties: {
              question: { type: "string" },
              category: { type: "string" },
              suggestedKey: { type: "string" },
            },
          },
        },
      },
    });
  });

  describe("signals", () => {
    test("key defaults to sourcePath, type is derived from result schema", () => {
      const spec = defineStep({
        key: "my-step",
        name: "My Step",
        result: z.object({
          score: z.number(),
          label: z.string(),
          active: z.boolean(),
          tags: z.array(z.string()),
          meta: z.object({ value: z.number() }),
        }),
        signals: [
          { sourcePath: "score" },
          { sourcePath: "label" },
          { sourcePath: "active" },
          { sourcePath: "tags" },
          { sourcePath: "meta" },
          { sourcePath: "meta.value" },
        ],
      });

      const defs = spec.signalExtractorDefinitions;
      expect(defs[0]).toEqual({ key: "score",      sourcePath: "score",      type: "number",  required: true, availableWhenResultStatusIn: null });
      expect(defs[1]).toEqual({ key: "label",      sourcePath: "label",      type: "string",  required: true, availableWhenResultStatusIn: null });
      expect(defs[2]).toEqual({ key: "active",     sourcePath: "active",     type: "boolean", required: true, availableWhenResultStatusIn: null });
      expect(defs[3]).toEqual({ key: "tags",       sourcePath: "tags",       type: "array",   required: true, availableWhenResultStatusIn: null });
      expect(defs[4]).toEqual({ key: "meta",       sourcePath: "meta",       type: "object",  required: true, availableWhenResultStatusIn: null });
      expect(defs[5]).toEqual({ key: "meta.value", sourcePath: "meta.value", type: "number",  required: true, availableWhenResultStatusIn: null });
    });

    test("explicit key and required override auto-derivation", () => {
      const spec = defineStep({
        key: "my-step",
        name: "My Step",
        result: z.object({ score: z.number() }),
        signals: [{ key: "custom_key", sourcePath: "score", required: false }],
      });

      expect(spec.signalExtractorDefinitions[0]).toEqual({
        key: "custom_key",
        sourcePath: "score",
        type: "number",
        required: false,
        availableWhenResultStatusIn: null,
      });
    });
  });
});
