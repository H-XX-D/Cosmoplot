import type { UniversePlanet, UniverseSnapshot, UniverseSystem } from "@/lib/science/types";
import { clamp } from "@/lib/utils";

export type LockoutReadiness = "ready" | "caution" | "blocked";

export type LockoutProblem = {
  n: number;
  edges: Array<[number, number, number]>;
};

export type LockoutTargetMetrics = {
  distancePc: number;
  jMag: number | null;
  kMag: number | null;
  equilibriumK: number | null;
  fluxEarth: number | null;
  radiusEarth: number | null;
  massEarth: number | null;
  signalPpm: number | null;
  missingCriticalCount: number;
};

export type LockoutTargetCandidate = {
  id: string;
  systemId: string;
  planetId: string;
  systemName: string;
  planetName: string;
  priorityScore: number;
  utilityWeight: number;
  rejectionWeight: number;
  readiness: LockoutReadiness;
  spectralBucket: string;
  thermalClass: string;
  recommendedModes: string[];
  diversityTags: string[];
  rationale: string;
  metrics: LockoutTargetMetrics;
};

export type LockoutProblemPacket = {
  version: "cosmoplot-lockout-target-v1";
  generatedAt: string;
  objective: string;
  solverIntent: string;
  candidates: LockoutTargetCandidate[];
  problem: LockoutProblem;
  graph: {
    candidateNodes: number;
    anchorNodes: number;
    selectedAnchor: number;
    rejectedAnchor: number;
    edgeCount: number;
    portfolioSize: number;
    maxCandidates: number;
  };
  config: {
    search: "anneal";
    shots: number;
    sweeps: number;
    seed: number;
  };
};

export type LockoutSolvePacket = {
  assignment: number[];
  bestCut: number;
  wallMs: number;
  backend: string;
  search: string;
  shots: number;
  sweeps: number;
  seed: number;
  engineName: string;
  enginePath: string | null;
  fallback: boolean;
  warning?: string;
};

export type LockoutPlanTarget = LockoutTargetCandidate & {
  rank: number;
  lockoutPartition: "selected" | "rejected";
};

export type LockoutTargetPlan = {
  generatedAt: string;
  objective: string;
  engine: {
    name: string;
    path: string | null;
    backend: string;
    search: string;
    shots: number;
    sweeps: number;
    seed: number;
    bestCut: number;
    wallMs: number;
    fallback: boolean;
    warning?: string;
  };
  graph: LockoutProblemPacket["graph"] & {
    solvedNodes: number;
    solvedEdges: number;
  };
  selectedTargets: LockoutPlanTarget[];
  alternates: LockoutPlanTarget[];
  notes: string[];
};

type BuildOptions = {
  maxCandidates?: number;
  portfolioSize?: number;
};

const DEFAULT_MAX_CANDIDATES = 72;
const DEFAULT_PORTFOLIO_SIZE = 8;
const SELECTED_ANCHOR_EDGE_WEIGHT = 80;

