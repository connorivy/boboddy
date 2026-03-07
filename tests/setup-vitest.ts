import { vi } from "vitest";

vi.mock("server-only", () => ({}));

process.env.JIRA_HOST ??= "http://localhost";
process.env.JIRA_EMAIL ??= "test@example.com";
process.env.JIRA_API_TOKEN ??= "test-token";
process.env.POSTGRES_MCP_CONNECTION_STRING ??=
  "postgresql://dummy_user:dummy_password@dummy-host:5432/dummy_db";
