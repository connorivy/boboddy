// ─── Operators ────────────────────────────────────────────────────────────────

/**
 * Comparison operators supported by json-rules-engine.
 * These map directly to the operator names the runtime evaluates against signal values.
 */
export type ConditionOperator =
  | "equal"
  | "notEqual"
  | "lessThan"
  | "lessThanInclusive"
  | "greaterThan"
  | "greaterThanInclusive"
  | "in"
  | "notIn"
  | "contains"
  | "doesNotContain";

// ─── Outcome ──────────────────────────────────────────────────────────────────

/** All possible outcomes a step can resolve to after policy evaluation. */
export type AdvancementEventType = "continue" | "block" | "needs_review" | "complete";

/**
 * The outcome emitted when a rule fires (or when no rules match and
 * `defaultOutcome` is used).
 *
 * Shorthand — use when no extra params are needed:
 *   "continue"
 *
 * Object form — use when the outcome carries additional context the runtime
 * or downstream steps should receive:
 *   { outcome: "needs_review", outcomeJson: { reason: "low confidence" } }
 */
export type AdvancementOutcome =
  | AdvancementEventType
  | { outcome: AdvancementEventType; outcomeJson?: Record<string, unknown> | null };

// ─── Raw rule type (json-rules-engine subset) ─────────────────────────────────

/**
 * The relevant subset of json-rules-engine's RuleProperties.
 * Only use this directly through `rawRule()` — prefer `whenSignal()` for
 * common cases.
 */
export type RawRuleProperties = {
  conditions: Record<string, unknown>;
  event: { type: string; params?: Record<string, unknown> };
  name?: string;
  priority?: number;
  [key: string]: unknown;
};

// ─── Rule shapes ──────────────────────────────────────────────────────────────

/**
 * A rule that fires when a named step signal satisfies a condition.
 *
 * `TSignalKeys` is constrained to the step's declared signal keys, so the
 * `signal` field is type-checked at compile time.
 */
export type WhenSignalRule<TSignalKeys extends string = string> = {
  readonly _tag: "when_signal";
  signal: TSignalKeys;
  operator: ConditionOperator;
  value: unknown;
  outcome: AdvancementOutcome;
};

/**
 * Full escape hatch for rules that `whenSignal()` can't express — compound
 * conditions (all/any/not), custom operators, priority overrides, etc.
 *
 * The `event.type` inside the raw rule must still be a valid AdvancementEventType.
 * Note: signal key type-checking is not available for raw rules.
 */
export type RawRule = {
  readonly _tag: "raw";
  raw: RawRuleProperties;
};

export type AdvancementRule<TSignalKeys extends string = string> =
  | WhenSignalRule<TSignalKeys>
  | RawRule;

// ─── Policy ───────────────────────────────────────────────────────────────────

/**
 * Controls when and how a pipeline step advances.
 *
 * Rules are evaluated in order; the first match wins. If no rule fires,
 * the step resolves to `defaultOutcome`.
 *
 * `TSignalKeys` is inferred from the step's declared signals and constrains
 * the `signal` field in any `WhenSignalRule` to only valid keys for that step.
 *
 * @example
 * // Block by default, continue only when the "passed" signal is true
 * {
 *   defaultOutcome: "block",
 *   rules: [whenSignal("passed", "equal", true, "continue")],
 * }
 */
export type AdvancementPolicy<TSignalKeys extends string = string> = {
  /**
   * The outcome emitted when no rule matches.
   *
   * "continue" — step advances automatically (good for non-gating steps).
   * "block"    — step waits for human intervention before advancing.
   */
  defaultOutcome: AdvancementOutcome;
  /**
   * Ordered list of rules evaluated against the step's signal values.
   * First match wins; unmatched falls through to `defaultOutcome`.
   */
  rules?: Array<AdvancementRule<TSignalKeys>>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a rule that fires when the named signal satisfies the given condition.
 * The `signal` key is validated against the step's declared signals at compile time.
 *
 * @example
 * // Equality shorthand
 * whenSignal("passed", "equal", true, "continue")
 *
 * // Range check
 * whenSignal("score", "greaterThanInclusive", 80, "continue")
 *
 * // In-list check
 * whenSignal("status", "in", ["approved", "auto_approved"], "continue")
 *
 * // With outcomeJson params
 * whenSignal("confidence", "lessThan", 0.5, { outcome: "needs_review", outcomeJson: { reason: "low confidence" } })
 */
export function whenSignal<TSignalKeys extends string>(
  signal: TSignalKeys,
  operator: ConditionOperator,
  value: unknown,
  outcome: AdvancementOutcome,
): WhenSignalRule<TSignalKeys> {
  return { _tag: "when_signal", signal, operator, value, outcome };
}

/**
 * Full escape hatch for rules that `whenSignal()` can't express.
 * Accepts a raw json-rules-engine RuleProperties object directly.
 *
 * Use this for compound conditions, custom operators, or priority overrides.
 * The `event.type` must be a valid AdvancementEventType value.
 *
 * @example
 * rawRule({
 *   name: "high-score-and-not-flagged",
 *   conditions: {
 *     all: [
 *       { fact: "score", operator: "greaterThan", value: 50 },
 *       { fact: "flagged", operator: "equal", value: false },
 *     ],
 *   },
 *   event: { type: "continue" },
 * })
 */
export function rawRule(rule: RawRuleProperties): RawRule {
  return { _tag: "raw", raw: rule };
}

// ─── Serialization ────────────────────────────────────────────────────────────

/** Serialized shape expected by the boboddy runtime API. */
export type SerializedAdvancementPolicy = {
  rulesJson: { rules: RawRuleProperties[] };
  defaultEventType: AdvancementEventType;
  defaultEventParamsJson: Record<string, unknown> | null;
  allowedEventTypes: AdvancementEventType[];
};

function resolveOutcome(outcome: AdvancementOutcome): {
  type: AdvancementEventType;
  params: Record<string, unknown> | null;
} {
  if (typeof outcome === "string") {
    return { type: outcome, params: null };
  }
  return { type: outcome.outcome, params: outcome.outcomeJson ?? null };
}

export function serializeAdvancementPolicy(
  policy: AdvancementPolicy | undefined,
): SerializedAdvancementPolicy {
  if (!policy) {
    return {
      rulesJson: { rules: [] },
      defaultEventType: "continue",
      defaultEventParamsJson: null,
      allowedEventTypes: ["continue"],
    };
  }

  const defaultResolved = resolveOutcome(policy.defaultOutcome);
  const outcomeSet = new Set<AdvancementEventType>([defaultResolved.type]);
  const serializedRules: RawRuleProperties[] = [];

  for (const rule of policy.rules ?? []) {
    if (rule._tag === "when_signal") {
      const resolved = resolveOutcome(rule.outcome);
      outcomeSet.add(resolved.type);
      serializedRules.push({
        conditions: {
          all: [{ fact: rule.signal, operator: rule.operator, value: rule.value }],
        },
        event: {
          type: resolved.type,
          ...(resolved.params ? { params: resolved.params } : {}),
        },
      });
    } else {
      // Raw rule: best-effort extraction of event type for allowedEventTypes
      outcomeSet.add(rule.raw.event.type as AdvancementEventType);
      serializedRules.push(rule.raw);
    }
  }

  return {
    rulesJson: { rules: serializedRules },
    defaultEventType: defaultResolved.type,
    defaultEventParamsJson: defaultResolved.params,
    allowedEventTypes: [...outcomeSet],
  };
}
