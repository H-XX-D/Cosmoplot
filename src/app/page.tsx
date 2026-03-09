import {
  Atom,
  Database,
  Radar,
  Sparkles,
  Telescope,
  TrendingUp,
} from "lucide-react";
import { format } from "date-fns";
import { NebulaBackground } from "@/components/chrome/nebula-background";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ShootingStars } from "@/components/ui/shooting-stars";
import { UniverseStage } from "@/components/universe/universe-stage";
import { getUniverseSnapshot } from "@/lib/science/catalog/build-universe";

const engineModules = [
  {
    title: "Hypothesis Compiler",
    description: "Turn a scientific claim into a checkable statement against the active system and planet evidence.",
    icon: Telescope,
  },
  {
    title: "Coordinate Engine",
    description: "Normalize RA, Dec, and distance into a Sun-centered XYZ frame before anything is drawn.",
    icon: Radar,
  },
  {
    title: "Observed vs Derived",
    description: "Keep observed archive values separate from inferred and model-derived context in every panel.",
    icon: Atom,
  },
  {
    title: "Observation Gap Planner",
    description: "Build on joined brightness, JWST observations, and product inventory until the planner is instrument-grade.",
    icon: TrendingUp,
  },
] as const;

export default async function Home() {
  const snapshot = await getUniverseSnapshot({ radiusPc: 35, limit: 800 });
  const totalPlanets = snapshot.systems.reduce((sum, system) => sum + system.planetCount, 0);
  const nearest = snapshot.systems.slice(0, 6);
  const primarySource = snapshot.sources[0];

  return (
    <main className="relative min-h-screen overflow-x-hidden text-white">
      <NebulaBackground />
      <ShootingStars
        className="fixed inset-0 z-[1] opacity-80"
        starColor="#ffe8a8"
        trailColor="#72dcff"
        minSpeed={18}
        maxSpeed={34}
        minDelay={1200}
        maxDelay={2800}
      />
      <ShootingStars
        className="fixed inset-0 z-[1] opacity-40"
        starColor="#ff8fb9"
        trailColor="#ffb778"
        minSpeed={10}
        maxSpeed={22}
        minDelay={2400}
        maxDelay={5200}
      />
      <div className="pointer-events-none fixed inset-0 z-[2] bg-[radial-gradient(circle_at_50%_22%,rgba(138,223,255,0.10),transparent_0_17%,rgba(255,172,118,0.07)_28%,transparent_54%),linear-gradient(180deg,rgba(1,4,13,0.06),rgba(1,4,13,0.36)_32%,rgba(1,4,13,0.78)_100%)]" />

      <div className="relative z-10">
        <nav className="fixed left-0 right-0 top-0 z-30 border-b border-white/10 bg-[#030814]/38 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4 lg:px-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-300/10 shadow-[0_0_38px_rgba(99,210,255,0.20)]">
                <Telescope className="h-5 w-5 text-sky-100" />
              </div>
              <div>
                <div className="text-[0.72rem] uppercase tracking-[0.28em] text-sky-100/56">Cosmoplot</div>
                <div className="text-sm text-slate-300/76">Science-first universe explorer</div>
              </div>
            </div>

            <div className="hidden items-center gap-6 md:flex">
              <a href="#hero" className="text-sm text-slate-300/68 transition hover:text-white">
                Home
              </a>
              <a href="#evidence" className="text-sm text-slate-300/68 transition hover:text-white">
                Evidence
              </a>
              <a href="#science-deck" className="text-sm text-slate-300/68 transition hover:text-white">
                Science Deck
              </a>
            </div>

            <a
              href="#science-deck"
              className="rounded-full border border-sky-300/24 bg-sky-300/12 px-4 py-2 text-sm font-medium text-sky-50 transition hover:bg-sky-300/18"
            >
              Launch Mission
            </a>
          </div>
        </nav>

        <section id="hero" className="flex min-h-screen items-center justify-center px-6 pb-20 pt-28 lg:px-10">
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-12">
            <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[0.72rem] uppercase tracking-[0.28em] text-slate-100/72">
                <Sparkles className="h-3.5 w-3.5 text-sky-200" />
                Information fades out of the sky from a central event, then resolves into science
              </div>
              <h1 className="mt-8 max-w-5xl bg-gradient-to-b from-[#eef7ff] via-[#d8e7ff] to-[#ffcad7] bg-clip-text text-5xl font-semibold tracking-[-0.06em] text-transparent sm:text-6xl lg:text-8xl">
                Explore the universe through official data, not a dashboard skin.
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-200/78 sm:text-xl">
                This rewrite keeps the last site&apos;s science organization intact: left map and analysis, right evidence rail, observed versus inferred separation, and provenance attached to the live archive snapshot that feeds the scene.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <a
                  href="#science-deck"
                  className="rounded-full border border-sky-300/24 bg-sky-300/14 px-6 py-3 text-sm font-medium text-sky-50 transition hover:bg-sky-300/20"
                >
                  Start Exploring
                </a>
                <a
                  href="#evidence"
                  className="rounded-full border border-white/12 bg-white/[0.04] px-6 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08]"
                >
                  View Science Workflow
                </a>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Systems loaded",
                  value: snapshot.systems.length.toString(),
                  note: "Nearby confirmed host systems in the live Sun-centered snapshot.",
                },
                {
                  label: "Planets organized",
                  value: totalPlanets.toString(),
                  note: "Planet records attached to host systems and stage selection state.",
                },
                {
                  label: "Sampling radius",
                  value: `${snapshot.query.radiusPc} pc`,
                  note: "Current spherical query volume around the Sun.",
                },
                {
                  label: "Source of truth",
                  value: primarySource?.name ?? "Official source",
                  note: "The renderer is downstream of this catalog and cache state.",
                },
              ].map((item) => (
                <article
                  key={item.label}
                  className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5 shadow-[0_26px_90px_rgba(2,8,24,0.34)] backdrop-blur-xl"
                >
                  <GlowingEffect disabled={false} spread={44} proximity={80} inactiveZone={0.35} borderWidth={1} />
                  <div className="relative z-10">
                    <div className="text-[0.68rem] uppercase tracking-[0.24em] text-sky-100/50">{item.label}</div>
                    <div className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">{item.value}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300/72">{item.note}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="evidence" className="px-6 pb-12 lg:px-10">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-8 text-center">
              <div className="text-[0.72rem] uppercase tracking-[0.28em] text-sky-100/48">JWST Evidence Engine</div>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white">Same science-side structure, new atmospheric shell</h2>
              <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-300/74">
                These modules stay aligned with the previous Cosmoplot science flow, but the presentation now lives inside the sky layer you asked for instead of the old utilitarian theme.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              {engineModules.map((module) => {
                const Icon = module.icon;
                return (
                  <article
                    key={module.title}
                    className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(6,14,31,0.84),rgba(3,8,18,0.62))] p-5 shadow-[0_24px_80px_rgba(2,8,24,0.30)] backdrop-blur-xl"
                  >
                    <GlowingEffect disabled={false} spread={52} proximity={110} inactiveZone={0.28} borderWidth={1} />
                    <div className="relative z-10">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-300/16 bg-sky-300/10 text-sky-50">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-5 text-lg font-semibold text-white">{module.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300/72">{module.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-6 pb-20 lg:px-10">
          <div className="mx-auto max-w-[1500px]">
            <UniverseStage snapshot={snapshot} />
          </div>
        </section>

        <footer className="border-t border-white/10 bg-[#030814]/42 px-6 py-12 backdrop-blur-xl lg:px-10">
          <div className="mx-auto grid max-w-[1500px] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-6">
              <GlowingEffect spread={44} proximity={90} inactiveZone={0.32} borderWidth={1} />
              <div className="relative z-10">
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-sky-100/48">Archive pulse</div>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300/76">
                  Generated {format(new Date(snapshot.generatedAt), "PPpp")}. The current rewrite is already pulling from the official archive path, caching it locally, joining selected-planet JWST observation/product inventories on demand, and running first-pass uncertainty propagation. The next science layers are wider product-level spectrum coverage, instrument-grade planning output, and deeper non-selected-planet enrichment.
                </p>
                {primarySource ? (
                  <a
                    href={primarySource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-sm text-sky-200 transition hover:text-white"
                  >
                    <Database className="h-4 w-4" />
                    {primarySource.name}
                  </a>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4">
              {nearest.slice(0, 2).map((system) => (
                <article
                  key={system.id}
                  className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-5"
                >
                  <GlowingEffect spread={42} proximity={80} inactiveZone={0.3} borderWidth={1} />
                  <div className="relative z-10">
                    <div className="text-[0.64rem] uppercase tracking-[0.22em] text-sky-100/46">Nearby system</div>
                    <h3 className="mt-2 text-lg font-semibold text-white">{system.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300/74">
                      {system.planetCount} planets · {system.distancePc.toFixed(2)} pc · {system.stellar.spectralType ?? "spectral type pending"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
