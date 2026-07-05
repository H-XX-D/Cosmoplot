Original prompt: refactor and isolate the rendering work into a new /Users/hendrixx./Cosmoplot app, rewrite the UX/UI as a modern React/Node/TypeScript website, keep what works, replace what doesn't, pull official-source data on demand with caching, and target photorealistic renderings.

2026-03-06
- Scaffolded a fresh Next.js TypeScript/Tailwind app in /Users/hendrixx./Cosmoplot.
- Chosen architecture: Next.js app router for React UI + Node route handlers for official-source ingestion/caching.
- Next work: replace starter UI, install rendering/data dependencies, and port a first isolated universe renderer.
2026-03-06
- Added the first live NASA Exoplanet Archive fetcher and filesystem cache in the new app.
- Added RA/Dec/distance normalization and a grouped universe snapshot model for the renderer to consume.
- Replaced the starter landing page with a more atmospheric shell: fixed nebula background, center-emission sky treatment, stronger typography, and science workflow framing around the renderer.
- Kept the new renderer data-first: the stage is still visually simple, but it is now downstream of normalized science objects rather than static page data.
- Added a stronger Coriolis/eddy pass to the procedural planet preview in src/components/ui/planet-globe.tsx.
- Banded worlds now get explicit jet filaments layered over the belts, plus stronger vortical drift tied to hemisphere and spin.
- Cloud-bearing worlds now get spiral storm traces/fronts so atmospheric motion reads as circulation instead of static blobs.
- Validation after this pass: npm run lint ✅, npm run build ✅. Browser artifact target: output/playwright/science-deck-eddies.png.
- Refactored the procedural planet surface into a shared renderer so the 2D dossier globe and the active-system 3D planets use the same science-driven appearance logic.
- Active-system planets now use animated canvas-driven textures instead of flat emissive color spheres.
- Selection flow still defaults to the first valid planet in the chosen system through memo fallback and explicit system-pick handlers.
- Validation after this pass: npm run lint ✅, npm run build ✅. Browser artifact target: output/playwright/science-deck-shared-surface.png.
- Replaced the selected host star's flat material with an animated shader-driven photosphere/corona treatment.
- Added explicit planet double-click fly-to in the active system view so planet selection can drive camera focus instead of only card state.
- Replaced the simple planet atmosphere shell with a shader shell, moving the 3D pipeline toward a shader-based material stack while keeping the shared science-driven surface map underneath.
- Validation after this pass: npm run lint ✅, npm run build ✅. Browser artifact target: output/playwright/science-deck-star-shader-pass.png.
- Added Sun + the 8 solar-system planets as a first-class system in the universe snapshot and set the initial selection to Sun/Earth.
- Single-click selection on stars and planets now waits briefly so a double-click can promote to fly-to without firing the single-click action first.
- Shifted the render direction toward science-informed art direction: more vivid regime-based palettes and stronger day/night contrast.
- Boosted selected-star luminosity with brighter in-scene emission and explicit triangular starburst rays.
- Slowed active-system orbit animation to 2.6 simulated days per second so the scene reads more like a navigable system.
- Validation after this pass: npm run lint ✅, npm run build ✅.

