import { test } from "bun:test";

export const concurrentTest =
  ("concurrent" in test &&
  typeof (test as typeof test & { concurrent?: typeof test }).concurrent ===
    "function"
    ? (test as typeof test & { concurrent: typeof test }).concurrent
    : test);
