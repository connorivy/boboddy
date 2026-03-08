import { embed } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const MAX_CONTENT_LENGTH = 8_000;

const TEMPLATE_HEADER_PATTERN =
  /^(steps to reproduce|expected behavior|observed behavior|actual behavior|environment|additional context|impact|workaround|repro steps)\s*:?\s*$/i;

const VOLATILE_LINE_PATTERN =
  /\b(?:\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:?\d{2})?)?|[a-f0-9]{7,40}|cv-\d+|line\s+\d+)\b/gi;

const URL_PATTERN = /\bhttps?:\/\/\S+\b/gi;

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const githubModels = createOpenAICompatible({
  name: "github-models",
  baseURL: "https://models.github.ai/inference",
  apiKey: process.env.GITHUB_MODELS_API_KEY,
});

const sanitizeLine = (line: string): string => {
  let result = line.toLowerCase();
  result = result.replace(URL_PATTERN, " ");
  result = result.replace(VOLATILE_LINE_PATTERN, " ");
  result = normalizeWhitespace(result);

  if (!result || TEMPLATE_HEADER_PATTERN.test(result)) {
    return "";
  }

  if (result === "n/a" || result === "none" || result === "-") {
    return "";
  }

  return result;
};

export class TicketDuplicateSemanticSearchService {
  readonly model = EMBEDDING_MODEL;

  buildEmbeddingContent(ticket: TicketAggregate): string {
    const normalizedTitle = sanitizeLine(ticket.title);
    const normalizedDescription = ticket.description
      .split("\n")
      .map((line) => sanitizeLine(line))
      .filter((line) => line.length > 0)
      .join(" ");

    const content = normalizeWhitespace(
      `title ${normalizedTitle} description ${normalizedDescription}`,
    );

    return content.slice(0, MAX_CONTENT_LENGTH);
  }

  async createEmbedding(content: string): Promise<number[]> {
    if (!process.env.GITHUB_MODELS_API_KEY) {
      throw new Error("GITHUB_MODELS_API_KEY is not set");
    }

    const { embedding } = await embed({
      model: githubModels.embeddingModel(EMBEDDING_MODEL),
      value: content,
    });

    return embedding;
  }
}
