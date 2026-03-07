import { spawn } from "child_process";

export const runCodexCli = (prompt: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn("codex", ["exec", prompt], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Codex CLI timed out"));
    }, 120_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Codex CLI failed: ${stderr || `exit ${code}`}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