2026-03-06
- Finished the shared reference-texture path so Earth and archetype-backed worlds can feed both the dossier globe and the active-system 3D renderer from the same materialized source.
- Rebalanced gas-giant chemistry for Jupiter/Saturn/Uranus/Neptune and added solar-system-specific appearance overrides so band contrast and volume stop reading as generic palette fills.
- Moved the synopsis into the top of the right-side visual panel, removed the visible Sun disk from that 2D viewer, and changed follow-lock so manual zoom is preserved while the camera tracks the planet.
- Validation after this pass: npm run lint ✅, npm run build ✅.
- Locked the current star pass to shader-only work: strengthened selected-star internal dodge/burn structure (hotter white-yellow core, burned limb, warmer dodge veins, corona ray field) and switched non-selected catalog stars to a harder internal dodge treatment.
- Kept the 2D planet pane isolated from this pass after reverting the accidental flat-strip/materialized reference regression.
- Fixed the 2D analog-disc motion bug so it drifts one direction instead of oscillating back and forth.
- Validation after this pass: npm run lint ✅, npm run build ✅, Playwright page snapshot ✅, console: 0 errors / 1 warning.
- Replaced the old rocky-world blob painter with a cached terrain generator inspired by the layer workflow from Astrographer's satellite-texture tutorial: heightfield first, then bedrock, sediment, vegetation, ice, and restrained relief shading.
- Replaced the old gas-planet paint-first approach with a cached banded-swirl generator: layered belt fields, storm masks, turbulence, haze, and then only a light animated overlay for motion.
- Reduced the generic artistic overlays on synthetic planets so the new generated textures dominate instead of being buried under random patch noise.
- Validation after this pass: npm run lint ✅, npm run build ✅, Playwright viewport screenshot ✅, console: 0 errors / 1 warning.
- Expanded the official NASA Exoplanet Archive pull so the main universe snapshot now carries supplemental physical/stellar fields: density, insolation, eccentricity, inclination, transit depth/duration, stellar luminosity/age/metallicity/log g, host photometry, and archive-side uncertainty columns.
- Added a selected-planet internet enrichment route at src/app/api/science/planet/route.ts backed by NASA Exoplanet Archive + STScI exo.MAST, cached on disk, and returning a deeper per-planet science bundle instead of relying on the old local science registry.
- The new bundle now includes radiation context, a ported magnetosphere proxy layer (magnetic factor, stellar-wind stress, corrected binding ratio, surface field, magnetopause, protection class), host photometry, uncertainty blocks, official references, and exo.MAST-linked spectral-file metadata.
- Wired the selected-planet enrichment into the UI: synopsis, observed cards, derived cards, uncertainty cards, chart stack, provenance, and observation-planning text now consume the deeper bundle when it resolves. Added a 2D magnetic-field-line toggle in the visual pane, with bow-shock / tail stretching driven by radiation pressure.
- Validation after this pass: npm run lint ✅, npm run build ✅, direct API probe for /api/science/planet?name=K2-18%20b ✅ returning flux + magnetosphere + photometry + official sources.

2026-03-06
- Joined product-level JWST evidence into the selected-planet bundle: exo.MAST curated spectra + official MAST JWST observations/products now compile cleanly in src/lib/science/official/planet-science.ts.
- Wired atmosphere evidence downstream into the selected-planet UI and render path in src/components/universe/universe-stage.tsx: synopsis, derived metrics, planning text, chart rows, and analysis now consume molecule tags, wavelength coverage, cloud interpretation, and JWST inventory counts.
- The selected-planet visual model now prefers atmosphere-derived chemistry tags and cloud-cover evidence over class-only priors; generic gas/ice/sub-Neptune chemistry weighting was strengthened in src/components/ui/planet-globe.tsx.
- Validation after this pass: npm run lint ✅, npm run build ✅. Next validation target: live API/browser check for WASP-39 b or K2-18 b.

