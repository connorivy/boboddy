---
title: Running Workers
description: Use boboddy work to claim and execute step jobs from the server
---

A **worker** is a long-running process that polls the Boboddy server for pending step executions, claims them under a time-limited lease, executes them using a local Docker environment, and reports results back.

## Start a worker

```bash
boboddy work
```

By default the worker runs continuously, polling your project's step queue every 5 seconds.

If your current directory contains `.boboddy/boboddy.jsonc`, the project ID is read automatically. Otherwise pass it explicitly:

```bash
boboddy work <projectId>
```

## Worker flags

| Flag | Default | Description |
|------|---------|-------------|
| `--once` | `false` | Process a single poll cycle and exit |
| `--concurrency <n>` | `3` | Maximum number of jobs executed in parallel |
| `--batch-size <n>` | `5` | Maximum jobs to claim per poll cycle |
| `--lease-duration-seconds <n>` | `60` | Lease duration before the server reclaims a job |
| `--poll-interval-ms <n>` | `5000` | Milliseconds between poll cycles |
| `--worker-id <id>` | auto | Override the worker identifier reported to the server |
| `--work-item-id <id>` | — | Execute a specific work item instead of polling |
| `--preserve-runtime-on-complete` | `false` | Keep Docker containers alive after a job finishes (useful for debugging) |

## How execution works

1. **Poll** — The worker calls the server to claim a batch of pending step executions.
2. **Claim** — Each claimed execution is assigned a lease. The worker sends heartbeats to extend the lease while processing.
3. **Environment setup** — The worker spins up a Docker runtime using your `.devcontainer/devcontainer.json`.
4. **Agent execution** — The step is handed to an OpenCode agent with the step's prompt, input payload, and any configured MCP servers.
5. **Signal extraction** — The agent's structured output is parsed; signals are extracted per the step's `signals` definition.
6. **Report** — The worker marks the execution complete (or failed) and posts output + signals back to the server.
7. **Cleanup** — The Docker environment is torn down (unless `--preserve-runtime-on-complete` is set).

## Environment requirements

- **Docker** must be running and accessible to the worker process.
- **OpenCode** must be installed and configured (`~/.config/opencode/opencode.jsonc`). See [opencode.ai/docs](https://opencode.ai/docs) for setup instructions.
- Your repo must have a `.devcontainer/devcontainer.json` (created by `boboddy init`).
- Credentials must be present (`boboddy auth login`).

## Single-job mode

For debugging or CI use cases, run a specific work item:

```bash
boboddy work --work-item-id <id> --once --preserve-runtime-on-complete
```

This claims the specified item, runs it once, and keeps the container alive so you can inspect the execution environment.

## Clean up Docker networks

After multiple worker runs, Docker may accumulate unused networks. Clean them up with:

```bash
boboddy runtime cleanup-networks
boboddy runtime cleanup-networks --verbose
```

## Authentication

Workers use credentials stored in `~/.boboddy.json`. If running in CI, set the `BOBODDY_BASE_URL` environment variable and ensure credentials are available (e.g., via a secret injected at `~/.boboddy.json`).
