import { z } from "zod";
import type { ZodObject, ZodRawShape } from "zod";

// ─── Core types ───────────────────────────────────────────────────────────────

type FeatureSignalSpec = {
  key: string;
  sourcePath: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  availableWhenResultStatusIn?: string[] | null;
};

export type StepFeature<
  TResultExtension extends Record<string, unknown> = Record<string, unknown>,
  TSignalKeys extends string = string,
> = {
  readonly _resultExtension: ZodObject<ZodRawShape>;
  readonly _promptAddition: string;
  readonly _signals: FeatureSignalSpec[];
  readonly __resultExtension?: TResultExtension; // phantom
  readonly __signalKeys?: TSignalKeys;           // phantom
};

export type AnyStepFeature = StepFeature<Record<string, unknown>, string>;

type UnionToIntersection<U> =
  (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

// Merges result extension types from all features into a single intersection.
export type FeatureResultExtensions<TFeatures extends readonly AnyStepFeature[]> =
  [TFeatures[number]] extends [never]
    ? Record<never, never>
    : UnionToIntersection<
        TFeatures[number] extends StepFeature<infer R, string> ? R : never
      >;

// Unions all signal keys contributed by features.
export type FeatureSignalKeys<TFeatures extends readonly AnyStepFeature[]> =
  TFeatures[number] extends StepFeature<Record<string, unknown>, infer K> ? K : never;

// ─── Built-in: feedbackRequests ───────────────────────────────────────────────

export type FeedbackRequestItem = {
  question: string;
  category: string;
  suggestedKey?: string;
};

const FEEDBACK_REQUEST_SIGNAL_KEY = "$boboddy_feedback_request_v1" as const;

const feedbackRequestItemSchema = z.object({
  question: z.string(),
  category: z.string(),
  suggestedKey: z.string().optional(),
});

type FeedbackRequestsFeature = StepFeature<
  { feedbackRequests?: FeedbackRequestItem[] },
  typeof FEEDBACK_REQUEST_SIGNAL_KEY
>;

const feedbackRequestsFeature: FeedbackRequestsFeature = {
  _resultExtension: z.object({
    feedbackRequests: z.array(feedbackRequestItemSchema).optional(),
  }),
  _promptAddition: [
    "## Feedback Requests",
    "",
    "If you encounter anything that warrants human review, populate the `feedbackRequests` array:",
    "- **question**: The specific question to pose to a human reviewer",
    '- **category**: A grouping label for the feedback (e.g. `"accuracy"`, `"completeness"`)',
    "- **suggestedKey** *(optional)*: A suggested answer key for reference",
  ].join("\n"),
  _signals: [
    {
      key: FEEDBACK_REQUEST_SIGNAL_KEY,
      sourcePath: "feedbackRequests",
      type: "array",
      required: false,
    },
  ],
};

// ─── Features namespace ───────────────────────────────────────────────────────

export const Features = {
  feedbackRequests: Object.assign(
    (): FeedbackRequestsFeature => feedbackRequestsFeature,
    {
      signal: {
        key: FEEDBACK_REQUEST_SIGNAL_KEY,
        find(
          signals: Array<{ key: string; valueJson: unknown }>,
        ): FeedbackRequestItem[] | undefined {
          const match = signals.find((s) => s.key === FEEDBACK_REQUEST_SIGNAL_KEY);
          if (!match) return undefined;
          const parsed = z.array(feedbackRequestItemSchema).safeParse(match.valueJson);
          return parsed.success ? parsed.data : undefined;
        },
      },
    },
  ),
} as const;
