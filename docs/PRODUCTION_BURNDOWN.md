# Cosmoplot Production Burn-Down

This document defines what “production-ready” means for Cosmoplot and the shortest path to get there.

## Release Goal

Ship a science-first exploration app that is:
- stable under normal interactive use
- honest about evidence classes
- operationally deployable
- defensible as a scientific workspace

## Exit Criteria

A production release is not ready until all of the following are true.

### A. Science Gates
- JWST ingestion handles public curated spectra and public product-level extraction robustly.
- Unsupported or private JWST products fail clearly, not silently.
- Uncertainty propagation is available in all major user-facing science surfaces.
- Legacy atmospheric-retention language is fully audited and no longer overclaims certainty.
- Every top-level claim surface exposes source or equation basis.

### B. Interaction Gates
- No broken fly-to, follow-lock, dropdown, or selection flows.
- Stars, planets, and deep-sky objects all produce object-specific focus rails.
- Filters are understandable and uncertainty-aware.
- Intro sequence does not trap or confuse the user.

### C. Render Gates
- 2D and 3D use one shared appearance model.
- Class-specific planets are visually distinct and scientifically plausible.
- Magnetosphere, rings, day/night, and tidal-lock behavior are consistent.
- Performance is acceptable on typical laptop hardware at production settings.

### D. Ops Gates
- README is project-specific.
- Repo-local AGENTS instructions exist.
- Verification commands are documented and pass.
- Deployment path is documented.
- Known blockers are written down, not hidden.

## Burn-Down Workstreams

### Stream 1: Science Hardening
Tasks:
- finish JWST product extraction path
- expand uncertainty-aware UI surfaces
- complete retention-language audit
- attach claim-level provenance to more long-form text

Definition of done:
- a selected target shows observed, derived, inferred, propagated, and provenance information without ambiguity

### Stream 2: Visual Fidelity
Tasks:
- harden class-specific planet generators
- tighten gas giant clouds and contrast
- finish magnetosphere geometry
- keep stars stable while improving morphology by class

Definition of done:
- Solar System calibration anchors look plausible without direct-image cheating except where intentionally allowed

### Stream 3: Interaction Reliability
Tasks:
- eliminate selection edge cases
- finish object-specific lower cards
- ensure free cam / lock follow / fly-to do not fight each other
- verify dropdown navigation for all object classes

Definition of done:
- no high-frequency interaction bug reproduces in browser smoke tests

### Stream 4: Release Engineering
Tasks:
- add and maintain strict verification commands
- keep build/lint/typecheck green
- document deploy path
- track remaining blockers explicitly

Definition of done:
- a new contributor can clone, run, verify, and understand the app without chat history

### Stream 5: Supporter and Donation Operations
Tasks:
- supporter capture that actually writes structured records
- webhook/email fan-out for inbound support
- supporter funnel instrumentation and event taxonomy
- donation and accounting integration plan that stays downstream of product runtime

Definition of done:
- the site can capture, route, and follow up on supporter interest without manual copy-paste

## Recommended Burn Order

1. Science Hardening
2. Interaction Reliability
3. Visual Fidelity
4. Release Engineering
5. Deployment

## Mandatory Checks Per Pass

```bash
npm run lint -- --max-warnings=0
npm run typecheck
npm run build
```

Browser changes should also get a smoke pass.

## Current Known Gaps

- private/authenticated JWST product coverage still depends on valid MAST credentials
- some long-form local analysis still carries legacy interpretation shape even after wording scrubs
- object-specific lower cards are improved but still not equally rich across every object class
- visual calibration remains strongest on a subset of anchor worlds
