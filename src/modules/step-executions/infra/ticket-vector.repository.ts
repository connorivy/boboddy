import { and, desc, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ticketEmbeddings } from "@/lib/db/schema";

export type NearestTicketNeighbor = {
  candidateTicketId: string;
  score: number;
};

type SaveTicketEmbeddingInput = {
  ticketId: string;
  model: string;
  content: string;
  embedding: number[];
};

type FindNearestNeighborsInput = {
  ticketId: string;
  embedding: number[];
  limit: number;
  minScore: number;
};

export class DrizzleTicketVectorRepo {
  async saveTicketEmbedding(input: SaveTicketEmbeddingInput): Promise<void> {
    const db = getDb();
    const now = new Date();

    await db
      .insert(ticketEmbeddings)
      .values({
        ticketId: input.ticketId,
        model: input.model,
        content: input.content,
        embedding: input.embedding,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: ticketEmbeddings.ticketId,
        set: {
          model: input.model,
          content: input.content,
          embedding: input.embedding,
          updatedAt: now,
        },
      });
  }

  async findNearestNeighbors(
    input: FindNearestNeighborsInput,
  ): Promise<NearestTicketNeighbor[]> {
    if (input.limit <= 0) {
      return [];
    }

    const db = getDb();
    const vectorLiteral = `[${input.embedding.join(",")}]`;
    const similarity = sql<number>`1 - (${ticketEmbeddings.embedding} <=> ${vectorLiteral}::vector)`;

    const rows = await db
      .select({
        candidateTicketId: ticketEmbeddings.ticketId,
        score: similarity,
      })
      .from(ticketEmbeddings)
      .where(
        and(
          ne(ticketEmbeddings.ticketId, input.ticketId),
          sql`${similarity} >= ${input.minScore}`,
        ),
      )
      .orderBy(desc(similarity))
      .limit(input.limit);

    return rows.map((row) => ({
      candidateTicketId: row.candidateTicketId,
      score: Math.max(0, Math.min(1, Number(Number(row.score).toFixed(4)))),
    }));
  }
}
