import { z } from "zod";

export type AnyJsonPrimitive = string | number | boolean | null;
export type AnyJsonValue = AnyJsonPrimitive | AnyJsonObject | AnyJsonArray;
export interface AnyJsonObject {
  [key: string]: AnyJsonValue;
}
export type AnyJsonArray = AnyJsonValue[];

export const anyJsonValueSchema: z.ZodType<AnyJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    anyJsonObjectSchema,
    anyJsonArraySchema,
  ]),
);

export const anyJsonObjectSchema: z.ZodType<AnyJsonObject> = z.lazy(() =>
  z.record(z.string(), anyJsonValueSchema),
);

export const anyJsonArraySchema: z.ZodType<AnyJsonArray> = z.lazy(() =>
  z.array(anyJsonValueSchema),
);
