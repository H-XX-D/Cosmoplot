"use client";

import {
  Atom,
  Database,
  Radar,
  Sparkles,
  Telescope,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { UniverseStage } from "@/components/universe/universe-stage";
import type { UniverseSnapshot } from "@/lib/science/types";
import { LeadCaptureForm } from "@/components/chrome/lead-capture-form";
import { LockoutTargetPlanner } from "@/components/science/lockout-target-planner";

const INTRO_DELAY_MS = 7000;
const HERO_FADE_MS = 1600;
const SCROLL_DURATION_MS = 3400;
const SCROLL_TOP_OFFSET = 96;

const engineModules = [
  {
    title: "Plot a Fix",
    description: "Start from reliable chart points, then branch into nearby systems, Solar System planets, or deep-sky anchors.",
    icon: Telescope,
  },
  {
    title: "Read the Bearings",
    description: "Place each object in a shared Sun-centered chart so distance, direction, and selection feel coherent.",
    icon: Radar,
  },
  {
    title: "Check the Evidence",
    description: "Separate what was measured, what was calculated, and what still needs follow-up without blending them together.",
    icon: Atom,
  },
  {
    title: "Compare Next Legs",
    description: "Use the optimizer and detail cards to compare promising worlds without treating the shortlist as an observing program.",
    icon: TrendingUp,
  },
] as const;

const supporterModules = [
  {
    title: "Supporter Intake",
    description: "Let interested visitors raise a hand and stay connected as the project grows.",
  },
  {
    title: "Donation Routing",
    description: "Give supporters a clear path to updates or donations without locking the site to one vendor.",
  },
  {
    title: "Sustainability Layer",
    description: "Keep the chart plotter moving from a one-off showcase toward a maintained public science tool.",
  },
] as const;

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function scrollToScienceDeck(durationMs: number) {
  const target = document.getElementById("science-deck");
  if (!target) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const currentY = window.scrollY;
  const targetY = Math.max(0, currentY + target.getBoundingClientRect().top - SCROLL_TOP_OFFSET);
  if (prefersReducedMotion) {
    window.scrollTo(0, targetY);
    return;
  }
  const startedAt = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - startedAt) / durationMs);
    const eased = easeInOutCubic(t);
    window.scrollTo(0, currentY + (targetY - currentY) * eased);
    if (t < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

export function CosmoplotHomeShell({ snapshot }: { snapshot: UniverseSnapshot }) {
  const [heroFading, setHeroFading] = useState(false);
  const [introArmed, setIntroArmed] = useState(false);
  const sequenceStartedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const totalPlanets = snapshot.systems.reduce((sum, system) => sum + system.planetCount, 0);
  const nearest = snapshot.systems.slice(0, 6);
  const primarySource = snapshot.sources[0];

  const startSequence = useCallback(() => {
    if (sequenceStartedRef.current) {
      scrollToScienceDeck(SCROLL_DURATION_MS * 0.7);
      return;
    }
    sequenceStartedRef.current = true;
    setHeroFading(true);
    window.setTimeout(() => {
      setIntroArmed(true);
      scrollToScienceDeck(SCROLL_DURATION_MS);
    }, Math.round(HERO_FADE_MS * 0.2));
  }, []);

  useEffect(() => {
    timerRef.current = window.setTimeout(() => {
      startSequence();
    }, INTRO_DELAY_MS);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [startSequence]);

  const heroClassName = heroFading
    ? "opacity-0 blur-xl -translate-y-6 scale-[0.985]"
    : "opacity-100 blur-0 translate-y-0 scale-100";

  return (
    <div className="relative z-10">
      <nav className="fixed left-0 right-0 top-0 z-30 border-b border-white/10 bg-[#030814]/38 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-300/10 shadow-[0_0_38px_rgba(99,210,255,0.20)]">
              <Telescope className="h-5 w-5 text-sky-100" />
            </div>
            <div>
              <div className="text-[0.72rem] uppercase tracking-[0.28em] text-sky-100/56">Cosmoplot</div>
              <div className="text-sm text-slate-300/76">Science-first star plotter</div>
            </div>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            <a href="#hero" className="text-sm text-slate-300/68 transition hover:text-white">
              Home
            </a>
            <a href="#science-deck" className="text-sm text-slate-300/68 transition hover:text-white">
              Star Chart
            </a>
            <a href="#evidence" className="text-sm text-slate-300/68 transition hover:text-white">
              Legend
            </a>
            <a href="#optimizer" className="text-sm text-slate-300/68 transition hover:text-white">
              Optimizer
            </a>
          </div>

          <button
            type="button"
            onClick={startSequence}
            className="rounded-full border border-sky-300/24 bg-sky-300/12 px-4 py-2 text-sm font-medium text-sky-50 transition hover:bg-sky-300/18"
          >
            Plot a Course
          </button>
        </div>
      </nav>

      <section id="hero" className="flex min-h-screen items-center justify-center px-6 pb-20 pt-28 lg:px-10">
        <div
          className={`mx-auto flex w-full max-w-[1500px] flex-col gap-12 transition-[opacity,transform,filter] duration-[1600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${heroClassName}`}
        >
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[0.72rem] uppercase tracking-[0.28em] text-slate-100/72">
              <Sparkles className="h-3.5 w-3.5 text-sky-200" />
              A star chart plotter for real nearby systems
            </div>
            <h1 className="mt-8 max-w-5xl bg-gradient-to-b from-[#eef7ff] via-[#d8e7ff] to-[#ffcad7] bg-clip-text text-5xl font-semibold tracking-[-0.06em] text-transparent sm:text-6xl lg:text-8xl">
              Plot a course through nearby worlds without losing track of what is actually known.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-200/78 sm:text-xl">
              Cosmoplot works like a sailing chart plotter for the sky: pick a fix, read the bearing and distance, then inspect the catalog evidence, uncertainty, and model labels behind the object.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                onClick={startSequence}
                className="rounded-full border border-sky-300/24 bg-sky-300/14 px-6 py-3 text-sm font-medium text-sky-50 transition hover:bg-sky-300/20"
              >
                Plot Guided Fixes
              </button>
              <a
                href="#evidence"
                className="rounded-full border border-white/12 bg-white/[0.04] px-6 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08]"
              >
                Read the Chart Legend
              </a>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Systems loaded",
                value: snapshot.systems.length.toString(),
                note: "Nearby confirmed host systems ready for chart plotting.",
              },
              {
                label: "Planets organized",
                value: totalPlanets.toString(),
                note: "Planet records connected to source labels, uncertainty, and detail cards.",
              },
              {
                label: "Sampling radius",
                value: `${snapshot.query.radiusPc} pc`,
                note: "Current local-neighborhood chart volume around the Sun.",
              },
              {
                label: "Source of truth",
                value: primarySource?.name ?? "Official source",
                note: "Each claim stays anchored to catalog and cache provenance.",
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
            <div className="text-[0.72rem] uppercase tracking-[0.28em] text-sky-100/48">Chart Plotter Flow</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white">Pick a fix, read the chart, then check the claim</h2>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-300/74">
              The interface gives casual visitors a clear path in while preserving the distinction between measurements, calculations, model output, and planning guidance.
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
          <UniverseStage snapshot={snapshot} introArmed={introArmed} />
        </div>
      </section>

      <LockoutTargetPlanner snapshot={snapshot} />

      <section id="market" className="px-6 pb-12 lg:px-10">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-8 text-center">
            <div className="text-[0.72rem] uppercase tracking-[0.28em] text-sky-100/48">Support Cosmoplot</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white">Help keep the chart plotter alive and improving</h2>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-300/74">
              If Cosmoplot is useful for outreach, education, or research conversations, you can join updates and help support the chart plotter behind it.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {supporterModules.map((module) => (
              <article
                key={module.title}
                className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(6,14,31,0.84),rgba(3,8,18,0.62))] p-5 shadow-[0_24px_80px_rgba(2,8,24,0.30)] backdrop-blur-xl"
              >
                <GlowingEffect disabled={false} spread={52} proximity={110} inactiveZone={0.28} borderWidth={1} />
                <div className="relative z-10">
                  <div className="text-[0.68rem] uppercase tracking-[0.24em] text-sky-100/50">{module.title}</div>
                  <p className="mt-3 text-sm leading-6 text-slate-300/72">{module.description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6">
            <LeadCaptureForm />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#030814]/42 px-6 py-12 backdrop-blur-xl lg:px-10">
        <div className="mx-auto grid max-w-[1500px] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-6">
            <GlowingEffect spread={44} proximity={90} inactiveZone={0.32} borderWidth={1} />
            <div className="relative z-10">
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-sky-100/48">Archive pulse</div>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300/76">
                Generated {format(new Date(snapshot.generatedAt), "PPpp")}. This chart is built from the current archive snapshot, local cache state, and selected-target enrichment when available. It is designed for exploration and triage; instrument-grade planning still requires the proper JWST checks.
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
  );
}
