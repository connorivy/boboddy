import { describe, expect, vi } from "bun:test";
import { RuntimeNetworkGarbageCollector } from "../src/runtime/runtime-network-garbage-collector";
import { concurrentTest } from "./utils";

describe("RuntimeNetworkGarbageCollector", () => {
  concurrentTest("removes only empty Boboddy runtime networks", async () => {
    const execFileAsync = vi.fn(
      (_file: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
        if (args[0] === "network" && args[1] === "ls") {
          return Promise.resolve({
            stdout: [
              "bridge",
              "boboddy-project-runtime-session-empty",
              "boboddy-project-runtime-session-busy",
            ].join("\n"),
            stderr: "",
          });
        }

        if (
          args[0] === "network" &&
          args[1] === "inspect" &&
          args[2] === "boboddy-project-runtime-session-empty"
        ) {
          return Promise.resolve({
            stdout: JSON.stringify([{ Name: args[2], Containers: {} }]),
            stderr: "",
          });
        }

        if (
          args[0] === "network" &&
          args[1] === "inspect" &&
          args[2] === "boboddy-project-runtime-session-busy"
        ) {
          return Promise.resolve({
            stdout: JSON.stringify([{ Name: args[2], Containers: { abc123: {} } }]),
            stderr: "",
          });
        }

        if (
          args[0] === "network" &&
          args[1] === "rm" &&
          args[2] === "boboddy-project-runtime-session-empty"
        ) {
          return Promise.resolve({
            stdout: "boboddy-project-runtime-session-empty\n",
            stderr: "",
          });
        }

        throw new Error(`Unexpected docker invocation: ${args.join(" ")}`);
      },
    );

    const collector = new RuntimeNetworkGarbageCollector({ execFileAsync });
    const result = await collector.cleanupUnusedNetworks();

    expect(result).toEqual({
      scannedCount: 2,
      removedCount: 1,
      keptCount: 1,
      removedNetworks: ["boboddy-project-runtime-session-empty"],
      keptNetworks: ["boboddy-project-runtime-session-busy"],
    });
    expect(execFileAsync).toHaveBeenCalledWith("docker", [
      "network",
      "rm",
      "boboddy-project-runtime-session-empty",
    ]);
    expect(execFileAsync).not.toHaveBeenCalledWith("docker", [
      "network",
      "rm",
      "boboddy-project-runtime-session-busy",
    ]);
  });
});
