# Cosmoplot

Cosmoplot is a science-first universe explorer built on official astronomy data.
It combines Sun-centered 3D navigation, exoplanet/system/deep-sky exploration, JWST evidence joins, uncertainty-aware summaries, and science-informed visual hypotheses in one React/Next.js application.

## Current Focus

The project is in active hardening on the `codex/science-hardening` branch.
The highest-value workstreams are:
- broader JWST product extraction
- stronger uncertainty propagation across the whole UI
- tighter provenance and evidence labeling
- class-specific planet rendering that stays downstream of the science model
- production-grade release, validation, and deployment readiness

## Project Structure

- `src/app/`: Next.js app router pages and API routes
- `src/components/universe/`: 3D stage and orchestration logic
- `src/components/ui/`: shared planet/star/deep-sky visual components
- `src/lib/science/`: coordinates, physics, archive ingestion, local analysis merge, types
- `src/lib/cache/`: filesystem-backed caches for internet-fed science data
- `scripts/`: helpers for JWST FITS extraction and other science ingestion work
- `docs/`: production burn-down and agent-team operating docs

## Local Development

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run the production build locally:

```bash
npm run build
npm run start
```

If port `3000` is occupied on your machine, use:

```bash
npm run start:3001
```

## Verification

Strict lint:

```bash
npm run lint -- --max-warnings=0
```

Typecheck:

```bash
npm run typecheck
```

Production verification:

```bash
npm run verify
```

## Operational Docs

- [AGENTS.md](./AGENTS.md): repo-local working rules, teams, and priorities
- [docs/AGENT_TEAMS.md](./docs/AGENT_TEAMS.md): team topology and slash-command map
- [docs/PRODUCTION_BURNDOWN.md](./docs/PRODUCTION_BURNDOWN.md): production exit criteria and burn-down plan
- [docs/BUSINESS_AUTOMATION.md](./docs/BUSINESS_AUTOMATION.md): lead funnel, workflow, email, finance, and analytics automation architecture

## Product Principles

- Science engine is deterministic
- Rendering is downstream of a typed appearance model
- Observed, derived, inferred, proxy, and artistic values stay distinct
- Provenance should be visible near every claim
- Visuals are evidence-constrained interpretation, not observation

## Deployment

The app is suitable for Vercel or Render once the production burn-down gates in [docs/PRODUCTION_BURNDOWN.md](./docs/PRODUCTION_BURNDOWN.md) are closed.
