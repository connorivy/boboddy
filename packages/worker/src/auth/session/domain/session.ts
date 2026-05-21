export interface AuthProfile {
  accessToken: string;
  userId?: string;
  email?: string;
  name?: string;
}

export interface AuthFile {
  profiles: Record<string, AuthProfile>;
}