2026-03-06
- Hardened NASA archive TAP input handling in src/lib/science/official/exoplanet-archive.ts by normalizing and allowlisting search/name input before building the query string. TAP still requires textual SQL/ADQL, so the hardening path is input validation plus literal escaping rather than true parameter binding.
- Consolidated duplicated helper functions into src/lib/utils.ts: clamp, lerp, hsla, and measurementBounds. Updated universe-stage.tsx, planet-globe.tsx, build-universe.ts, and planet-science.ts to consume the shared helpers.
- Verified the reported missing-asset issue is stale for the currently referenced files under public/assets/reference and public/assets/solar-analogs.
- Validation after this pass: npm run lint ✅, npm run build ✅.
2026-03-07
- Added a server-side legacy analysis loader in src/lib/science/local/legacy-analysis.ts that reads /Users/hendrixx./Desktop/EXOPLANET_ANALYSES/site/cosmoplot/science_registry.js directly, caches it by mtime, and projects typed planet/system summaries into the rewrite.
- Merged the legacy bundle into src/lib/science/catalog/build-universe.ts so the wide-field snapshot now carries localAnalysis summaries per system and planet, fills some missing stellar/planetary fields from the old registry, and flags interesting systems without overriding official archive values when they exist.
- Merged the legacy bundle into src/lib/science/official/planet-science.ts so the selected-planet route now returns localAnalysis narratives, habitability notes, molecule tags, magnetosphere/radiation fallbacks, and report-file metadata alongside the official NASA/exo.MAST/MAST bundle.
- Added narrative fallback to /Users/hendrixx./Desktop/jwst_exoplanets/verbose_analyses when a target exists in the registry but not in an EXOPLANET_ANALYSES system folder. Verified live route returns long local narratives for K2-18 b, TRAPPIST-1 e, WASP-39 b, and Earth.
- Updated src/components/universe/universe-stage.tsx to surface the merged local analysis in hover tooltips, selection status, metric cards, synopsis text, and the under-map full analysis panel. When a selected planet has a local narrative, the analysis panel now uses it instead of the generated placeholder block.
- Re-tuned active selected-system lighting so the host-star light distance scales against the outer orbit span instead of using a fixed short range. This brings the new stage closer to the old site's host-lighting behavior.
- Science-language correction: local-analysis text is passed through a minimal wording scrub so legacy "binding energy" framework labels are no longer presented verbatim as if they were direct measured quantities. A full escape-physics audit is still pending.
- Validation after this pass: npm run lint ✅, npm run build ✅, /api/science/planet returns localAnalysis reports+narrative ✅, interesting systems now show up in /api/science/universe ✅, live route reopened at http://127.0.0.1:3000/#science-deck.
2026-03-09
- Added first-pass numerical spectrum support to the selected-planet bundle in src/lib/science/official/planet-science.ts. Curated exo.MAST transmission files now materialize into numeric series arrays, and the server attempts product-level MAST spectral DB retrieval for supported JWST filenames when public numeric payloads are available.
- Extended the selected-planet contract in src/lib/science/types.ts with numeric spectrum series and propagated interval types. The selected bundle now returns `spectrum.numericSeries` plus a `propagation` block.
- Added deterministic Monte Carlo propagation (1200 samples, seeded by planet name) for density, surface gravity, luminosity, incident flux, scale height, and one-scale-height signal amplitude. The sampler prefers archive/exo.MAST uncertainties and only falls back to small floor sigmas when required.
- Updated the UI in src/components/universe/universe-stage.tsx so the JWST coverage card reports parsed numeric spectrum series and the uncertainty panel reports Monte Carlo-derived density/gravity and flux/scale-height intervals.
- Updated the landing copy in src/app/page.tsx so uncertainty propagation is no longer described as entirely future work.
- Validation after this pass: npm run lint ✅, npm run build ✅, live route probe for WASP-39 b ✅ (`numericSeries=1`, `propagation.sampleCount=1200`), live route probe for K2-18 b ✅, browser snapshot/screenshot ✅ on the production server.
- Remaining gap in this area: public curated spectra now parse numerically, but many JWST product filenames in the current inventory are still unsupported/private from the public spectral DB path, so broader X1DINTS/S3D coverage still needs either additional public routes or authenticated/product-specific download handling.
2026-03-09
- Expanded deep-sky kinds in src/components/universe/universe-stage.tsx to include galaxies and pulsars. Added Andromeda, Triangulum, the Large/Small Magellanic Clouds, Vela Pulsar, Geminga, and PSR B1257+12 with Sun-centered coordinates, hover/fly-to behavior, and persistent labels for galaxies/pulsars.
- Extended deep-sky procedural rendering so galaxy and pulsar anchors have their own visual treatment instead of reusing nebula logic. Galaxies now render as brighter spiral/irregular luminous structures; pulsars render as compact blue-white starbursts.
- Replaced the old binary retention readout with a richer escape-regime audit in src/lib/science/physics.ts and src/lib/science/types.ts. The audit now distinguishes volatile-rich retention, heavier secondary-atmosphere retention, transition regimes, and hydrodynamic/irradiation-driven loss risk instead of flattening everything to a single verdict.
- Updated src/components/universe/universe-stage.tsx so the metric cards and structured analysis text display the new regime/process/confidence language. The UI now surfaces the caveat that magnetic fields are not treated as a simple protection switch and that light-species loss can coexist with heavier-atmosphere retention.
- Tightened legacy caveats in src/lib/science/local/legacy-analysis.ts so inherited “binding energy” language is framed more explicitly as proxy interpretation, not a direct atmosphere measurement.
- Validation after this pass: npm run lint ✅, npm run build ✅, live API spot checks ✅ for WASP-39 b (`hydrodynamic-loss-risk`) and K2-18 b (`volatile-rich-retentive`), Playwright browser load/screenshot ✅ on the production server.
- Follow-up pass: updated the top-level synopsis text in src/components/universe/universe-stage.tsx so the visible narrative now includes the escape-regime audit plus propagated flux/temperature ranges. The stronger science model is no longer hidden only in the metric stack and lower analysis blocks.
- Validation after this follow-up: npm run lint ✅, npm run build ✅, production server restarted on http://127.0.0.1:3000/#science-deck.
- Added deeper provenance into the preserved legacy long-form text in src/lib/science/local/legacy-analysis.ts. Each legacy report now starts with a report-level provenance capsule, and each `SECTION n:` heading is annotated as source-bound, standards/constants, derived-physics, or interpretation-heavy based on its heading.
- Validation after this provenance pass: npm run lint ✅, npm run build ✅, live selected-planet route ✅ showing the new report capsule and section annotations for K2-18 b.
- Added uncertainty-mode guidance text to the Advanced Filters popout in src/components/universe/universe-stage.tsx so the UI explicitly explains the difference between median-only matching and propagated interval-overlap matching.
- Validation after this UI follow-up: npm run lint ✅, npm run build ✅, production server restarted on http://127.0.0.1:3000/#science-deck.
- Extended uncertainty-aware UI surfacing in src/components/universe/universe-stage.tsx so the observed/derived metric cards now show archive uncertainty widths and propagated intervals for radius, mass, temperature, semi-major axis, density, and flux when available.
- Validation after this metric-surface pass: npm run lint ✅, npm run build ✅, live route probe ✅ for K2-18 b propagation fields, Playwright browser smoke check ✅ on the production server.
- Added uncertainty-aware hover for active-system planets in src/components/universe/universe-stage.tsx. Hovering a planet in the 3D system view now exposes propagated radius/mass/temperature/flux ranges (and the selected target’s retention regime when available) instead of only the lower card stack carrying that information.
- Validation after this hover pass: npm run lint ✅, npm run build ✅, Playwright browser smoke check ✅, production server restarted on http://127.0.0.1:3000/#science-deck.
- Added compact science summaries to the selection summary tiles and the `Planets in focus` list in src/components/universe/universe-stage.tsx. The visible selection UI now carries propagated flux/temperature or mass/radius spans instead of leaving that information buried below the fold.
- Validation after this selection-summary pass: npm run lint ✅, npm run build ✅, Playwright browser smoke check ✅, production server restarted on http://127.0.0.1:3000/#science-deck.
- Added compact provenance badges and source notes to the selection summary layer in src/components/universe/universe-stage.tsx. The top-level selection report, active-target tile, and `Planets in focus` list now expose whether a target is currently backed by archive rows, internet enrichment, JWST evidence, Monte Carlo propagation, and/or the local analysis layer.
- Validation after this provenance-summary pass: npm run lint ✅, npm run build ✅, Playwright browser smoke check ✅, production server restarted on http://127.0.0.1:3000/#science-deck.
- Extended the legacy narrative scrub in src/lib/science/local/legacy-analysis.ts to soften recurring overclaims around definitive proof, guaranteed shielding, strongly-bound/secure-atmosphere language, tidal locking certainty, and lifetime statements. This preserves the original report structure while making the displayed text better match the current escape-regime framing.
- Validation after this wording pass: npm run lint ✅, npm run build ✅, live selected-planet route ✅ for TOI-674 b showing the softened retention/tidal-lock wording, production server restarted on http://127.0.0.1:3000/#science-deck.
- Increased default display scale for galaxies/pulsars so they are legible in the exploration view.
- Hardened the planet generators in src/components/ui/planet-globe.tsx:
  - airless worlds now get stronger crater/ejecta/fracture structure and less blue-contaminated terrain,
  - Venusian worlds get stronger super-rotation streak layers,
  - Hycean worlds get stronger current/stream structure,
  - ice giants now diverge from sub-Neptunes with polar haze/storm treatment,
  - sub-Neptunes now use a humid veil/cloud-mass pass,
  - gas giants now split more clearly by hot-jupiter / classic gas giant / saturnian behavior.
