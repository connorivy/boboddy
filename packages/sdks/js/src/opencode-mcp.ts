import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);

const mcpStringMapSchema = z.record(z.string(), z.string());

export const openCodeMcpLocalConfigSchema = z
  .object({
    type: z.literal("local"),
    command: z.array(nonEmptyStringSchema).min(1),
    environment: mcpStringMapSchema.optional(),
    enabled: z.boolean().optional(),
    timeout: z.int().gt(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();

export const openCodeMcpOAuthConfigSchema = z
  .object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    scope: z.string().optional(),
    redirectUri: z.string().optional(),
  })
  .strict();

export const openCodeMcpRemoteConfigSchema = z
  .object({
    type: z.literal("remote"),
    url: z.string(),
    enabled: z.boolean().optional(),
    headers: mcpStringMapSchema.optional(),
    oauth: z.union([openCodeMcpOAuthConfigSchema, z.literal(false)]).optional(),
    timeout: z.int().gt(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();

export const openCodeMcpEnabledOverrideSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

export const openCodeMcpServerConfigSchema = z.union([
  openCodeMcpLocalConfigSchema,
  openCodeMcpRemoteConfigSchema,
  openCodeMcpEnabledOverrideSchema,
]);

export const openCodeMcpServersSchema = z.record(
  z.string(),
  openCodeMcpServerConfigSchema,
);

export type OpenCodeMcpServers = z.infer<typeof openCodeMcpServersSchema>;
