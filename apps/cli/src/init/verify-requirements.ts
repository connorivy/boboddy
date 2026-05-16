import { access } from "node:fs/promises";
import path from "node:path";
import { createBoboddyClient } from "@boboddy/sdk";
import { loadAuthenticatedSession } from "../auth/session";
import { ConfigurationError } from "../lib/errors";

export async function verifyRequirements(input: { baseUrl: string }): Promise<{
  headers: { Authorization: string };
  client: ReturnType<typeof createBoboddyClient>;
}> {
  let session: Awaited<ReturnType<typeof loadAuthenticatedSession>>;
  try {
    session = await loadAuthenticatedSession(input.baseUrl);
  } catch {
    session = null;
  }
  if (!session) {
    throw new ConfigurationError(
      `Not signed in to ${input.baseUrl}. Run 'boboddy auth login' first.`,
    );
  }

  try {
    await access(path.join(process.cwd(), ".git"));
  } catch {
    throw new ConfigurationError(
      "Not in the root of a git repository. Run 'boboddy init' from your project's root directory.",
    );
  }

  return {
    headers: { Authorization: `Bearer ${session.profile.accessToken}` },
    client: createBoboddyClient(input.baseUrl),
  };
}