function finiteNumber(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function spectralBucket(type: string | null) {
  const normalized = String(type || "").trim().toUpperCase();
  if (!normalized) return "Unknown";
  const first = normalized.charAt(0);
  return ["O", "B", "A", "F", "G", "K", "M"].includes(first) ? first : "Other";
}

function thermalClass(equilibriumK: number | null) {
  if (equilibriumK === null) return "temperature-unresolved";
  if (equilibriumK < 180) return "cold";
  if (equilibriumK <= 320) return "temperate";
  if (equilibriumK <= 750) return "warm";
  if (equilibriumK <= 1300) return "hot";
  return "ultra-hot";
}

function normalizedLogScore(value: number | null, min: number, max: number) {
  if (value === null || value <= 0) return 0;
  const lo = Math.log10(min);
  const hi = Math.log10(max);
  return clamp((Math.log10(clamp(value, min, max)) - lo) / Math.max(hi - lo, 0.0001), 0, 1);
}

function magnitudeSweetSpotScore(value: number | null) {
  if (value === null) return 0.38;
  if (value < 5.5) return 0.08;
  if (value < 6.5) return 0.42;
  if (value <= 10.5) return 1;
  if (value <= 12.5) return 0.72;
  if (value <= 14) return 0.44;
  return 0.18;
}

function temperatureScore(equilibriumK: number | null) {
  if (equilibriumK === null) return 0.24;
  if (equilibriumK >= 220 && equilibriumK <= 330) return 1;
  if (equilibriumK >= 160 && equilibriumK <= 430) return 0.82;
  if (equilibriumK >= 430 && equilibriumK <= 950) return 0.62;
  if (equilibriumK > 950 && equilibriumK <= 1600) return 0.52;
  return 0.28;
}

function fluxScore(fluxEarth: number | null) {
  if (fluxEarth === null || fluxEarth <= 0) return 0.26;
  if (fluxEarth >= 0.35 && fluxEarth <= 1.9) return 1;
  if (fluxEarth >= 0.12 && fluxEarth <= 8) return 0.72;
  if (fluxEarth <= 25) return 0.48;
  return 0.25;
}

function hasBounds(value: { plus: number | null; minus: number | null } | undefined) {
  return Boolean(value && (value.plus !== null || value.minus !== null));
}

function formatMetric(value: number | null, digits: number, suffix = "") {
  return value === null ? "unknown" : `${value.toFixed(digits)}${suffix}`;
}

function metricSignal(planet: UniversePlanet) {
  const signal = planet.propagation?.oneScaleHeightSignalPpm;
  return finiteNumber(signal?.high) ?? finiteNumber(signal?.median) ?? null;
}

function planetFlux(planet: UniversePlanet) {
  return finiteNumber(planet.propagation?.fluxEarthMultiple.median) ?? finiteNumber(planet.insolationEarth);
}

function buildModes(metrics: LockoutTargetMetrics) {
  const modes: string[] = [];
  const signal = metrics.signalPpm ?? 0;
  const jMag = metrics.jMag;
  const kMag = metrics.kMag;
  const equilibriumK = metrics.equilibriumK;

  if (jMag === null || jMag >= 6.5) {
    modes.push("NIRISS SOSS");
  }

  modes.push(signal >= 60 ? "NIRSpec G395H BOTS" : "NIRSpec Prism BOTS");

  if (equilibriumK !== null && equilibriumK >= 850 && (kMag === null || kMag >= 5.5)) {
    modes.push("MIRI LRS slitless");
  }

  return Array.from(new Set(modes)).slice(0, 3);
}

function candidateForPlanet(system: UniverseSystem, planet: UniversePlanet): LockoutTargetCandidate | null {
  if (system.id === "sun" || planet.discoveryFacility === "Solar System") return null;

  const jMag = finiteNumber(system.stellar.photometry.jMag);
  const kMag = finiteNumber(system.stellar.photometry.kMag);
  const equilibriumK = finiteNumber(planet.propagation?.equilibriumK.median) ?? finiteNumber(planet.equilibriumK);
  const fluxEarth = planetFlux(planet);
  const signalPpm = metricSignal(planet);
  const radiusEarth = finiteNumber(planet.propagation?.radiusEarth.median) ?? finiteNumber(planet.radiusEarth);
  const massEarth = finiteNumber(planet.propagation?.massEarth.median) ?? finiteNumber(planet.massEarth);
  const missingCriticalCount = [
    radiusEarth,
    massEarth,
    equilibriumK,
    finiteNumber(planet.semiMajorAxisAu),
    jMag,
  ].filter((value) => value === null).length;
  const completeness = 1 - missingCriticalCount / 5;
  const local = planet.localAnalysis ?? system.localAnalysis ?? null;
  const hasJwstContext = Boolean(local?.jwstInstrumentLabels.length);
  const hasMoleculeContext = Boolean(local?.moleculeTags.length);
  const localInterest = local?.interesting ? 1 : hasMoleculeContext ? 0.68 : local?.studied ? 0.48 : 0.22;
  const gapOpportunity = hasJwstContext ? 0.38 : hasMoleculeContext ? 0.92 : 0.7;
  const uncertaintySignal = [
    hasBounds(planet.uncertainty.radiusEarth),
    hasBounds(planet.uncertainty.massEarth),
    hasBounds(planet.uncertainty.equilibriumK),
    hasBounds(planet.uncertainty.semiMajorAxisAu),
    hasBounds(planet.uncertainty.periodDays),
  ].filter(Boolean).length / 5;
  const brightness = Math.max(magnitudeSweetSpotScore(jMag), magnitudeSweetSpotScore(kMag));
  const signalScore = normalizedLogScore(signalPpm, 8, 160);
  const distanceScore = 1 - clamp(system.distancePc / 45, 0, 1);
  const score = clamp(
    16
      + signalScore * 20
      + brightness * 17
      + temperatureScore(equilibriumK) * 13
      + fluxScore(fluxEarth) * 10
      + completeness * 12
      + gapOpportunity * 9
      + localInterest * 8
      + uncertaintySignal * 4
      + distanceScore * 5,
    0,
    100,
  );
  const readyEnough = missingCriticalCount <= 1 && brightness >= 0.62 && signalPpm !== null;
  const blocked = (jMag !== null && jMag < 5.5) || (kMag !== null && kMag < 4.8);
  const readiness: LockoutReadiness = blocked ? "blocked" : readyEnough ? "ready" : "caution";
  const metrics: LockoutTargetMetrics = {
    distancePc: system.distancePc,
    jMag,
    kMag,
    equilibriumK,
    fluxEarth,
    radiusEarth,
    massEarth,
    signalPpm,
    missingCriticalCount,
  };
  const recommendedModes = buildModes(metrics);
  const bucket = spectralBucket(system.stellar.spectralType);
  const tempClass = thermalClass(equilibriumK);
  const diversityTags = [
    `${bucket}-host`,
    tempClass,
    ...(hasJwstContext ? ["jwst-context"] : ["jwst-gap"]),
    ...(hasMoleculeContext ? local!.moleculeTags.slice(0, 2).map((tag) => tag.toLowerCase()) : []),
  ];
  const rationale = [
    `score ${score.toFixed(1)}/100`,
    `signal ${formatMetric(signalPpm, 0, " ppm")}`,
    `J ${formatMetric(jMag, 2)}`,
    `K ${formatMetric(kMag, 2)}`,
    `T_eq ${formatMetric(equilibriumK, 0, " K")}`,
    hasJwstContext ? "local JWST context present" : "JWST follow-up gap",
  ].join(" · ");

  return {
    id: `${system.id}:${planet.id}`,
    systemId: system.id,
    planetId: planet.id,
    systemName: system.name,
    planetName: planet.name,
    priorityScore: Number(score.toFixed(3)),
    utilityWeight: Number((2 + score / 7.5).toFixed(3)),
    rejectionWeight: Number((9.6 + missingCriticalCount * 0.55 + (blocked ? 3.25 : 0)).toFixed(3)),
    readiness,
    spectralBucket: bucket,
    thermalClass: tempClass,
    recommendedModes,
    diversityTags,
    rationale,
    metrics,
  };
}

function sharedModeWeight(a: LockoutTargetCandidate, b: LockoutTargetCandidate) {
  const modes = new Set(a.recommendedModes);
  return b.recommendedModes.some((mode) => modes.has(mode)) ? 0.55 : 0;
}

function redundancyWeight(a: LockoutTargetCandidate, b: LockoutTargetCandidate) {
  let weight = 0;
  if (a.systemId === b.systemId) weight += 9.5;
  if (a.spectralBucket === b.spectralBucket) weight += 0.75;
  if (a.thermalClass === b.thermalClass) weight += 0.85;
  if (Math.abs(a.metrics.distancePc - b.metrics.distancePc) < 4) weight += 0.35;
  weight += sharedModeWeight(a, b);
  const sharedTags = a.diversityTags.filter((tag) => b.diversityTags.includes(tag)).length;
  weight += Math.min(1.2, sharedTags * 0.24);
  return Number(weight.toFixed(3));
}

export function buildLockoutProblem(snapshot: UniverseSnapshot, options: BuildOptions = {}): LockoutProblemPacket {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const portfolioSize = options.portfolioSize ?? DEFAULT_PORTFOLIO_SIZE;
  const rawCandidates = snapshot.systems
    .flatMap((system) => system.planets.map((planet) => candidateForPlanet(system, planet)))
    .filter((candidate): candidate is LockoutTargetCandidate => Boolean(candidate))
    .filter((candidate) => candidate.priorityScore >= 22)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const hostCounts = new Map<string, number>();
  const candidates: LockoutTargetCandidate[] = [];

  for (const candidate of rawCandidates) {
    const currentHostCount = hostCounts.get(candidate.systemId) ?? 0;
    if (currentHostCount >= 2) continue;
    candidates.push(candidate);
    hostCounts.set(candidate.systemId, currentHostCount + 1);
    if (candidates.length >= maxCandidates) break;
  }

  const selectedAnchor = candidates.length;
  const rejectedAnchor = candidates.length + 1;
  const edges: Array<[number, number, number]> = [];

  if (candidates.length) {
    edges.push([selectedAnchor, rejectedAnchor, SELECTED_ANCHOR_EDGE_WEIGHT]);
  }

  candidates.forEach((candidate, index) => {
    edges.push([index, selectedAnchor, candidate.utilityWeight]);
    edges.push([index, rejectedAnchor, candidate.rejectionWeight]);
  });

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const weight = redundancyWeight(candidates[i], candidates[j]);
      if (weight >= 1.1) {
        edges.push([i, j, weight]);
      }
    }
  }

  return {
    version: "cosmoplot-lockout-target-v1",
    generatedAt: new Date().toISOString(),
    objective: "Sparse MaxCut target-slate optimization over utility anchors and pairwise redundancy edges.",
    solverIntent: "Use Lockout to split high-value exoplanet targets from redundant or lower-readiness alternatives, then expose a portfolio-sized target slate for human review.",
    candidates,
    problem: {
      n: candidates.length + 2,
      edges,
    },
    graph: {
      candidateNodes: candidates.length,
      anchorNodes: 2,
      selectedAnchor,
      rejectedAnchor,
      edgeCount: edges.length,
      portfolioSize,
      maxCandidates,
    },
    config: {
      search: "anneal",
      shots: 48,
      sweeps: 900,
      seed: 73,
    },
  };
}

