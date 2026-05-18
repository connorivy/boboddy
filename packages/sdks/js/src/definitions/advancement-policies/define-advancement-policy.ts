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
export type AdvancementEventType =
  | "continue"
  | "block"
  | "needs_review"
  | "complete";

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
  | {
      outcome: AdvancementEventType;
      outcomeJson?: Record<string, unknown> | null;
    };

// ─── Conditions ───────────────────────────────────────────────────────────────

/**
 * A leaf condition that checks a single signal value against a given operator
 * and value. Used directly inside `Rule.all()` / `Rule.any()`, or implicitly
 * by `Rule.when()`.
 *
 * `TSignalKeys` is constrained to the declaring step's signal keys, so the
 * `signal` field is validated at compile time.
 */
export type SignalCondition<TSignalKeys extends string = string> = {
  readonly _tag: "signal";
  signal: TSignalKeys;
  operator: ConditionOperator;
  value: unknown;
};

/**
 * A condition group where ALL nested conditions must match.
 * Created by calling `Rule.all()` without an outcome argument.
 * Can itself be nested inside another `Rule.all()` or `Rule.any()`.
 */
export type AllCondition<TSignalKeys extends string = string> = {
  readonly _tag: "all";
  conditions: RuleCondition<TSignalKeys>[];
};

/**
 * A condition group where ANY nested condition must match.
 * Created by calling `Rule.any()` without an outcome argument.
 * Can itself be nested inside another `Rule.all()` or `Rule.any()`.
 */
export type AnyCondition<TSignalKeys extends string = string> = {
  readonly _tag: "any";
  conditions: RuleCondition<TSignalKeys>[];
};

/**
 * Anything that can appear inside `Rule.all()` or `Rule.any()` — either a leaf
 * signal condition or a nested all/any group.
 */
export type RuleCondition<TSignalKeys extends string = string> =
  | SignalCondition<TSignalKeys>
  | AllCondition<TSignalKeys>
  | AnyCondition<TSignalKeys>;

// ─── Rule ─────────────────────────────────────────────────────────────────────

/**
 * A complete advancement rule: one or more conditions evaluated in `all` or
 * `any` mode, plus the outcome emitted when the rule fires.
 *
 * Rules are created via the `Rule` namespace — `Rule.when()`, `Rule.all()`,
 * `Rule.any()`. They are not constructed directly.
 */
export type Rule<TSignalKeys extends string = string> = {
  readonly _tag: "rule";
  mode: "all" | "any";
  conditions: RuleCondition<TSignalKeys>[];
  outcome: AdvancementOutcome;
};

// ─── Rule namespace ───────────────────────────────────────────────────────────

/**
 * Creates a leaf signal condition for use inside `Rule.all()` or `Rule.any()`.
 * Not a rule itself — no outcome is attached.
 *
 * @example
 * Rule.all([
 *   Rule.signal("score", "greaterThanInclusive", 80),
 *   Rule.signal("flagged", "equal", false),
 * ], "continue")
 */
function signal<TSignalKeys extends string>(
  signal: TSignalKeys,
  operator: ConditionOperator,
  value: unknown,
): SignalCondition<TSignalKeys> {
  return { _tag: "signal", signal, operator, value };
}

/**
 * When called with only `conditions`: returns a nested `AllCondition` group
 * for use inside another `Rule.all()` or `Rule.any()`.
 *
 * When called with `conditions` and `outcome`: returns a top-level `Rule` that
 * fires when ALL conditions match.
 *
 * @example
 * // Top-level rule
 * Rule.all([Rule.signal("passed", "equal", true)], "continue")
 *
 * // Nested inside Rule.any
 * Rule.any([
 *   Rule.all([
 *     Rule.signal("score", "greaterThan", 90),
 *     Rule.signal("flagged", "equal", false),
 *   ]),
 *   Rule.signal("override", "equal", true),
 * ], "continue")
 */
function all<TSignalKeys extends string>(
  conditions: RuleCondition<TSignalKeys>[],
): AllCondition<TSignalKeys>;
function all<TSignalKeys extends string>(
  conditions: RuleCondition<TSignalKeys>[],
  outcome: AdvancementOutcome,
): Rule<TSignalKeys>;
function all<TSignalKeys extends string>(
  conditions: RuleCondition<TSignalKeys>[],
  outcome?: AdvancementOutcome,
): AllCondition<TSignalKeys> | Rule<TSignalKeys> {
  if (outcome === undefined) {
    return { _tag: "all", conditions };
  }
  return { _tag: "rule", mode: "all", conditions, outcome };
}

/**
 * When called with only `conditions`: returns a nested `AnyCondition` group
 * for use inside another `Rule.all()` or `Rule.any()`.
 *
 * When called with `conditions` and `outcome`: returns a top-level `Rule` that
 * fires when ANY condition matches.
 *
 * @example
 * // Top-level rule
 * Rule.any([
 *   Rule.signal("score", "greaterThan", 90),
 *   Rule.signal("override", "equal", true),
 * ], "continue")
 *
 * // Nested inside Rule.all
 * Rule.all([
 *   Rule.signal("score", "greaterThanInclusive", 80),
 *   Rule.any([
 *     Rule.signal("reviewerApproved", "equal", true),
 *     Rule.signal("autoApproved", "equal", true),
 *   ]),
 * ], "continue")
 */
