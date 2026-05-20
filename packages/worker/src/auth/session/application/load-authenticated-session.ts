import { fetchAuthenticatedSession } from "./fetch-authenticated-session";
import { loadAuthProfile } from "../infra/auth-storage";

export async function loadAuthenticatedSession(baseUrl: string) {
  const profile = loadAuthProfile(baseUrl);
  if (!profile) {
    return null;
  }

  const session = await fetchAuthenticatedSession({
    baseUrl,
    accessToken: profile.accessToken,
  });

  return {
    profile,
    session,
  };
}
