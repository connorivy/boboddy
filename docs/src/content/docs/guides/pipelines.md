---
title: Building Pipelines
description: Wire steps into orchestrated sequences with typed bindings and advancement policies
---

A **pipeline** is an ordered sequence of steps where each step's input can be bound to pipeline-level inputs, prior step outputs, or signals extracted from prior results.

## Basic pipeline

```typescript
import { definePipeline, fromPipelineInput } from '@boboddy/sdk';
import { z } from 'zod';
import { reviewCodeStep } from './steps';

export const codePipeline = definePipeline({
  key: 'code-quality-pipeline',
  name: 'Code Quality Pipeline',
  status: 'active',
  steps: [
    {
      step: reviewCodeStep,
      input: {
        code: fromPipelineInput(z.string(), 'code'),
      },
    },
  ],
});
```

## Scaffold pipeline definitions

Run this command to generate a `.boboddy/pipeline-builder/` project pre-populated with your existing step definitions:

```bash
boboddy pipelines pull
```

## `definePipeline` options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Unique identifier for this pipeline |
| `name` | `string` | Yes | Human-readable display name |
| `version` | `number` | No | Version number (defaults to 1) |
| `description` | `string` | No | Brief description |
| `status` | `"draft" \| "active"` | No | Draft pipelines are not executed |
| `steps` | `PipelineStep[]` | Yes | Ordered list of step entries |

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

## Multi-step pipeline example

```typescript
import { definePipeline, fromPipelineInput, fromSignal } from '@boboddy/sdk';
import { z } from 'zod';
import { reviewCodeStep, refactorStep, verifyStep } from './steps';

export const fullReviewPipeline = definePipeline({
  key: 'full-review',
  name: 'Full Code Review Pipeline',
  status: 'active',
  steps: [
    {
      step: reviewCodeStep,
      input: {
        code: fromPipelineInput(z.string(), 'code'),
      },
      advancement: rule('clarity_score').greaterThan(6),
    },
    {
      step: refactorStep,
      input: {
        code: fromPipelineInput(z.string(), 'code'),
        suggestions: stepOutput(reviewCodeStep),
      },
      timeout: 60_000,
    },
    {
      step: verifyStep,
      input: {
        original: fromPipelineInput(z.string(), 'code'),
        refactoredScore: fromSignal(reviewCodeStep, 'clarity_score'),
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
