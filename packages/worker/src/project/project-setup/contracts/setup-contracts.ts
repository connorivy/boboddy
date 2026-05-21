import { z } from "zod";

export const repoAnalysisSchema = z.object({
  kind: z.union([z.literal("web_app"), z.literal("unknown")]),
  framework: z.union([
    z.literal("nextjs"),
    z.literal("vite"),
    z.literal("react"),
    z.null(),
  ]),
  hasPlaywright: z.boolean(),
  confidence: z.union([z.literal("high"), z.literal("low")]),
});

export const setupResultSchema = z.object({
  projectId: z.string(),
});

export type RepoAnalysisContract = z.infer<typeof repoAnalysisSchema>;
export type SetupResultContract = z.infer<typeof setupResultSchema>;
