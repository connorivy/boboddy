#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");

const STATE_FILE_PATH = path.resolve(process.cwd(), "boboddy-state.json");
const LOG_PREFIX = "[ticket-postgres-mcp]";

function log(message, details) {
  if (details === undefined) {
    console.error(`${LOG_PREFIX} ${message}`);
    return;
  }

  console.error(`${LOG_PREFIX} ${message}`, details);
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function readDbHostFromStateFile() {
  log("Reading state file", { path: STATE_FILE_PATH });
  const rawState = readFileSync(STATE_FILE_PATH, "utf8");
  const state = JSON.parse(rawState);

  if (
    typeof state !== "object" ||
    state === null ||
    typeof state.dbHost !== "string" ||
    state.dbHost.trim().length === 0
  ) {
    throw new Error(
      `Expected boboddy-state.json to contain a non-empty "dbHost" string at ${STATE_FILE_PATH}`,
    );
  }

  const dbHost = state.dbHost.trim();
  log("Loaded dbHost from state file", { dbHost });
  return dbHost;
}

function normalizeHost(dbHost) {
  try {
    return new URL(dbHost).hostname;
  } catch {
    return dbHost
      .replace(/^[a-z]+:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .trim();
  }
}

function buildDatabaseUrl() {
  const username = encodeURIComponent(getRequiredEnv("POSTGRES_USERNAME"));
  const password = encodeURIComponent(getRequiredEnv("POSTGRES_PASSWORD"));
  const database = encodeURIComponent(getRequiredEnv("POSTGRES_DATABASE"));
  const port = getRequiredEnv("POSTGRES_PORT");
  const host = normalizeHost(readDbHostFromStateFile());

  if (!host) {
    throw new Error(`Could not derive a hostname from ${STATE_FILE_PATH}`);
  }

  log("Resolved database connection target", {
    host,
    port,
    database: decodeURIComponent(database),
    username: decodeURIComponent(username),
  });

  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
}

function main() {
  const databaseUrl = buildDatabaseUrl();
  log("Starting Postgres MCP server process");
  const child = spawn(
    "npx",
    ["-y", "@modelcontextprotocol/server-postgres"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      log("Postgres MCP server exited from signal", { signal });
      process.kill(process.pid, signal);
      return;
    }

    log("Postgres MCP server exited", { code: code ?? 1 });
    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    log("Failed to start Postgres MCP server", {
      message: error.message,
    });
    process.exit(1);
  });
}

try {
  main();
} catch (error) {
  log("Proxy initialization failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