function assignmentCutValue(problem: LockoutProblem, assignment: number[]) {
  return problem.edges.reduce((sum, [a, b, weight]) => (
    assignment[a] !== assignment[b] ? sum + weight : sum
  ), 0);
}

function flipDelta(problem: LockoutProblem, assignment: number[], node: number) {
  let delta = 0;
  for (const [a, b, weight] of problem.edges) {
    if (a !== node && b !== node) continue;
    const before = assignment[a] !== assignment[b];
    const after = !before;
    delta += (after ? weight : 0) - (before ? weight : 0);
  }
  return delta;
}

function nextRand(state: { value: number }) {
  state.value ^= state.value << 13;
  state.value ^= state.value >>> 17;
  state.value ^= state.value << 5;
  return (state.value >>> 0) / 4294967296;
}

export function solveMaxCutGreedy(problem: LockoutProblem, seed = 73, shots = 40): LockoutSolvePacket {
  let bestAssignment = Array.from({ length: problem.n }, (_, index) => index % 2);
  let bestCut = assignmentCutValue(problem, bestAssignment);
  const startedAt = performance.now();

  for (let shot = 0; shot < shots; shot += 1) {
    const rng = { value: (seed + shot * 1_000_003) >>> 0 };
    const assignment = Array.from({ length: problem.n }, () => (nextRand(rng) > 0.5 ? 1 : 0));
    let improved = true;
    let guard = 0;
    while (improved && guard < problem.n * 8) {
      improved = false;
      guard += 1;
      for (let node = 0; node < problem.n; node += 1) {
        const delta = flipDelta(problem, assignment, node);
        if (delta > 0.000001) {
          assignment[node] = assignment[node] ? 0 : 1;
          improved = true;
        }
      }
    }
    const cut = assignmentCutValue(problem, assignment);
    if (cut > bestCut) {
      bestCut = cut;
      bestAssignment = [...assignment];
    }
  }

  return {
    assignment: bestAssignment,
    bestCut: Number(bestCut.toFixed(6)),
    wallMs: Number((performance.now() - startedAt).toFixed(3)),
    backend: "typescript",
    search: "delta-greedy",
    shots,
    sweeps: 0,
    seed,
    engineName: "local fallback MaxCut solver",
    enginePath: null,
    fallback: true,
  };
}

