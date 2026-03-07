import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const ok = <T>(payload: T, init?: ResponseInit) =>
  NextResponse.json(payload, init);

export const badRequest = (message: string, details?: unknown) =>
  NextResponse.json({ error: message, details }, { status: 400 });

export const handleRouteError = (error: unknown) => {
  if (error instanceof ZodError) {
    return badRequest("Invalid request payload", error.flatten());
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
};

export const httpError = (message: string, status: number): Error => {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
};
