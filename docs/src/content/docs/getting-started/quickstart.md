---
title: Quickstart
description: Initialize a project, define a step, and run your first worker
---

This guide walks you through creating a Boboddy project, defining a step, pushing it to the server, and running a worker to execute it.

## 1. Initialize your project

Run `boboddy init` inside your repository. The interactive setup will:

1. Authenticate you (if not already logged in)
2. Create or select a project on the server
3. Generate `.devcontainer/devcontainer.json` for your repo
4. Recommend pipeline structures based on your codebase

```bash
cd my-repo
boboddy init
```

This creates `.boboddy/boboddy.jsonc` with your `projectId`.

## 2. Scaffold the steps directory

```bash
boboddy steps init
```

This creates `.boboddy/steps/` with a `package.json`, `tsconfig.json`, and an example step file. All your step definitions live here.

## 3. Define a step

Edit `.boboddy/steps/index.ts` (or add a new file):

```typescript
import { defineStep } from '@boboddy/sdk';
import { z } from 'zod';

export const reviewCodeStep = defineStep({
  key: 'review-code',
  name: 'Review Code',
  description: 'Analyze a code snippet and return a clarity score.',
  input: z.object({
    code: z.string(),
    language: z.string().optional(),
  }),
  result: z.object({
    feedback: z.string(),
    score: z.number().min(0).max(10),
  }),
  signals: [
    { sourcePath: 'score', key: 'clarity_score', type: 'number', required: true },
  ],
  prompt: `Review the provided code snippet. Return structured feedback and a clarity score from 0 to 10.`,
  status: 'active',
});
```

See [Defining Steps](/boboddy/guides/steps/) for full details on all options.

## 4. Push your steps

Upload your step definitions to the server:

```bash
boboddy steps push
```

Pass an explicit project ID if you're outside a project directory:

```bash
boboddy steps push <projectId>
```

## 5. Scaffold a pipeline

```bash
boboddy pipelines pull
```

This creates `.boboddy/pipeline-builder/` with TypeScript definitions that import your steps. Edit the generated files to wire steps into a pipeline.

## 6. Run a worker

Start a worker on any machine with Docker:

```bash
boboddy work
```

The worker polls for pending step executions, claims them, runs them inside your devcontainer environment, and reports results back. See [Running Workers](/boboddy/guides/workers/) for all worker options.

## Project structure

After completing setup, your repo will have:

```
my-repo/
├── .boboddy/
│   ├── boboddy.jsonc          # project config (projectId)
│   ├── steps/                 # step definitions
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── index.ts
│   └── pipeline-builder/      # pipeline definitions
│       ├── package.json
│       ├── tsconfig.json
│       └── index.ts
└── .devcontainer/
    └── devcontainer.json      # execution environment
```
