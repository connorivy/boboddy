import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function resolveSdkDependency(sdkVersion: string): string {
  const artifactPath = process.env["BOBODDY_SDK_ARTIFACT_PATH"];
  if (artifactPath) {
    return `file:${artifactPath}`;
  }

  return `^${sdkVersion}`;
}

function buildPackageJson(sdkVersion: string): string {
  return JSON.stringify(
    {
      name: "steps",
      private: true,
      type: "module",
      dependencies: {
        "@boboddy/sdk": resolveSdkDependency(sdkVersion),
        zod: "^4.4.2",
      },
    },
    null,
    2,
  );
}

const TSCONFIG_JSON = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022"],
      module: "ESNext",
      moduleResolution: "Bundler",
      moduleDetection: "force",
      verbatimModuleSyntax: true,
      resolveJsonModule: true,
      strict: true,
      isolatedModules: true,
      baseUrl: ".",
    },
    include: ["**/*.ts"],
    exclude: ["node_modules"],
  },
  null,
  2,
);

const GITIGNORE = `*
`;

const EXAMPLE_STEP = `import { defineStep } from "@boboddy/sdk/definitions/steps";
import { z } from "zod";

export default defineStep({
  key: "evaluate-clarity",
  name: "Evaluate Clarity",
  version: 1,
  prompt: "Evaluate the clarity of the provided text on a scale of 0–10.",
  input: z.object({
    text: z.string(),
  }),
  result: z.object({
    score: z.number().min(0).max(10),
    feedback: z.string(),
  }),
  signals: [
    { key: "clarity_score", sourcePath: "score", type: "number" },
  ],
});
`;

type ScaffoldResult = {
  created: string[];
  skipped: string[];
};

export function scaffoldStepsDirectory(
  dir: string,
  sdkVersion: string,
): ScaffoldResult {
  const result: ScaffoldResult = { created: [], skipped: [] };

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const files: Array<[string, string]> = [
    ["package.json", buildPackageJson(sdkVersion)],
    ["tsconfig.json", TSCONFIG_JSON],
    [".gitignore", GITIGNORE],
    ["evaluate-clarity.ts", EXAMPLE_STEP],
  ];

  for (const [filename, content] of files) {
    const filePath = join(dir, filename);
    if (existsSync(filePath)) {
      result.skipped.push(filename);
    } else {
      writeFileSync(filePath, content, "utf-8");
      result.created.push(filename);
    }
  }

  return result;
}
