"use client";

import { Cpu, Network, RefreshCw, ShieldAlert, Target, Telescope } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildLockoutProblem,
  type LockoutTargetPlan,
} from "@/lib/science/optimization/target-plan";
import type { UniverseSnapshot } from "@/lib/science/types";

type PlannerState =
  | { status: "idle"; plan: null; error: null }
  | { status: "loading"; plan: LockoutTargetPlan | null; error: null }
  | { status: "ready"; plan: LockoutTargetPlan; error: null }
  | { status: "error"; plan: LockoutTargetPlan | null; error: string };

function formatOptional(value: number | null, digits: number, suffix = "") {
  return value === null ? "unknown" : `${value.toFixed(digits)}${suffix}`;
}

function readinessClass(readiness: string) {
  if (readiness === "ready") return "border-emerald-300/24 bg-emerald-300/10 text-emerald-50";
  if (readiness === "blocked") return "border-rose-300/24 bg-rose-300/10 text-rose-50";
  return "border-amber-300/24 bg-amber-300/10 text-amber-50";
}

function displayRank(target: unknown, fallback: number) {
  if (!target || typeof target !== "object" || !("rank" in target)) return fallback;
  const rank = (target as { rank?: unknown }).rank;
  return typeof rank === "number" && rank > 0 ? rank : fallback;
}

export function LockoutTargetPlanner({ snapshot }: { snapshot: UniverseSnapshot }) {
  const packet = useMemo(() => buildLockoutProblem(snapshot), [snapshot]);
  const [state, setState] = useState<PlannerState>({ status: "idle", plan: null, error: null });

  const runOptimizer = useCallback(async (signal?: AbortSignal) => {
    if (!packet.candidates.length) {
      setState({ status: "error", plan: null, error: "No targets in the current snapshot have enough archive data for the optimizer yet." });
      return;
    }

    setState((current) => ({ status: "loading", plan: current.plan, error: null }));
    try {
      const response = await fetch("/api/science/optimize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(packet),
        signal,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "The optimizer could not finish this run.");
      }
      setState({ status: "ready", plan: payload as LockoutTargetPlan, error: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState((current) => ({
        status: "error",
        plan: current.plan,
        error: error instanceof Error ? error.message : "The optimizer could not finish this run.",
      }));
    }
  }, [packet]);

  useEffect(() => {
    const controller = new AbortController();
    runOptimizer(controller.signal);
    return () => controller.abort();
  }, [runOptimizer]);

  const plan = state.plan;
  const selectedTargets = plan?.selectedTargets ?? [];
  const alternates = plan?.alternates ?? [];
  const engineLabel = plan
    ? plan.engine.fallback
      ? `${plan.engine.name} fallback`
      : plan.engine.name
    : "lockout CPU anneal";

  return (
    <section id="optimizer" className="px-6 pb-12 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.28em] text-sky-100/48">
                  <Network className="h-3.5 w-3.5" /> Lockout Target Optimizer
                </div>
                <h2 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-white">
                  A balanced shortlist for follow-up attention
                </h2>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300/74">
                  Lockout reviews the current catalog for promising targets, then favors a mix of strong signals, useful brightness, and less-redundant observing modes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => runOptimizer()}
                disabled={state.status === "loading"}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-300/24 bg-cyan-300/12 px-5 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/18 disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${state.status === "loading" ? "animate-spin" : ""}`} />
                {state.status === "loading" ? "Optimizing" : "Run Optimizer"}
              </button>
            </div>

            {state.status === "error" ? (
              <div className="mt-5 flex items-start gap-3 rounded-[1.2rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50/86">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{state.error}</span>
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {(selectedTargets.length ? selectedTargets : packet.candidates.slice(0, 6)).slice(0, 6).map((target, index) => (
                <article
                  key={target.id}
                  className="relative overflow-hidden rounded-[1.45rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,18,38,0.78),rgba(4,10,24,0.54))] p-5 shadow-[0_22px_70px_rgba(2,8,24,0.28)] backdrop-blur-xl"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[0.66rem] uppercase tracking-[0.24em] text-sky-100/48">
                        #{displayRank(target, index + 1)} · {target.systemName}
                      </div>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">{target.planetName}</h3>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.18em] ${readinessClass(target.readiness)}`}>
                      {target.readiness}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">Score</div>
                      <div className="mt-1 text-sm text-white">{target.priorityScore.toFixed(1)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">Signal</div>
                      <div className="mt-1 text-sm text-white">{formatOptional(target.metrics.signalPpm, 0, " ppm")}</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">Temp</div>
                      <div className="mt-1 text-sm text-white">{formatOptional(target.metrics.equilibriumK, 0, " K")}</div>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-300/76">{target.rationale}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {target.recommendedModes.map((mode) => (
                      <span key={mode} className="rounded-full border border-sky-300/14 bg-sky-300/8 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-sky-50/78">
                        {mode}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[1.45rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.018))] p-5 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.24em] text-sky-100/48">
                <Cpu className="h-3.5 w-3.5" /> Run Details
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-300/78">
                <div className="flex items-center justify-between gap-3">
                  <span>Solver</span>
                  <span className="text-right text-white">{engineLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Graph</span>
                  <span className="text-right text-white">{packet.problem.n} nodes · {packet.problem.edges.length} edges</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Best cut</span>
                  <span className="text-right text-white">{plan ? plan.engine.bestCut.toFixed(2) : "pending"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Runtime</span>
                  <span className="text-right text-white">{plan ? `${plan.engine.wallMs.toFixed(1)} ms` : "pending"}</span>
                </div>
              </div>
              {plan?.engine.warning ? (
                <p className="mt-4 text-xs leading-5 text-amber-100/72">{plan.engine.warning}</p>
              ) : null}
            </div>

            <div className="rounded-[1.45rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.018))] p-5 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.24em] text-sky-100/48">
                <Target className="h-3.5 w-3.5" /> Next Best Alternates
              </div>
              <div className="mt-4 space-y-3">
                {(alternates.length ? alternates : packet.candidates.slice(6, 10)).slice(0, 4).map((target) => (
                  <div key={target.id} className="border-b border-white/8 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-white">{target.planetName}</span>
                      <span className="text-xs text-slate-400">{target.priorityScore.toFixed(1)}</span>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-300/68">{target.systemName} · {target.spectralBucket}-host · {target.thermalClass}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.45rem] border border-white/10 bg-slate-950/28 p-5 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.24em] text-sky-100/48">
                <Telescope className="h-3.5 w-3.5" /> Planning Note
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300/74">
                Use this as a shortlist, not an observing program. ETC/APT visibility, saturation, and scheduling checks still decide what can actually run.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
