# Agent Teams and Slash Commands

This repo uses a small number of explicit workstreams instead of vague “help everywhere” prompts.
Each workstream should be run with a clear target, acceptance criteria, and validation step.

## Team Topology

### 1. Science Core
Responsibilities:
- archive ingestion
- JWST product joins
- uncertainty propagation
- orbit/retention physics
- evidence classes and provenance

Use when:
- a value is wrong
- a metric is missing provenance
- uncertainty is missing or inconsistent
- JWST product handling needs expansion

Slash command:
- `/science-hardening <target>`

### 2. Render Systems
Responsibilities:
- shared appearance state
- 2D/3D render consistency
- planet/star shader behavior
- cloud, haze, rings, magnetosphere, lighting
- render performance and cache correctness

Use when:
- visuals regress
- 2D and 3D disagree
- a class-specific planet generator needs work
- frame-time or overdraw issues appear

Slash command:
- `/render-polish <target>`

### 3. UX and Focus Rails
Responsibilities:
- navigator
- dropdowns and search
- fly-to behavior
- focus cards and summaries
- object-specific rails
- filter UX

Use when:
- interaction feels confusing or broken
- cards are too generic
- filters or controls need restructuring

Slash command:
- `/ux-focus-pass <target>`

### 4. Deep Sky and Catalogs
Responsibilities:
- nebulae
- galaxies
- pulsars
- black holes
- white dwarfs
- deep-sky hover and focus states

Use when:
- long-range scene feels empty
- object classes are missing
- deep-sky detail cards are too generic

Slash command:
- `/deep-sky-pass <target>`

### 5. Release and Ops
Responsibilities:
- README/docs
- verification scripts
- production checks
- deployment readiness
- regression gates

Use when:
- preparing release
- deployment planning
- hardening the repo for collaborators

Slash commands:
- `/release-readiness`
- `/production-burndown`

### 6. Supporter and Sustainability Ops
Responsibilities:
- supporter capture
- donor funnel instrumentation
- email automation
- donation/checkout handoff
- accounting workflow routing

Use when:
- the site needs to convert supporter interest
- donor/supporter events need automation
- sustainability ops need to be explicit in the repo

Slash commands:
- `/growth-ops <target>`
- `/supporter-ops <target>`

## Skill Mapping

These slash commands should prefer the available skills when relevant:
- `playwright`: browser smoke checks and regression screenshots
- `render-deploy`: Render deployment setup
- `vercel-deploy`: Vercel deployment setup
- `security-best-practices`: targeted security review before release
- `security-threat-model`: trust-boundary and abuse-path review
- `screenshot`: desktop-level capture if browser tooling is not enough

## How To Use The Commands

Each command should:
1. Restate the exact target.
2. Identify touched files before editing.
3. Make the smallest coherent set of changes.
4. End with validation.
5. Record remaining gaps rather than pretending completion.