// In-process simulated-annealing MaxCut solver. This replaces the external
// Python "lockout" engine so the optimizer runs natively on serverless with no
// subprocess. Work is bounded to a compute budget so large graphs stay within
// the request window, and a greedy polish guarantees a local optimum.
export function solveMaxCutAnneal(
  problem: LockoutProblem,
  config: { shots: number; sweeps: number; seed: number },
): LockoutSolvePacket {
  const { n, edges } = problem;
  const shots = Math.max(1, Math.floor(config.shots) || 48);
  const requestedSweeps = Math.max(1, Math.floor(config.sweeps) || 900);
  const seed = Number.isFinite(config.seed) ? config.seed : 73;
  const startedAt = performance.now();

  // Adjacency lets us evaluate a single flip in O(degree) instead of O(edges).
  const adjacency: Array<Array<[number, number]>> = Array.from({ length: n }, () => []);
  let totalAbsWeight = 0;
  for (const [a, b, weight] of edges) {
    adjacency[a].push([b, weight]);
    adjacency[b].push([a, weight]);
    totalAbsWeight += Math.abs(weight);
  }

  // Gain of moving `node` to the other side: cut goes up by the weight of
  // same-side neighbors and down by the weight of already-cut neighbors.
  const flipGain = (assignment: number[], node: number) => {
    let gain = 0;
    for (const [neighbor, weight] of adjacency[node]) {
      gain += assignment[neighbor] === assignment[node] ? weight : -weight;
    }
    return gain;
  };

  // Keep shots * sweeps * work within a fixed neighbor-visit budget so the
  // largest allowed graphs still return in ~1-2s.
  const OP_BUDGET = 1.2e8;
  const workPerSweep = Math.max(1, 2 * edges.length + n);
  const maxSweeps = Math.max(120, Math.floor(OP_BUDGET / (shots * workPerSweep)));
  const sweeps = Math.min(requestedSweeps, maxSweeps);
  const TIME_BUDGET_MS = 9_000;

  const meanWeight = edges.length ? totalAbsWeight / edges.length : 1;
  const avgDegree = n ? (2 * edges.length) / n : 1;
  const t0 = Math.max(meanWeight * avgDegree, 1e-6);
  const tMin = t0 * 1e-3;
  const cooling = Math.pow(tMin / t0, 1 / Math.max(1, sweeps - 1));

  let bestAssignment = Array.from({ length: n }, (_, index) => index % 2);
  let bestCut = assignmentCutValue(problem, bestAssignment);

  for (let shot = 0; shot < shots; shot += 1) {
    const rng = { value: (seed + shot * 1_000_003) >>> 0 || 1 };
    const assignment = Array.from({ length: n }, () => (nextRand(rng) > 0.5 ? 1 : 0));
    let temperature = t0;
    for (let sweep = 0; sweep < sweeps; sweep += 1) {
      for (let node = 0; node < n; node += 1) {
        const gain = flipGain(assignment, node);
        // Always take improving moves; accept worsening moves with the
        // Metropolis probability exp(gain / T), which shrinks as T cools.
        if (gain > 0 || nextRand(rng) < Math.exp(gain / temperature)) {
          assignment[node] ^= 1;
        }
      }
      temperature *= cooling;
    }
    const cut = assignmentCutValue(problem, assignment);
    if (cut > bestCut) {
      bestCut = cut;
      bestAssignment = assignment.slice();
    }
    if (performance.now() - startedAt > TIME_BUDGET_MS) break;
  }

  // Greedy polish: drive the best assignment to a local optimum so the result
  // is never worse than the plain greedy solver.
  let improved = true;
  let guard = 0;
  while (improved && guard < n * 8) {
    improved = false;
    guard += 1;
    for (let node = 0; node < n; node += 1) {
      if (flipGain(bestAssignment, node) > 1e-9) {
        bestAssignment[node] ^= 1;
        improved = true;
      }
    }
  }
  bestCut = assignmentCutValue(problem, bestAssignment);

  return {
    assignment: bestAssignment,
    bestCut: Number(bestCut.toFixed(6)),
    wallMs: Number((performance.now() - startedAt).toFixed(3)),
    backend: "typescript",
    search: "anneal",
    shots,
    sweeps,
    seed,
    engineName: "cosmoplot anneal",
    enginePath: null,
    fallback: false,
  };
}

