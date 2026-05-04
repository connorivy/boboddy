import { spawn } from "node:child_process";

export async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const command: readonly [string, ...string[]] =
    platform === "darwin"
      ? ["open", url]
      : platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: "ignore",
      detached: true,
    });

    child.on("error", reject);
    child.unref();
    resolve();
  });
}
