import { z } from "zod";

export const projectOpencodeRuntimeMetadataSchema = z.object({
  definitionKind: z.union([z.literal("command"), z.literal("service")]),
  definitionName: z.string(),
  definitionDescription: z.string(),
  cwd: z.string().nullable(),
});

export type ProjectOpencodeRuntimeMetadataContract = z.infer<
  typeof projectOpencodeRuntimeMetadataSchema
>;