function any<TSignalKeys extends string>(
  conditions: RuleCondition<TSignalKeys>[],
): AnyCondition<TSignalKeys>;
function any<TSignalKeys extends string>(
  conditions: RuleCondition<TSignalKeys>[],
  outcome: AdvancementOutcome,
): Rule<TSignalKeys>;
function any<TSignalKeys extends string>(
  conditions: RuleCondition<TSignalKeys>[],
  outcome?: AdvancementOutcome,
): AnyCondition<TSignalKeys> | Rule<TSignalKeys> {
  if (outcome === undefined) {
    return { _tag: "any", conditions };
  }
  return { _tag: "rule", mode: "any", conditions, outcome };
}

/**
 * Shorthand for a single-condition rule. Equivalent to
 * `Rule.all([Rule.signal(signal, operator, value)], outcome)`.
 *
 * @example
 * Rule.when("passed", "equal", true, "continue")
 * Rule.when("score", "greaterThanInclusive", 80, { outcome: "continue", outcomeJson: { via: "score" } })
 */
function when<TSignalKeys extends string>(
  signal: TSignalKeys,
  operator: ConditionOperator,
  value: unknown,
  outcome: AdvancementOutcome,
): Rule<TSignalKeys> {
  return {
    _tag: "rule",
    mode: "all",
    conditions: [{ _tag: "signal", signal, operator, value }],
    outcome,
  };
}

/**
 * All factories for building advancement rules.
 *
 * - `Rule.signal` — leaf condition (used inside `all` / `any`)
 * - `Rule.all`    — all conditions must match; nestable
 * - `Rule.any`    — any condition must match; nestable
 * - `Rule.when`   — shorthand for a single-signal rule
 */
export const Rule = { signal, all, any, when } as const;

// ─── Policy ───────────────────────────────────────────────────────────────────

/**
 * Controls when and how a pipeline step advances.
 *
 * Rules are evaluated in order; the first match wins. If no rule fires,
 * the step resolves to `defaultOutcome`.
 *
 * `TSignalKeys` is inferred from the step's declared signals, which constrains
 * all `Rule.signal()` / `Rule.when()` calls to only valid signal keys.
 *
 * @example
 * {
 *   defaultOutcome: "block",
 *   rules: [
 *     Rule.when("passed", "equal", true, "continue"),
 *     Rule.all([
 *       Rule.signal("score", "greaterThanInclusive", 80),
 *       Rule.any([
 *         Rule.signal("reviewerApproved", "equal", true),
 *         Rule.signal("autoApproved", "equal", true),
 *       ]),
 *     ], "continue"),
 *   ],
 * }
 */
export type AdvancementPolicy<TSignalKeys extends string = string> = {
  /**
   * The outcome emitted when no rule matches.
   * "continue" — step advances automatically.
   * "block"    — step waits for human intervention.
   */
  defaultOutcome: AdvancementOutcome;
  /**
   * Ordered list of rules evaluated against the step's signal values.
   * First match wins; unmatched falls through to `defaultOutcome`.
   */
  rules?: Rule<TSignalKeys>[];
};

// ─── Serialization ────────────────────────────────────────────────────────────

// Internal types matching the json-rules-engine wire format.

type SerializedLeafCondition = {
  fact: string;
  operator: string;
  value: unknown;
};

type SerializedConditionGroup = {
  all?: SerializedCondition[];
  any?: SerializedCondition[];
};

type SerializedCondition = SerializedLeafCondition | SerializedConditionGroup;

type SerializedRule = {
  conditions: SerializedConditionGroup;
  event: { type: string; params?: Record<string, unknown> };
};

/** Serialized shape expected by the boboddy runtime API. */
export type SerializedAdvancementPolicy = {
  rulesJson: { rules: SerializedRule[] };
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

function serializeCondition(condition: RuleCondition): SerializedCondition {
  if (condition._tag === "signal") {
    return {
      fact: condition.signal,
      operator: condition.operator,
      value: condition.value,
    };
  }
  if (condition._tag === "all") {
    return { all: condition.conditions.map(serializeCondition) };
  }
  return { any: condition.conditions.map(serializeCondition) };
}

function serializeRule(rule: Rule): SerializedRule {
  const resolved = resolveOutcome(rule.outcome);
  return {
    conditions: { [rule.mode]: rule.conditions.map(serializeCondition) },
    event: {
      type: resolved.type,
      ...(resolved.params ? { params: resolved.params } : {}),
    },
  };
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

  const serializedRules = (policy.rules ?? []).map((rule) => {
    outcomeSet.add(resolveOutcome(rule.outcome).type);
    return serializeRule(rule);
  });

  return {
    rulesJson: { rules: serializedRules },
    defaultEventType: defaultResolved.type,
    defaultEventParamsJson: defaultResolved.params,
    allowedEventTypes: [...outcomeSet],
  };
}
