import { z } from "zod";

export const authProfileSchema = z.object({
  accessToken: z.string(),
  userId: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
});

export const authFileSchema = z.object({
  profiles: z.record(z.string(), authProfileSchema),
});

export type AuthProfileContract = z.infer<typeof authProfileSchema>;
export type AuthFileContract = z.infer<typeof authFileSchema>;
