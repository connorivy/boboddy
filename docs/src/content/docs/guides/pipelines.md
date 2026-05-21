---
title: Building Pipelines
description: Wire steps into orchestrated sequences with typed bindings and advancement policies
---

A **pipeline** is an ordered sequence of steps where each step's input can be bound to pipeline-level inputs, prior step outputs, or signals extracted from prior results.

## Basic pipeline

```typescript
import { definePipeline, fromPipelineInput } from "@boboddy/sdk";
import { z } from "zod";
import { reviewCodeStep } from "./steps";

export const codePipeline = definePipeline({
  key: "code-quality-pipeline",
  name: "Code Quality Pipeline",
  status: "active",
  steps: [
    {
      step: reviewCodeStep,
      input: {
        code: fromPipelineInput(z.string(), "code"),
      },
    },
  ],
});
```

## Scaffold pipeline definitions

Run this command to fetch your existing step and pipeline definitions from the server and write them as editable TypeScript files:

```bash
boboddy pipelines pull
```

This creates (or overwrites) the following files inside `.boboddy/pipeline-builder/`:

| File | Description |
|------|-------------|
| `steps.ts` | One `defineStep()` export per step (latest version of each key) |
| `<pipeline-key>.ts` | One `definePipeline()` export per pipeline |
| `package.json` | SDK and zod dependencies (written once, never overwritten) |
| `tsconfig.json` | TypeScript config for the package (written once, never overwritten) |

For a brand-new project with no definitions on the server yet, use `boboddy pipelines init` instead to get a starter template.

After pulling, install dependencies inside the directory:

```bash
cd .boboddy/pipeline-builder && npm install
```

When you're ready to publish changes back:

```bash
boboddy pipelines push
```

This pushes steps first, then pipelines, in a single command.

## `definePipeline` options

| Field         | Type                  | Required | Description                         |
| ------------- | --------------------- | -------- | ----------------------------------- |
| `key`         | `string`              | Yes      | Unique identifier for this pipeline |
| `name`        | `string`              | Yes      | Human-readable display name         |
| `version`     | `number`              | No       | Version number (defaults to 1)      |
| `description` | `string`              | No       | Brief description                   |
| `status`      | `"draft" \| "active"` | No       | Draft pipelines are not executed    |
| `steps`       | `PipelineStep[]`      | Yes      | Ordered list of step entries        |

## Input binding

Each step entry in the pipeline has an `input` map that binds step input fields to values from the pipeline context.

### `fromPipelineInput(schema, path)`

Bind a step input field to a top-level pipeline input.

```typescript
input: {
  code: fromPipelineInput(z.string(), 'code'),
  language: fromPipelineInput(z.string().optional(), 'language'),
},
```

### `fromSignal(step, signalKey)`

Bind a step input field to a signal emitted by a prior step.

```typescript
// Step 2 receives the clarity_score signal from step 1
input: {
  previousScore: fromSignal(reviewCodeStep, 'clarity_score'),
},
```

### `stepOutput(step)`

Bind a step input field to the entire output object of a prior step.

```typescript
input: {
  reviewResult: stepOutput(reviewCodeStep),
},
```

## Advancement policies

An advancement policy (the `advancement` field on a step entry) defines a boolean rule over the step's signals that must be satisfied before the pipeline advances to the next step.

```typescript
import { definePipeline, rule } from '@boboddy/sdk';

steps: [
  {
    step: reviewCodeStep,
    input: { code: fromPipelineInput(z.string(), 'code') },
    advancement: rule('clarity_score').greaterThan(7),
  },
],
```

If the advancement rule is not satisfied, the pipeline halts at that step and marks the execution as needing review.

## Computed signals in advancement policies

`Computed` methods let you aggregate multiple raw signals into a derived value inline, directly inside an advancement policy — no separate `computedSignals` declaration on the step required.

```typescript
import { definePipeline, Rule, Computed, fromPipelineInput } from '@boboddy/sdk';

steps: [
  {
    step: reviewCodeStep,
    input: { code: fromPipelineInput(z.string(), 'code') },
    advancement: Rule.all([
      Rule.signal(Computed.average(['quality_score', 'security_score']), 'greaterThanInclusive', 7),
      Rule.signal('flagged', 'equal', false),
    ], 'continue'),
  },
],
```

### Available methods

| Method                           | Description                                   | Input signal types |
| -------------------------------- | --------------------------------------------- | ------------------ |
| `Computed.average(keys)`         | Arithmetic mean of the input signals          | `number`           |
| `Computed.weightedAverage(keys)` | Weighted mean (pass weights via `configJson`) | `number`           |
| `Computed.sum(keys)`             | Sum of the input signals                      | `number`           |
| `Computed.min(keys)`             | Minimum value across the input signals        | `number`           |
| `Computed.max(keys)`             | Maximum value across the input signals        | `number`           |
| `Computed.count(keys)`           | Count of truthy or present signal values      | `any`              |
| `Computed.booleanAny(keys)`      | `true` if any input signal is truthy          | `boolean`          |
| `Computed.booleanAll(keys)`      | `true` only if all input signals are truthy   | `boolean`          |

Each method accepts an array of **at least two** signal keys and an optional second argument for advanced options (`configJson`, `availableWhenResultStatusIn`).

## Multi-step pipeline example

```typescript
import { definePipeline, fromPipelineInput, fromSignal } from "@boboddy/sdk";
import { z } from "zod";
import { reviewCodeStep, refactorStep, verifyStep } from "./steps";

export const fullReviewPipeline = definePipeline({
  key: "full-review",
  name: "Full Code Review Pipeline",
  status: "active",
  steps: [
    {
      step: reviewCodeStep,
      input: {
        code: fromPipelineInput(z.string(), "code"),
      },
      advancement: rule("clarity_score").greaterThan(6),
    },
    {
      step: refactorStep,
      input: {
        code: fromPipelineInput(z.string(), "code"),
        suggestions: stepOutput(reviewCodeStep),
      },
      timeout: 60_000,
    },
    {
      step: verifyStep,
      input: {
        original: fromPipelineInput(z.string(), "code"),
        refactoredScore: fromSignal(reviewCodeStep, "clarity_score"),
      },
    },
  ],
});
```

## Timeouts

Set a `timeout` (milliseconds) on any step entry to cap how long a worker can spend on that step before it is marked failed.

```typescript
{ step: heavyAnalysisStep, input: { ... }, timeout: 120_000 }
```
