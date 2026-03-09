import { z } from "zod";
import {
  ENVIRONMENT_AREAS,
  type EnvironmentArea,
} from "@/modules/environments/domain/environment-aggregate";

const EPHEMERAL_PREFIX_PATTERN = /^ephemeral-/i;
const ENVIRONMENT_ID_PATTERN = /^(adm|mem|ps|cv|op)-?(\d+)$/i;
const INPUT_ENVIRONMENT_ID_PATTERN =
  /^(?:ephemeral-)?(adm|mem|ps|cv|op)-?(\d+)$/i;

export const environmentIdSchema = z
  .string()
  .regex(
    INPUT_ENVIRONMENT_ID_PATTERN,
    "Environment id must match adm|mem|ps plus a number (for example adm-200 or adm200)",
  );

export const parseEnvironmentId = (environmentId: string) => {
  const withoutEphemeralPrefix = environmentId.replace(
    EPHEMERAL_PREFIX_PATTERN,
    "",
  );
  const parsed = environmentIdSchema.parse(withoutEphemeralPrefix);
  const [, area, number] = ENVIRONMENT_ID_PATTERN.exec(parsed)!;
  const normalizedArea = area.toLowerCase() as EnvironmentArea;

  return {
    normalizedEnvironmentId: `${normalizedArea}-${number}`,
    area: normalizedArea,
    number: Number(number),
  };
};

export const environmentResponseSchema = z.object({
  environmentId: z.string(),
  area: z.enum(ENVIRONMENT_AREAS),
  number: z.number().int().nonnegative(),
  region: z.string().min(1),
  databaseHostUrl: z.url(),
  numConsecutiveFailures: z.number().int().nonnegative(),
  lastChecked: z.iso.datetime(),
});

export const environmentsResponseSchema = z.array(environmentResponseSchema);
export const ticketGitEnvironmentResponseSchema = z.object({
  id: z.number().int().positive(),
  ticketId: z.string().min(1),
  baseEnvironmentId: z.string().min(1),
  devBranch: z.string().min(1),
});
export const createEnvironmentRequestSchema = z.object({
  ticketId: z.string().min(1),
  baseEnvironmentId: environmentIdSchema.optional(),
  devBranch: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^\s~^:?*\[\\]+$/u, "Dev branch contains invalid characters")
    .optional(),
});
export const assignEnvironmentRequestSchema = z.object({
  ticketId: z.string().min(1),
  ticketGitEnvironmentId: z.number().int().positive(),
});

export const upsertEnvironmentRequestSchema = z.object({
  environmentId: environmentIdSchema,
  region: z.string().trim().min(1),
  databaseHostUrl: z.string(),
});

export type EnvironmentResponse = z.infer<typeof environmentResponseSchema>;
export type TicketGitEnvironmentResponse = z.infer<
  typeof ticketGitEnvironmentResponseSchema
>;
export type CreateEnvironmentRequest = z.infer<
  typeof createEnvironmentRequestSchema
>;
export type AssignEnvironmentRequest = z.infer<
  typeof assignEnvironmentRequestSchema
>;
export type UpsertEnvironmentRequest = z.infer<
  typeof upsertEnvironmentRequestSchema
>;