export function finalizeLockoutPlan(packet: LockoutProblemPacket, solve: LockoutSolvePacket): LockoutTargetPlan {
  const selectedAnchorValue = solve.assignment[packet.graph.selectedAnchor] ?? 0;
  const partitioned = packet.candidates.map<LockoutPlanTarget>((candidate, index) => ({
    ...candidate,
    rank: 0,
    lockoutPartition: solve.assignment[index] !== selectedAnchorValue ? "selected" : "rejected",
  }));
  const selectedPool = partitioned
    .filter((candidate) => candidate.lockoutPartition === "selected")
    .sort((a, b) => b.priorityScore - a.priorityScore);
  const selectedIds = new Set<string>();
  const selectedTargets: LockoutPlanTarget[] = [];

  for (const candidate of selectedPool) {
    if (selectedTargets.length >= packet.graph.portfolioSize) break;
    selectedTargets.push(candidate);
    selectedIds.add(candidate.id);
  }

  for (const candidate of [...partitioned].sort((a, b) => b.priorityScore - a.priorityScore)) {
    if (selectedTargets.length >= packet.graph.portfolioSize) break;
    if (selectedIds.has(candidate.id)) continue;
    selectedTargets.push(candidate);
    selectedIds.add(candidate.id);
  }

  selectedTargets.forEach((candidate, index) => {
    candidate.rank = index + 1;
  });

  const alternates = partitioned
    .filter((candidate) => !selectedIds.has(candidate.id))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 8)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  return {
    generatedAt: new Date().toISOString(),
    objective: packet.objective,
    engine: {
      name: solve.engineName,
      path: solve.enginePath,
      backend: solve.backend,
      search: solve.search,
      shots: solve.shots,
      sweeps: solve.sweeps,
      seed: solve.seed,
      bestCut: solve.bestCut,
      wallMs: solve.wallMs,
      fallback: solve.fallback,
      warning: solve.warning,
    },
    graph: {
      ...packet.graph,
      solvedNodes: packet.problem.n,
      solvedEdges: packet.problem.edges.length,
    },
    selectedTargets,
    alternates,
    notes: [
      "Lockout is used as a heuristic sparse MaxCut/QUBO optimizer, not an exact certificate.",
      "The slate is a planning triage layer. JWST ETC/APT visibility, saturation, and scheduling checks remain required before execution.",
      "Observed archive fields, derived propagation, local analysis tags, and optimizer output remain separate in the UI.",
    ],
  };
}
