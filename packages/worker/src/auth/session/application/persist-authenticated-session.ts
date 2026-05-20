import { fetchAuthenticatedSession } from "./fetch-authenticated-session";
import { saveAuthProfile } from "../infra/auth-storage";

export async function persistAuthenticatedSession({
  baseUrl,
  accessToken,
}: {
  baseUrl: string;
  accessToken: string;
}) {
  const session = await fetchAuthenticatedSession({
    baseUrl,
    accessToken,
  });

  saveAuthProfile(baseUrl, {
    accessToken,
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  return session;
}
