import type { RuntimeCommandExecutionOutputTransport } from "./runtime-command-runner";

export type RuntimeCommandOutputSummary = {
  stdoutPreview: string;
  stderrPreview: string;
  stdoutBytes: number;
  stderrBytes: number;
  logRef: string | null;
};

export const RUNTIME_COMMAND_OUTPUT_PREVIEW_LIMIT = 4_000;

const buildPreview = (value: string) =>
  value.slice(0, RUNTIME_COMMAND_OUTPUT_PREVIEW_LIMIT);

export const summarizeRuntimeCommandOutput = (
  output: RuntimeCommandExecutionOutputTransport,
): RuntimeCommandOutputSummary => ({
  stdoutPreview: buildPreview(output.stdout),
  stderrPreview: buildPreview(output.stderr),
  stdoutBytes: Buffer.byteLength(output.stdout, "utf8"),
  stderrBytes: Buffer.byteLength(output.stderr, "utf8"),
  logRef: output.logRef?.trim() || null,
});
