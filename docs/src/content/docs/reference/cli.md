---
title: CLI Reference
description: Complete reference for all boboddy CLI commands and flags
---

## Global flags

These flags apply to every command:

| Flag | Description |
|------|-------------|
| `--env-file <path>` | Load environment variables from an alternate `.env` file |
| `--base-url <url>` | Override the API server URL (default: `https://boboddy.vercel.app`, also set via `BOBODDY_BASE_URL`) |
| `--help` | Show help for the current command |
| `--version` | Print the CLI version |

---

## `boboddy auth`

Manage authentication credentials.

### `boboddy auth login`

Start a device-flow browser login. Opens your browser; credentials are saved to `~/.boboddy.json` on completion.

```bash
boboddy auth login
```

### `boboddy auth logout`

Remove stored credentials.

```bash
boboddy auth logout
```

### `boboddy auth status`

Show whether you are currently authenticated.

```bash
boboddy auth status
```

### `boboddy auth whoami`

Print the email address of the authenticated user.

```bash
boboddy auth whoami
```

---

## `boboddy init`

Interactive project setup. Runs in sequence:

1. Authenticates (device flow if not logged in)
2. Creates or selects a project
3. Writes `.boboddy/boboddy.jsonc` with the `projectId`
4. Generates `.devcontainer/devcontainer.json`
5. Analyzes the repo and recommends pipelines

```bash
boboddy init
```

---

## `boboddy steps`

Manage step definitions.

### `boboddy steps init`

Scaffold the `.boboddy/steps/` directory with a starter `package.json`, `tsconfig.json`, and example step file.

```bash
boboddy steps init
```

### `boboddy steps push [projectId]`

Upload step definitions from `.boboddy/steps/` to the server. Reads `projectId` from `.boboddy/boboddy.jsonc` if not provided.

```bash
boboddy steps push
boboddy steps push <projectId>
```

---

## `boboddy pipelines`

Manage pipeline definitions.

### `boboddy pipelines pull`

Scaffold `.boboddy/pipeline-builder/` with TypeScript definitions that import your existing steps. If the server has steps, they are fetched; otherwise example data is used.

```bash
boboddy pipelines pull
```

---

## `boboddy work [projectId]`

Run a worker that polls for and executes step jobs.

```bash
boboddy work
boboddy work <projectId>
```

| Flag | Default | Description |
|------|---------|-------------|
| `--once` | `false` | Poll once and exit |
| `--concurrency <n>` | `3` | Max parallel jobs |
| `--batch-size <n>` | `5` | Max jobs claimed per poll |
| `--lease-duration-seconds <n>` | `60` | Seconds before the server reclaims an uncompleted job |
| `--poll-interval-ms <n>` | `5000` | Milliseconds between poll cycles |
| `--worker-id <id>` | auto | Override the worker ID sent to the server |
| `--work-item-id <id>` | — | Execute a specific work item and exit |
| `--preserve-runtime-on-complete` | `false` | Keep Docker containers after job completion |

---

## `boboddy runtime`

Utilities for managing the local execution environment.

### `boboddy runtime cleanup-networks`

Remove unused Docker networks created by prior worker runs.

```bash
boboddy runtime cleanup-networks
boboddy runtime cleanup-networks --verbose
```

| Flag | Description |
|------|-------------|
| `--verbose` | Print names of networks as they are removed |

---

## `boboddy hello [name]`

Print a greeting. Primarily used to verify the CLI is installed correctly.

```bash
boboddy hello          # Hello, world!
boboddy hello Alice    # Hello, Alice!
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error (check stderr / log output) |
