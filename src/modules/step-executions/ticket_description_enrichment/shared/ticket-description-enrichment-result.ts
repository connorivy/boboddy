import { z } from "zod";

export const ticketDescriptionEnrichmentDatabaseFindingSchema = z.object({
  entityType: z.string().trim().min(1),
  relationToTicket: z.string().trim().min(1),
  identifiers: z.array(z.string().trim().min(1)).default([]),
  records: z.array(z.record(z.string(), z.unknown())).default([]),
  comparisonNotes: z.array(z.string().trim().min(1)).default([]),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export const ticketDescriptionEnrichmentLogFindingSchema = z.object({
  source: z
    .enum([
      "frontend_route",
      "application_log",
      "datadog_log",
      "trace",
      "unknown",
    ])
    .default("unknown"),
  routeOrCodePath: z.string().trim().min(1).nullable().default(null),
  queryOrFilter: z.string().trim().min(1).nullable().default(null),
  timestamp: z.string().trim().min(1).nullable().default(null),
  message: z.string().trim().min(1),
  identifiers: z.array(z.string().trim().min(1)).default([]),
  evidence: z.array(z.string().trim().min(1)).default([]),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export const ticketDescriptionEnrichmentDatadogSessionEventSchema = z.object({
  timestamp: z.string().trim().min(1).nullable().default(null),
  type: z.string().trim().min(1),
  description: z.string().trim().min(1),
  route: z.string().trim().min(1).nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const ticketDescriptionEnrichmentDatadogSessionFindingSchema = z.object({
  userIdentifier: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).nullable().default(null),
  timeWindow: z.string().trim().min(1),
  events: z.array(ticketDescriptionEnrichmentDatadogSessionEventSchema).default(
    [],
  ),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export const ticketDescriptionEnrichmentCodeUnitSchema = z.object({
  kind: z
    .enum([
      "api_route",
      "frontend_route",
      "method",
      "class",
      "frontend_component",
      "function",
      "module",
      "unknown",
    ])
    .default("unknown"),
  name: z.string().trim().min(1),
  filePath: z.string().trim().min(1).nullable().default(null),
  symbol: z.string().trim().min(1).nullable().default(null),
  relevance: z.string().trim().min(1),
  evidence: z.array(z.string().trim().min(1)).default([]),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export const ticketDescriptionEnrichmentEvidenceFieldsSchema = z.object({
  whatHappened: z.string().trim().min(1).default("No concrete findings yet."),
  datadogQueryTerms: z.array(z.string().trim().min(1)).default([]),
  datadogTimeRange: z.string().trim().min(1).nullable().default(null),
  keyIdentifiers: z.array(z.string().trim().min(1)).default([]),
  exactEventTimes: z.array(z.string().trim().min(1)).default([]),
  codeUnitsInvolved: z
    .array(ticketDescriptionEnrichmentCodeUnitSchema)
    .default([]),
  databaseFindings: z
    .array(ticketDescriptionEnrichmentDatabaseFindingSchema)
    .default([]),
  logFindings: z.array(ticketDescriptionEnrichmentLogFindingSchema).default([]),
  datadogSessionFindings: z
    .array(ticketDescriptionEnrichmentDatadogSessionFindingSchema)
    .default([]),
  investigationGaps: z.array(z.string().trim().min(1)).default([]),
  recommendedNextQueries: z.array(z.string().trim().min(1)).default([]),
});

export type TicketDescriptionEnrichmentDatabaseFinding = z.infer<
  typeof ticketDescriptionEnrichmentDatabaseFindingSchema
>;

export type TicketDescriptionEnrichmentLogFinding = z.infer<
  typeof ticketDescriptionEnrichmentLogFindingSchema
>;

export type TicketDescriptionEnrichmentDatadogSessionEvent = z.infer<
  typeof ticketDescriptionEnrichmentDatadogSessionEventSchema
>;

export type TicketDescriptionEnrichmentDatadogSessionFinding = z.infer<
  typeof ticketDescriptionEnrichmentDatadogSessionFindingSchema
>;

export type TicketDescriptionEnrichmentCodeUnit = z.infer<
  typeof ticketDescriptionEnrichmentCodeUnitSchema
>;

export type TicketDescriptionEnrichmentEvidenceFields = z.infer<
  typeof ticketDescriptionEnrichmentEvidenceFieldsSchema
>;
