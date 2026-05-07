import type { Plugin } from "@opencode-ai/plugin";

const PROJECT_DEPENDENCY_COMMANDS = [
  "bun",
  "deno",
  "dotnet",
  "python",
  "python3",
  "pip",
  "pip3",
  "npm",
  "yarn",
  "pnpm",
  "node",
  "cargo",
  "gradle",
  "mvn",
  "composer",
];

// Match these commands at start of string or after a shell operator
const DEPENDENCY_PATTERN = new RegExp(
  `(?:^|&&|\\|\\||;)\\s*(${PROJECT_DEPENDENCY_COMMANDS.join("|")})(?:\\s|$)`,
);

export const BlockDirectDependencyCommandsPlugin: Plugin = () => {
  return Promise.resolve({
    "tool.execute.before": (input, output) => {
      if (input.tool !== "bash") return Promise.resolve();

      const args = output.args as Record<string, unknown> | undefined;
      const command = (args?.["command"] as string | undefined) ?? "";
      const match = command.match(DEPENDENCY_PATTERN);

      if (match) {
        throw new Error(
          `Direct invocation of '${match[1] ?? "unknown"}' via bash is not allowed. ` +
            `Commands that use project runtimes must be run with the 'boboddy-run-command' tool ` +
            `so they execute inside the devcontainer with the correct environment. ` +
            `Use boboddy-run-command with: command="${command}"`,
        );
      }

      return Promise.resolve();
    },
  });
};
