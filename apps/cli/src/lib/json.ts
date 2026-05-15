export type AnyJsonPrimitive = string | number | boolean | null;
export type AnyJsonValue = AnyJsonPrimitive | AnyJsonObject | AnyJsonArray;
export interface AnyJsonObject {
  [key: string]: AnyJsonValue;
}
export type AnyJsonArray = AnyJsonValue[];
