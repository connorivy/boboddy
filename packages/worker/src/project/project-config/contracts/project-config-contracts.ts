import { z } from "zod";

export const projectConfigSchema = z.object({
  projectId: z.string(),
});

export type ProjectConfigContract = z.infer<typeof projectConfigSchema>;
