# Business Oriented Bug Optimization & Diagnostic Deployment sYstem

Next.js app for ingesting, searching, and analyzing a large ticket backlog.

## Stack

- Node.js + Next.js App Router
- Zod contracts for API validation
- Drizzle ORM + PostgreSQL
- Material UI components
- Chart.js dashboards
- Vitest + Testcontainers for endpoint tests

## Getting Started

1. Copy env file:

```bash
cp .env.example .env
```

2. Start PostgreSQL with Docker Compose:

```bash
docker compose up -d db
```

This project uses `localhost:6429` for local Postgres by default.

3. Push schema:

```bash
pnpm run db:push
```

4. Run app:

```bash
pnpm run dev
```

## Scripts

- `pnpm run dev` - starts local Postgres (`docker compose up -d db`) and runs Next.js
- `pnpm run build` - production build
- `pnpm run start` - start built app
- `pnpm run lint` - lint project
- `pnpm run db:push` - apply Drizzle schema to DB
- `pnpm run db:generate` - generate SQL migrations
- `pnpm run test` - run integration tests