- Widened the public curated-spectrum parsing slice and product-level public attempts in src/lib/science/official/planet-science.ts while keeping the unsupported/private JWST-product limitation explicit.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server restarted ✅, browser snapshot ✅, console 0 errors / 1 warning.
- Synced the right-side 2D planet pane to the live 3D camera/view state by plumbing selected-planet longitude, latitude, and host-light direction through a mutable ref into PlanetGlobe. The 2D pane now follows the active 3D viewing angle without forcing React to rerender the full page at frame rate.
- Updated the 2D planet lighting pass to use the live host-light Z component so visible day/night contrast reacts to the actual 3D camera-facing hemisphere instead of a fixed studio light assumption.
- Added apparent-magnitude-aware star styling in src/components/universe/universe-stage.tsx. Distant host stars now use archive V/J/K photometry to influence visible glow and render size, while selected-system stars keep physical radius/luminosity as the main size driver and use the brightness model for stronger halo layers.
- Added star hover detail for radius and V/J/K magnitudes so the render changes are inspectable against the science layer.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server restarted ✅, Playwright snapshot ✅, updated viewport screenshots ✅ at output/playwright/science-deck-stars-magnitude.png and output/playwright/science-deck-wide-after-drag.png.

2026-03-09
- Added a shared physics module in src/lib/science/physics.ts for wide-field Monte Carlo propagation and escape/retention auditing.
- Wide snapshot planets in src/lib/science/catalog/build-universe.ts now carry propagation intervals so uncertainty is available before selected-target enrichment resolves.
- Selected-planet bundles in src/lib/science/official/planet-science.ts now include an explicit retention audit (escape velocity, Jeans parameters, irradiation stress, energy-limited loss proxy, verdict).
- Added a direct FITS fallback path for public JWST products via scripts/extract_jwst_fits_spectrum.py and scripts/run_fits_extractor.sh, with hard timeouts so slow/unsupported products fail fast instead of hanging the route.
- Hardened UI provenance in src/components/universe/universe-stage.tsx by attaching source/equation metadata to observed, derived, and uncertainty cards through a shared MetricCard path.
- Strengthened the legacy atmospheric-retention wording scrub in src/lib/science/local/legacy-analysis.ts so legacy binding-energy language is explicitly reframed as retention-proxy language.
- Validation after this pass: npm run lint ✅, npm run build ✅. Runtime validation target: live selected-planet route + browser snapshot on the production server.

