import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import { tool } from "@opencode-ai/plugin";

const DEFAULT_OUTPUT_PATH = ".boboddy/step-findings-submission.json";

export default tool({
  description:
    "Submit Boboddy step findings as JSON. findingsJson must validate against resultSchemaJson.",
  args: {
    findingsJson: tool.schema
      .json()
      .describe("Structured findings payload for the current step"),
    resultSchemaJson: tool.schema
      .json()
      .describe("JSON schema from the step definition resultSchemaJson"),
  },
  async execute(args) {
    if (
      args.resultSchemaJson === null ||
      typeof args.resultSchemaJson !== "object" ||
      Array.isArray(args.resultSchemaJson)
    ) {
      throw new Error("resultSchemaJson must be a JSON object schema");
    }

    const ajv = new Ajv({ allErrors: true, strict: false });
    let validate: ReturnType<Ajv["compile"]>;

    try {
      validate = ajv.compile(args.resultSchemaJson as Record<string, unknown>);
    } catch (error) {
      throw new Error(
        `Invalid resultSchemaJson: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const valid = validate(args.findingsJson);
    if (!valid) {
      const details = (validate.errors ?? [])
        .map((issue) => `${issue.instancePath || "/"} ${issue.message ?? "invalid"}`)
        .join("; ");
      throw new Error(
        `findingsJson does not match resultSchemaJson: ${details || "validation failed"}`,
      );
    }

    const filePath = path.join(process.cwd(), DEFAULT_OUTPUT_PATH);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ findingsJson: args.findingsJson }, null, 2)}\n`,
      "utf8",
    );

    return JSON.stringify(
      {
        ok: true,
        outputPath: DEFAULT_OUTPUT_PATH,
      },
      null,
      2,
    );
  },
});
