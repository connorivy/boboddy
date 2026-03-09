import { NextResponse } from "next/server";
import { handleRouteError, ok } from "@/lib/api/http";
import { upsertEnvironment } from "@/modules/environments/application/upsert-environment";
import { upsertEnvironmentRequestSchema } from "@/modules/environments/contracts/environment-contracts";

const hasValidApiKey = (request: Request): boolean => {
  const apiKey = request.headers.get("x-api-key");
  return apiKey === process.env.BOBODDY_API_KEY;
};

export async function POST(request: Request) {
  if (!hasValidApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsedBody = upsertEnvironmentRequestSchema.parse(body);
    await upsertEnvironment(
      parsedBody.environmentId,
      parsedBody.region,
      parsedBody.databaseHostUrl,
    );

    return ok({ success: true, environmentId: parsedBody.environmentId });
  } catch (error) {
    return handleRouteError(error);
  }
}