- Added uncertainty-aware advanced filtering in src/components/universe/universe-stage.tsx with a median vs propagated toggle for flux/gravity range matching.
- Added structured claim-level provenance formatting to the generated analysis text so the long-form panel now attaches source/equation context inline with the derived claims.
- Added a structured-claim basis block ahead of legacy local narratives so preserved verbose reports sit next to auditable current-bundle claims instead of standing alone.
- Validation after this pass: npm run lint ✅, npm run build ✅. Runtime validation target: Advanced Filters popout + analysis panel on the production server.

- Added optional MAST token support to the JWST ingestion path via Authorization headers in both Node fetches and the FITS extractor helper; public behavior is unchanged when no token is set.
- Expanded shared propagation intervals to include radius, mass, equilibrium temperature, and semi-major axis so snapshot and selected-target propagation carry a fuller uncertainty envelope.
- Unified selected-target propagation onto the shared physics module so wide-field and selected-target uncertainty semantics stay aligned.
- Advanced Filters propagated mode now applies interval-overlap matching for temperature and radius in addition to flux and gravity.
- Validation after this pass: npm run lint ✅, npm run build ✅. Runtime validation target: selected-planet route + universe snapshot propagation shape on production server.

- Planner text and chart rows in src/components/universe/universe-stage.tsx now consume propagated intervals instead of silently dropping back to point estimates after filtering.
- Observation planning text now surfaces propagated flux, temperature, radius, and one-scale-height signal ranges when available.
- Planet chart rows now prefer propagated medians/ranges for radius, mass, temperature, and flux.
- Validation after this pass: npm run lint ✅, npm run build ✅. Runtime validation target: selected-planet route on production server.

- Science chart bars in src/components/universe/universe-stage.tsx now render propagated interval bands plus a median marker instead of only a single filled value.
- Validation after this pass: npm run lint ✅, npm run build ✅. Runtime validation target: browser screenshot on the production server.

- Expanded the legacy-narrative sanitizer in src/lib/science/local/legacy-analysis.ts to soften recurring overclaims such as “confirmed by JWST observations,” “all predictions confirmed,” “validation of theory,” “guaranteed,” “proves,” and “thin atmosphere confirmed by data.”
- The preserved long-form reports now read more consistently as model-contingent interpretations rather than direct observational truth when those legacy phrases appear.
- Validation after this pass: npm run lint ✅, npm run build ✅. Runtime validation target: selected-planet routes on the production server.

- Added explicit basis labels to the compact selection summaries in src/components/universe/universe-stage.tsx so the short status lines now distinguish archive-backed size/mass, derived flux/temperature, and propagated Monte Carlo intervals.
- This closes another UI path where derived or propagated values could have been read as if they were all the same class of evidence.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server restarted ✅.

