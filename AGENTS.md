# Cosmoplot Agent Guide

## Mission

Bring Cosmoplot to production quality without regressing scientific honesty.
The app should become a reliable scientific exploration workspace, not just a visually impressive demo.

## Non-Negotiables

- Do not present inferred visuals as observations.
- Keep observed, derived, inferred, proxy, and artistic outputs separate.
- Do not weaken provenance to make the UI look cleaner.
- Do not bypass the science model to patch visuals in one-off ways.
- Do not claim JWST resolves exoplanet surfaces. It does not.

## Priority Order

1. Science correctness
2. Provenance and uncertainty
3. Interaction reliability
4. Performance
5. Visual polish
6. Deployment and release hygiene

## Critical Files

- `src/components/universe/universe-stage.tsx`
- `src/components/ui/planet-globe.tsx`
- `src/lib/science/official/planet-science.ts`
- `src/lib/science/catalog/build-universe.ts`
- `src/lib/science/physics.ts`
- `src/lib/science/local/legacy-analysis.ts`
- `src/lib/science/types.ts`

## Team Model

### Team 1: Science Core
Owns archive ingestion, JWST joins, uncertainty propagation, orbit physics, and retention audits.

### Team 2: Render Systems
Owns 2D/3D shared appearance state, planet/star shaders, cloud/magnetosphere/ring logic, and performance budgets.

### Team 3: UX and Focus Rails
Owns navigator behavior, summaries, cards, filters, fly-to behavior, and object-specific detail surfaces.

### Team 4: Deep Sky and Catalogs
Owns nebulae, galaxies, pulsars, black holes, white dwarfs, and catalog layering.

### Team 5: Release and Ops
Owns build hygiene, verification scripts, deployment, regression checks, and documentation.

### Team 6: Supporter and Sustainability Ops
Owns supporter capture, workflow fan-out, funnel instrumentation, donation surfaces, and the sustainability event architecture around the product.

## Working Rules

- Every material change must end with `lint` and `build` passing.
- Browser-facing changes should get at least one smoke validation pass.
- New scientific claims should expose source or equation basis.
- New visuals should be calibrated against known references where possible.
- If the repo is dirty, do not overwrite unrelated work. Work around it and document what you changed.

## Definition of Better

A change is only better if it improves at least one of these without degrading the others:
- scientific fidelity
- provenance clarity
- interaction reliability
- visual readability
- runtime performance

## Slash Commands

See [docs/AGENT_TEAMS.md](./docs/AGENT_TEAMS.md) and `.claude/commands/`.
