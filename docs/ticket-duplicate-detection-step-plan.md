## Ticket Duplicate Detection Step Plan (Markdown)

### Goal
Add a new pipeline step (`ticket_duplicate_candidates`) as Step 2 that identifies duplicate tickets using semantic search, triggered with `ticketId` only.

### Scope
- Add a server action to run duplicate detection for a ticket.
- Reuse existing DB tables (`ticket_embeddings`, `ticket_duplicate_candidates`).
- Persist step execution and duplicate candidate results.
- Show step status and candidates in the ticket UI.
- Start with deterministic normalization; add optional AI summarization later.

### Non-Goals (Phase 1)
- Auto-triggering on ingestion.
- Human review workflows (promote/dismiss UI actions).
- Cross-project duplicate detection.

---

## Phase 1: Core Implementation

### 1. Contracts
- Create a duplicate-step contract file in `src/modules/step-executions/contracts/`.
- Request schema: `{ ticketId: string }`.
- Response schema: `{ ok: true, data: { stepExecution } }`.
- Result schema fields:
  - `executionId`
  - `stepName` = `ticket_duplicate_candidates`
  - `candidates`: array of `{ candidateTicketId, score, status }`

### 2. Application Action
- Create `trigger-ticket-duplicate-candidates-step.ts` in `src/modules/step-executions/application/`.
- Input: `ticketId`.
- Flow:
  - Parse input.
  - Load ticket by `ticketId`.
  - Create `StepExecutionAggregate` with `running`.
  - Generate normalized content.
  - Create or refresh embedding for this ticket.
  - Query nearest neighbors.
  - Persist candidate rows.
  - Mark execution `succeeded` with `TicketDuplicateCandidatesStepResultEntity`.
  - On error, mark execution `failed`.

### 3. Semantic Search Infra
- Add infra service in `src/modules/step-executions/infra/` with methods:
  - `buildEmbeddingContent(ticket)`
  - `createEmbedding(content)`
  - `findNearestCandidates(ticketId, embedding, limit, minScore)`
- Use vercel ai sdk for embedding and similarity search. Also assume i am using github models as my AI provider, so use appropriate model and embedding parameters.
- Deterministic normalization rules:
  - Lowercase and whitespace normalization.
  - Strip boilerplate/template text.
  - Remove volatile tokens (timestamps, IDs, line numbers, URLs where appropriate).
  - Preserve product terms and error text.

### 4. Persistence Wiring
- Update `DrizzleStepExecutionRepo`:
  - Load duplicate result from `ticket_duplicate_candidates`.
  - Save duplicate result by upserting candidate rows.
  - Remove current throw for duplicate result persistence.
- Keep candidate status default as `proposed`.

### 5. Contract Mapping Generalization
- Refactor `step-execution-aggregate-to-contract.ts` to support:
  - Description quality result mapping.
  - Duplicate candidates result mapping.
- Ensure ticket detail loading does not fail when new step result exists.

### 6. UI Integration
- Update step list in `ticket-manager.tsx`:
  - Step 1: description quality.
  - Step 2: duplicate candidates.
- Duplicate step trigger payload uses `ticketId` only.
- Update timeline card to render duplicate result summary:
  - Show top candidates and scores.
  - Show “no candidates found” state.

---

## Phase 2: Quality and Tuning

### 1. Ranking Defaults
- `topK = 5`
- `minScore = 0.82` (initial)
- Exclude self-match (`candidateTicketId !== ticketId`).

### 2. Data Hygiene
- Ensure only one active embedding per ticket (upsert on `ticket_id`).
- Store normalized content used for embedding in `ticket_embeddings.content` for auditability.

### 3. Optional Summarization (Feature Flag)
- Add summarization only for long/noisy descriptions.
- Flag example: `ENABLE_DUPLICATE_EMBED_SUMMARY`.
- Compare precision against normalization-only baseline before enabling by default.

---

## Testing Plan

### Unit Tests
- Contract validation for request/response/result.
- Normalization output stability.
- Duplicate ranking filter behavior (self-filter, threshold, topK).
- Step status transitions (`running` -> `succeeded`/`failed`).

### Integration Tests
- Trigger duplicate step for seeded tickets and assert:
  - Step execution persisted.
  - Embedding row created/updated.
  - Candidate rows inserted/upserted.
  - Ticket detail API returns duplicate result shape.

### Manual Verification
- Trigger duplicate step from UI for a known duplicate ticket.
- Confirm candidates and scores appear in timeline.
- Trigger again and verify idempotent behavior (no duplicate row explosion).

---

## Acceptance Criteria
- Duplicate step can be triggered with `ticketId` only.
- Step execution is persisted and visible in ticket detail timeline.
- Duplicate candidates are written to `ticket_duplicate_candidates`.
- Ticket detail contract supports duplicate result without schema errors.
- UI displays latest duplicate candidate results clearly.
- No regressions to description quality step behavior.

---

## Suggested Task Breakdown (Ready for Tickets)
1. Add duplicate step contracts (`ticketId` only).
2. Implement duplicate step trigger action.
3. Implement embedding + nearest-neighbor infra service.
4. Extend step execution repo for duplicate result load/save.
5. Generalize aggregate-to-contract mapper for multi-step results.
6. Add duplicate step to ticket manager timeline as step 2.
7. Add unit + integration tests for duplicate step flow.
8. Tune threshold/topK with seed data and document defaults.