- Extended the legacy-narrative sanitizer again in src/lib/science/local/legacy-analysis.ts to catch recurring `validated`, `Framework Validation`, `guaranteed`, and similar framework-overclaim phrasing that remained in the local documents.
- Added explicit evidence-class labels to the active hover/readout layer in src/components/universe/universe-stage.tsx so planet, host-star, reference-star, and white-dwarf tooltips now distinguish archive/catalog values, derived quantities, and Monte Carlo intervals.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server restarted ✅.

- Reintroduced star color conservatively in src/components/universe/universe-stage.tsx through palette generation only: blackbody-style temperature mixing now feeds the existing stable shaders instead of changing shader behavior.
- Strengthened star sizing so physical stellar radius drives visible scale more strongly, while apparent magnitude mainly affects glow/visibility rather than overwhelming size.
- Added per-object pulsar spin periods to the deep-sky pulsar catalog and now pulse those anchors from their own periods, with hover readouts in milliseconds and hertz.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server restarted ✅, Playwright smoke screenshot ✅ at .playwright-cli/page-2026-03-10T00-59-32-223Z.png.
- Reduced selected-star blowout in src/components/universe/universe-stage.tsx by cutting the active-system dodge stack, additive core shell, and corona opacity/scale while keeping the distant field-star look intact.
- Added low-risk star morphology biasing by spectral bucket so hot stars stay smoother/brighter and cool stars keep stronger mottling/spot structure without re-breaking the color pipeline.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server restarted ✅, Playwright viewport screenshot ✅ at .playwright-cli/page-2026-03-10T01-10-41-583Z.png.
- Swapped the selected-star body onto the calmer distant-star surface shader and reduced its additive shell/corona so active-system stars stop blowing out while the field-star look stays intact.
- Tidally locked planets now hard-reset visual spin to zero in the active 3D system view instead of just skipping further rotation updates.
- Orbit visualization now uses ellipse geometry and Kepler-style position solving when archive eccentricity is available, while low-eccentricity worlds keep the circular ring path for readability.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server restarted ✅.
- Reworked the shared star surface shader toward higher detail with layered fbm convection/granulation, stronger multiply/burn structure, and a softer dodge stack so color survives while texture detail reads more clearly in both selected and field stars.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server restarted ✅.
- Rebalanced the shared star surface shader away from heavy multiply toward stronger burn/dodge layering while keeping the softened post-blowout baseline intact.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server restarted ✅, Playwright viewport screenshot ✅ at .playwright-cli/page-2026-03-10T03-49-32-851Z.png.
- 2026-03-10 orbit pass: Solar System planets now use JPL approximate elements anchored near the current epoch (semi-major axis, eccentricity, inclination, longitude of ascending node, argument of periastron, mean anomaly) instead of the old sky-plane exoplanet inclination fallback.
- Exoplanet orbit display now pulls archive argument of periastron (`pl_orblper`) plus transit/periastron epochs (`pl_tranmid`, `pl_orbtper`) when available, derives a phase anchor, and labels the orbit as `measured`, `mixed`, `jpl-approx`, or `inferred` in the synopsis.
- Active-system orbit geometry now distinguishes Solar System ecliptic inclinations from exoplanet sky-plane inclinations, and ellipse orientation applies argument of periastron + inclination + ascending node in the render path instead of a single synthetic orientation angle.
- Validation after this pass: npm run lint ✅, npm run build ✅, production server ready ✅, Playwright viewport screenshot ✅ at .playwright-cli/page-2026-03-10T11-50-48-020Z.png.

- 2026-03-10: Moved 2D magnetosphere rendering onto its own overlay canvas above the globe canvas so field lines are no longer buried by the planet lighting/card stack; increased effective overlay extent by rendering it outside the circular crop. Rebuilt, restarted prod server on session 6687, and validated with Playwright (0 console errors, 1 warning).

