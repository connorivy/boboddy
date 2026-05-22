import type { Plugin } from "@opencode-ai/plugin";

const PROJECT_DEPENDENCY_COMMANDS = [
  // JavaScript / Node.js
  "bun",
  "bunx",
  "deno",
  "node",
  "npm",
  // "npx",
  "pnpm",
  "yarn",
  "corepack",
  // Python
  "python",
  "python2",
  "python3",
  "pip",
  "pipx",
  "pip2",
  "pip3",
  "poetry",
  "pipenv",
  "conda",
  // "uv",
  // "uvx",
  "pdm",
  "rye",
  // Rust
  "cargo",
  "rustc",
  "rustup",
  // Go
  "go",
  // Java / JVM
  "java",
  "javac",
  "gradle",
  "./gradlew",
  "mvn",
  "./mvnw",
  "ant",
  "sbt",
  "kotlin",
  // .NET
  "dotnet",
  "nuget",
  // Ruby
  "ruby",
  "gem",
  "bundle",
  "bundler",
  "rake",
  "rails",
  // PHP
  "php",
  "composer",
  // Swift / Dart / Flutter
  "swift",
  "dart",
  "flutter",
  // Elixir / Erlang
  "elixir",
  "iex",
  "mix",
  // Clojure
  "clojure",
  "clj",
  "lein",
  // Haskell
  "stack",
  "cabal",
  // Build tools
  "cmake",
  "meson",
  "make",
  // "docker",
  "docker-compose",
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