- 2026-03-10: Added unified object navigator targets for systems, deep-sky objects, reference stars, and white dwarfs with stage flight commands; removed the top-bar sim-time control. Converted deep-sky objects from sprite primitives to billboarded image planes, lifted their brightness/haze/bloom for better long-range visibility, and shrank the bottom-right stage dock by roughly 50% with Lock Follow moved above Free Cam. Rebuilt, restarted prod server in session 69177, and verified local app load via Playwright/curl.
- 2026-03-10 polish pass: rewrote the 2D magnetosphere overlay so field loops render as full pole-to-pole arcs outside the planet disc, with stronger thickness scaling from magnetic strength and a longer right-side tail under higher radiation pressure.
- 2026-03-10 polish pass: selected reference stars and selected white dwarfs now swap their distant marker out for the close-up SelectedStarBody render, eliminating the translucent halo-shell look when those object types are focused.
- 2026-03-10 polish pass: flattened the 2D non-tidally-locked light sweep to horizontal motion and pushed gas-giant belt separation harder for cleaner color boundaries. Added scroll offset on #science-deck so the fixed nav no longer clips the section heading on anchor load.
- Validation after this pass: npm run lint -- --max-warnings=0 ✅, npm run build ✅, production server restarted ✅, Playwright smoke check + Sirius A selection screenshot ✅ at .playwright-cli/page-2026-03-10T22-26-29-708Z.png.

- 2026-03-10 focus/export pass: the lower science rail now uses object-specific section titles and downloadable TXT / JSON / CSV exports instead of the old placeholder hook line. The active focus bundle serializes synopsis, status, metrics, chart rows, sources, and full analysis for planets, systems, stars, deep-sky objects, and white dwarfs.
- 2026-03-10 deep-sky expansion pass: added image-backed galaxy / black-hole / quasar anchors for Whirlpool Galaxy, Sombrero Galaxy, M87 Galaxy, Sagittarius A*, Cygnus X-1, and 3C 273. The deep-sky catalog now carries per-object source/art references and mass anchors where relevant, and the scene renders them with their own tags, hover summaries, and focus cards instead of treating them as generic nebula placeholders.
- Validation after this pass: npm run lint -- --max-warnings=0 ✅, npm run build ✅, production server restarted ✅ on session 63934.

2026-03-13
- Replaced the starter README with Cosmoplot-specific project documentation covering architecture, verification, and deployment expectations.
- Added repo-local [AGENTS.md] guidance with explicit mission, non-negotiables, team model, and working rules so future work is grounded in the project instead of chat memory.
- Added operational docs:
  - docs/AGENT_TEAMS.md
  - docs/PRODUCTION_BURNDOWN.md
- Added Claude-style slash-command playbooks under .claude/commands for:
  - /science-hardening
  - /render-polish
  - /ux-focus-pass
  - /deep-sky-pass
  - /release-readiness
  - /production-burndown
- Added package scripts for production-grade verification and local port conflict handling:
  - npm run typecheck
  - npm run verify
  - npm run start:3001
- Validation after this pass: npm run verify ✅.
- 2026-03-13 business-ops pass: added a first real commercial path to the app.
  - New lead intake backend in `src/lib/business/lead-intake.ts` plus `src/app/api/leads/route.ts`.
  - Lead records are persisted locally to `.cache/business/leads.jsonl` and can fan out to a webhook (`COSMOPLOT_LEAD_WEBHOOK_URL`) and Resend email notifications when configured.
  - Added `src/components/chrome/lead-capture-form.tsx` and wired it into the landing shell as a visible request-access funnel.
  - Added `.env.example` for business automation/configuration.
  - Added `docs/BUSINESS_AUTOMATION.md` describing the recommended automation architecture: lead intake -> webhook/n8n -> CRM/email/finance routing.
  - Expanded the operational model with a Growth and Revenue Ops team and a `/growth-ops` slash command.
  - Validation after this pass: `npm run verify` ✅, `/api/leads` smoke POST ✅, Playwright landing-page smoke check ✅.
- 2026-03-13 donor-ops pass: refactored the new business layer around supporter and donation operations instead of SaaS-style sales language.
  - Landing page supporter section and form now speak in donor/supporter terms.
  - Supporter env contract added: `COSMOPLOT_SUPPORTER_WEBHOOK_URL`, `COSMOPLOT_SUPPORTERS_TO`, `COSMOPLOT_SUPPORTERS_FROM`, `NEXT_PUBLIC_DONATION_URL`.
  - Supporter records now persist to `.cache/business/supporters.jsonl` and emit `supporter.created` events.
  - Updated the operations docs and agent-team model to use supporter/sustainability language.
  - Added `/supporter-ops` slash command.
  - Validation after this pass: `npm run verify` ✅, browser smoke check ✅.
