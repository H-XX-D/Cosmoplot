"use client";

import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import {
  ChartColumn,
  Crosshair,
  Database,
  House,
  Maximize2,
  Minimize2,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DISPLAY_LOG_SCALE, equatorialToCartesianPc, logScaledVector } from "@/lib/science/coordinates";
import { deriveMagnetosphereProxy, inferTidalLock } from "@/lib/science/physics";
import {
  PlanetGlobe,
  materializePlanetReference,
  renderPlanetSurface,
  resolvePlanetCalibrationAsset,
  type PlanetGlobeLiveView,
  type PlanetGlobeProps,
  type PlanetRegime,
} from "@/components/ui/planet-globe";
import { clamp, hsla, lerp } from "@/lib/utils";
import type { PlanetScienceBundle, RetentionAudit, SourceDescriptor, UniversePlanet, UniverseSnapshot, UniverseSystem, WhiteDwarfAnchor } from "@/lib/science/types";

type MetricKind = "observed" | "inferred" | "derived" | "source";

type Metric = {
  label: string;
  value: string;
  note: string;
  kind: MetricKind;
  provenance?: string;
  equation?: string;
};

type ChartRow = {
  label: string;
  value: number;
  max: number;
  note: string;
  hue: number;
  intervalLow?: number | null;
  intervalHigh?: number | null;
};

type Palette = {
  star: { h: number; s: number; l: number };
  planet: { h: number; s: number; l: number };
  accent: { h: number; s: number; l: number };
};

type PlanetPreviewAppearance = {
  regime: PlanetRegime;
  densityGcc: number | null;
  insolationEarth: number | null;
  cloudCover: number;
  bandCount: number;
  stormCount: number;
  tidalLock: boolean;
};

type CameraFlight = {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  startedAt: number;
  duration: number;
};

type DeepSkyKind = "emission" | "dark" | "molecular" | "planetary" | "supernova" | "galaxy" | "pulsar" | "blackHole" | "quasar";

type DeepSkyObject = {
  name: string;
  kind: DeepSkyKind;
  raDeg: number;
  decDeg: number;
  distancePc: number;
  sizePc: number;
  tint: string;
  accent: string;
  pulsePeriodSeconds?: number;
  massSolar?: number;
  sourceUrl?: string;
  artReferenceUrl?: string;
};

type ReferenceStar = {
  name: string;
  raDeg: number;
  decDeg: number;
  distancePc: number;
  spectralType: string;
  effectiveTemperatureK: number;
  radiusSolar: number;
  luminositySolar: number;
};

type StarRenderStyle = {
  core: string;
  rim: string;
  corona: string;
  halo: string;
  radiusScale: number;
  glowScale: number;
  glowOpacity: number;
  brightnessScale: number;
  morphologyBias: number;
};

type StageHover = {
  x: number;
  y: number;
  accent: string;
  title: string;
  lines: string[];
};

type PlanetViewSyncRef = {
  current: PlanetGlobeLiveView | null;
};

type FocusKind = "planet" | "system" | "deepSky" | "whiteDwarf" | "referenceStar";

type StageSelectionCommand =
  | { kind: "system"; key: string; nonce: number }
  | { kind: "deepSky"; key: string; nonce: number }
  | { kind: "whiteDwarf"; key: string; nonce: number }
  | { kind: "referenceStar"; key: string; nonce: number };

type GuidedTarget =
  | {
      kind: "planet";
      id: string;
      label: string;
      eyebrow: string;
      note: string;
      query: string;
      systemId: string;
      planetId: string;
    }
  | {
      kind: "deepSky";
      id: string;
      label: string;
      eyebrow: string;
      note: string;
      query: string;
      name: string;
    };

type ChartPreset = "all" | "temperateCandidates" | "gasGiants50Ly";

type AdvancedStageFilters = {
  minFlux: number;
  maxFlux: number;
  minTemp: number;
  maxTemp: number;
  minGravity: number;
  maxGravity: number;
  minRadius: number;
  maxRadius: number;
  requireWater: boolean;
  requireJwst: boolean;
  requireStudied: boolean;
  requireInteresting: boolean;
  uncertaintyMode: "median" | "propagated";
};

const DEFAULT_ADVANCED_STAGE_FILTERS: AdvancedStageFilters = {
  minFlux: 0,
  maxFlux: 120,
  minTemp: 0,
  maxTemp: 2200,
  minGravity: 0,
  maxGravity: 120,
  minRadius: 0,
  maxRadius: 25,
  requireWater: false,
  requireJwst: false,
  requireStudied: false,
  requireInteresting: false,
  uncertaintyMode: "median",
};

const FIFTY_LIGHT_YEARS_PC = 50 / 3.26156;

const CHART_PRESETS: Array<{ id: ChartPreset; label: string; eyebrow: string; note: string }> = [
  {
    id: "all",
    label: "All chart points",
    eyebrow: "Full chart",
    note: "Show the complete local snapshot again.",
  },
  {
    id: "temperateCandidates",
    label: "Temperate candidates",
    eyebrow: "Possible habitability",
    note: "Show Earth-size to sub-Neptune worlds with temperate flux or equilibrium temperature. This is a triage view, not a habitability claim.",
  },
  {
    id: "gasGiants50Ly",
    label: "Gas giants within 50 ly",
    eyebrow: "Giant worlds",
    note: "Show giant-planet systems whose host-star centers are within 50 light-years of the Sun.",
  },
];

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "object";
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function metricRowsToCsv(section: string, metrics: Metric[]) {
  return metrics.map((metric) => [
    section,
    metric.kind,
    metric.label,
    metric.value,
    metric.note,
    metric.provenance ?? "",
    metric.equation ?? "",
  ]);
}

function chartRowsToCsv(rows: ChartRow[]) {
  return rows.map((row) => [
    "chart",
    row.label,
    row.value,
    row.max,
    row.note,
    row.intervalLow ?? "",
    row.intervalHigh ?? "",
  ]);
}

function focusObjectNoun(focusKind: FocusKind | null) {
  switch (focusKind) {
    case "deepSky":
      return "deep-sky object";
    case "whiteDwarf":
      return "white dwarf";
    case "referenceStar":
      return "reference star";
    case "system":
      return "system";
    default:
      return "planet";
  }
}

function observedSectionTitle(focusKind: FocusKind | null) {
  switch (focusKind) {
    case "deepSky":
      return "Observed Deep-Sky Inputs";
    case "whiteDwarf":
      return "Observed White-Dwarf Inputs";
    case "referenceStar":
      return "Observed Stellar Inputs";
    case "system":
      return "Observed System Inputs";
    default:
      return "Observed Inputs";
  }
}

function derivedSectionTitle(focusKind: FocusKind | null) {
  switch (focusKind) {
    case "deepSky":
      return "Derived Spatial Context";
    case "whiteDwarf":
      return "Derived Degenerate-Star Context";
    case "referenceStar":
      return "Derived Stellar Context";
    case "system":
      return "Derived System Context";
    default:
      return "Inferred / Model-Derived";
  }
}

function uncertaintySectionTitle(focusKind: FocusKind | null) {
  switch (focusKind) {
    case "deepSky":
      return "Catalog Confidence Notes";
    case "whiteDwarf":
      return "White-Dwarf Uncertainty Notes";
    case "referenceStar":
      return "Reference-Star Uncertainty Notes";
    default:
      return "Formal Uncertainty Propagation";
  }
}

function planningSectionTitle(focusKind: FocusKind | null) {
  switch (focusKind) {
    case "deepSky":
      return "Deep-Sky Planning Context";
    case "whiteDwarf":
      return "Degenerate-Star Planning Context";
    case "referenceStar":
      return "Reference-Star Planning Context";
    default:
      return "Observation Planning Output";
  }
}

function chartsSectionTitle(focusKind: FocusKind | null) {
  switch (focusKind) {
    case "deepSky":
      return "Deep-Sky Chart Stack";
    case "whiteDwarf":
      return "White-Dwarf Chart Stack";
    case "referenceStar":
      return "Reference-Star Chart Stack";
    case "system":
      return "System Chart Stack";
    default:
      return "Science Chart Stack";
  }
}

function analysisSectionTitle(focusKind: FocusKind | null) {
  switch (focusKind) {
    case "deepSky":
      return "Deep-Sky Analysis";
    case "whiteDwarf":
      return "White-Dwarf Analysis";
    case "referenceStar":
      return "Reference-Star Analysis";
    case "system":
      return "System Analysis";
    default:
      return "Full Maximal Analysis";
  }
}

function analysisSectionSubtitle(focusKind: FocusKind | null) {
  switch (focusKind) {
    case "deepSky":
      return "Catalog and scene context retained under the map";
    case "whiteDwarf":
      return "Degenerate-star lab context retained under the map";
    case "referenceStar":
      return "Reference-star context retained under the map";
    case "system":
      return "System-level narrative retained under the map";
    default:
      return "Science-side narrative retained under the map";
  }
}

const WORLD_X_AXIS = new THREE.Vector3(1, 0, 0);
const WORLD_Y_AXIS = new THREE.Vector3(0, 1, 0);

const DEEP_SKY_CATALOG: DeepSkyObject[] = [
  { name: "Orion Nebula", kind: "emission", raDeg: 83.8208, decDeg: -5.3911, distancePc: 460, sizePc: 7.4, tint: "#46d7ff", accent: "#ff8a4d" },
  { name: "Horsehead Nebula", kind: "dark", raDeg: 85.2541, decDeg: -2.4533, distancePc: 399, sizePc: 3.2, tint: "#6ab8ff", accent: "#23150f" },
  { name: "Taurus Molecular Cloud", kind: "molecular", raDeg: 66.1989, decDeg: 26.9349, distancePc: 138, sizePc: 12, tint: "#8ab7ff", accent: "#3e291e" },
  { name: "Rho Ophiuchi Cloud", kind: "molecular", raDeg: 246.78, decDeg: -24.48, distancePc: 131, sizePc: 12, tint: "#6ee7ff", accent: "#d18a54" },
  { name: "California Nebula", kind: "emission", raDeg: 60.926, decDeg: 36.378, distancePc: 470, sizePc: 18, tint: "#53d7ff", accent: "#ff8e7b" },
  { name: "Rosette Nebula", kind: "emission", raDeg: 97.6748, decDeg: 4.9979, distancePc: 1594, sizePc: 30, tint: "#6be7ff", accent: "#ff8e74" },
  { name: "Lagoon Nebula", kind: "emission", raDeg: 270.9042, decDeg: -24.3867, distancePc: 1226, sizePc: 19, tint: "#5fd8ff", accent: "#ff9c70" },
  { name: "Trifid Nebula", kind: "emission", raDeg: 270.925, decDeg: -23.0145, distancePc: 1680, sizePc: 10, tint: "#63dbff", accent: "#ff8f6c" },
  { name: "Eagle Nebula", kind: "emission", raDeg: 274.7, decDeg: -13.8067, distancePc: 2000, sizePc: 21, tint: "#56deff", accent: "#ffb36a" },
  { name: "Crab Nebula", kind: "supernova", raDeg: 83.6335, decDeg: 22.0151, distancePc: 1993, sizePc: 4, tint: "#6bd5ff", accent: "#ffb35a" },
  { name: "Helix Nebula", kind: "planetary", raDeg: 337.4185, decDeg: -20.8397, distancePc: 215, sizePc: 1.8, tint: "#4ce0ff", accent: "#9effd3" },
  { name: "Andromeda Galaxy", kind: "galaxy", raDeg: 10.6847, decDeg: 41.2687, distancePc: 778000, sizePc: 45000, tint: "#7bc6ff", accent: "#ffe1b3" },
  { name: "Triangulum Galaxy", kind: "galaxy", raDeg: 23.4621, decDeg: 30.6599, distancePc: 857000, sizePc: 30000, tint: "#69cfff", accent: "#ffd89d" },
  { name: "Large Magellanic Cloud", kind: "galaxy", raDeg: 80.8942, decDeg: -69.7561, distancePc: 49970, sizePc: 9000, tint: "#78d2ff", accent: "#fff0bf" },
  { name: "Small Magellanic Cloud", kind: "galaxy", raDeg: 13.1866, decDeg: -72.8286, distancePc: 61700, sizePc: 7000, tint: "#8cd8ff", accent: "#fff2c2" },
  {
    name: "Whirlpool Galaxy",
    kind: "galaxy",
    raDeg: 202.4696,
    decDeg: 47.1952,
    distancePc: 8580000,
    sizePc: 76000,
    tint: "#82d4ff",
    accent: "#ffe1b8",
    sourceUrl: "https://science.nasa.gov/asset/hubble/the-whirlpool-galaxy-m51/",
    artReferenceUrl: "https://science.nasa.gov/asset/hubble/the-whirlpool-galaxy-m51/",
  },
  {
    name: "Sombrero Galaxy",
    kind: "galaxy",
    raDeg: 189.9975,
    decDeg: -11.6231,
    distancePc: 9550000,
    sizePc: 49000,
    tint: "#95d7ff",
    accent: "#ffe6b7",
    sourceUrl: "https://science.nasa.gov/asset/hubble/sombrero-galaxy/",
    artReferenceUrl: "https://science.nasa.gov/asset/hubble/sombrero-galaxy/",
  },
  {
    name: "M87 Galaxy",
    kind: "galaxy",
    raDeg: 187.7059,
    decDeg: 12.3911,
    distancePc: 16800000,
    sizePc: 120000,
    tint: "#8fd4ff",
    accent: "#ffe0b6",
    sourceUrl: "https://science.nasa.gov/asset/hubble/m87",
    artReferenceUrl: "https://science.nasa.gov/asset/hubble/m87",
  },
  { name: "Vela Pulsar", kind: "pulsar", raDeg: 128.8369, decDeg: -45.1764, distancePc: 287, sizePc: 0.8, tint: "#8ac8ff", accent: "#d9f0ff", pulsePeriodSeconds: 0.0893 },
  { name: "Geminga", kind: "pulsar", raDeg: 98.4756, decDeg: 17.7703, distancePc: 250, sizePc: 0.7, tint: "#87beff", accent: "#f0f8ff", pulsePeriodSeconds: 0.237 },
  { name: "PSR B1257+12", kind: "pulsar", raDeg: 194.546, decDeg: 12.682, distancePc: 710, sizePc: 0.7, tint: "#90c2ff", accent: "#edf6ff", pulsePeriodSeconds: 0.00622 },
  {
    name: "Sagittarius A*",
    kind: "blackHole",
    raDeg: 266.4168,
    decDeg: -29.0078,
    distancePc: 7940,
    sizePc: 2.4,
    tint: "#82c4ff",
    accent: "#ffb36d",
    massSolar: 4150000,
    sourceUrl: "https://science.nasa.gov/universe/black-holes/sagittarius-a/",
    artReferenceUrl: "https://science.nasa.gov/asset/webb/flaring-disk-around-milky-ways-black-hole-artists-concept",
  },
  {
    name: "Cygnus X-1",
    kind: "blackHole",
    raDeg: 299.5903,
    decDeg: 35.2016,
    distancePc: 1860,
    sizePc: 1.2,
    tint: "#88c2ff",
    accent: "#ff905c",
    massSolar: 21.2,
    sourceUrl: "https://science.nasa.gov/universe/black-holes/cygnus-x-1/",
    artReferenceUrl: "https://science.nasa.gov/asset/webb/black-hole-cygnus-x-1-illustration/",
  },
  {
    name: "3C 273",
    kind: "quasar",
    raDeg: 187.2779,
    decDeg: 2.0524,
    distancePc: 749000000,
    sizePc: 180,
    tint: "#a6d2ff",
    accent: "#fff1d0",
    massSolar: 886000000,
    sourceUrl: "https://science.nasa.gov/asset/webb/quasar-illustration/",
    artReferenceUrl: "https://science.nasa.gov/asset/webb/quasar-illustration/",
  },
];

const REFERENCE_STAR_CATALOG: ReferenceStar[] = [
  { name: "Sirius A", raDeg: 101.2872, decDeg: -16.7161, distancePc: 2.64, spectralType: "A1V", effectiveTemperatureK: 9940, radiusSolar: 1.71, luminositySolar: 25.4 },
  { name: "Procyon A", raDeg: 114.8255, decDeg: 5.225, distancePc: 3.51, spectralType: "F5IV-V", effectiveTemperatureK: 6530, radiusSolar: 2.05, luminositySolar: 6.9 },
  { name: "Altair", raDeg: 297.6958, decDeg: 8.8683, distancePc: 5.13, spectralType: "A7V", effectiveTemperatureK: 7550, radiusSolar: 1.79, luminositySolar: 10.6 },
  { name: "Vega", raDeg: 279.2347, decDeg: 38.7837, distancePc: 7.68, spectralType: "A0V", effectiveTemperatureK: 9600, radiusSolar: 2.36, luminositySolar: 40.1 },
  { name: "Fomalhaut", raDeg: 344.4128, decDeg: -29.6222, distancePc: 7.7, spectralType: "A3V", effectiveTemperatureK: 8590, radiusSolar: 1.84, luminositySolar: 16.6 },
  { name: "Denebola", raDeg: 177.2649, decDeg: 14.5721, distancePc: 11.14, spectralType: "A3V", effectiveTemperatureK: 8420, radiusSolar: 1.73, luminositySolar: 14.1 },
  { name: "Beta Pictoris", raDeg: 86.8212, decDeg: -51.0665, distancePc: 19.44, spectralType: "A6V", effectiveTemperatureK: 8052, radiusSolar: 1.53, luminositySolar: 8.7 },
  { name: "Regulus", raDeg: 152.0936, decDeg: 11.9672, distancePc: 24.3, spectralType: "B8IVn", effectiveTemperatureK: 12130, radiusSolar: 3.8, luminositySolar: 288 },
];

const nebulaTextureCache = new Map<string, THREE.CanvasTexture>();
const DEEP_SKY_ART: Partial<Record<string, string>> = {
  "Orion Nebula": "/assets/deep-sky/orion-nebula.jpg",
  "Horsehead Nebula": "/assets/deep-sky/horsehead-nebula.png",
  "Taurus Molecular Cloud": "/assets/deep-sky/rho-ophiuchi.png",
  "Rho Ophiuchi Cloud": "/assets/deep-sky/rho-ophiuchi.png",
  "California Nebula": "/assets/deep-sky/rosette-nebula.png",
  "Rosette Nebula": "/assets/deep-sky/rosette-nebula.png",
  "Lagoon Nebula": "/assets/deep-sky/lagoon-nebula.jpg",
  "Trifid Nebula": "/assets/deep-sky/trifid-nebula.jpg",
  "Eagle Nebula": "/assets/deep-sky/eagle-nebula.png",
  "Crab Nebula": "/assets/deep-sky/crab-nebula.png",
  "Helix Nebula": "/assets/deep-sky/helix-nebula.jpg",
  "Whirlpool Galaxy": "/assets/deep-sky/whirlpool-galaxy.jpg",
  "Sombrero Galaxy": "/assets/deep-sky/sombrero-galaxy.png",
  "M87 Galaxy": "/assets/deep-sky/m87-galaxy.jpeg",
  "Sagittarius A*": "/assets/deep-sky/sagittarius-a-star.png",
  "Cygnus X-1": "/assets/deep-sky/cygnus-x1-black-hole.png",
  "3C 273": "/assets/deep-sky/quasar-illustration.png",
};

const STAR_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DISTANT_STAR_FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;

  uniform float uTime;
  uniform float uMorphology;
  uniform float uWarmth;
  uniform vec3 uCoreColor;
  uniform vec3 uRimColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rot = mat2(1.7, 1.2, -1.2, 1.7);
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p = rot * p * 1.92;
      amplitude *= 0.54;
    }
    return value;
  }

  vec3 blendMultiply(vec3 base, vec3 blend) {
    return base * blend;
  }

  vec3 blendColorDodge(vec3 base, vec3 blend) {
    return min(base / max(vec3(0.001), vec3(1.0) - blend), vec3(1.6));
  }

  vec3 blendColorBurn(vec3 base, vec3 blend) {
    return max(vec3(0.0), vec3(1.0) - ((vec3(1.0) - base) / max(vec3(0.001), blend)));
  }

  vec3 blendSubtract(vec3 base, vec3 blend) {
    return max(base - blend, vec3(0.0));
  }

  void main() {
    vec2 wobbleA = vec2(
      sin(uTime * 0.16 + vUv.y * 16.0) + sin(uTime * 0.09 + vUv.x * 10.0),
      cos(uTime * 0.13 + vUv.x * 14.0) + sin(uTime * 0.07 + vUv.y * 12.0)
    ) * 0.045;
    vec2 wobbleB = vec2(
      sin(uTime * 0.12 + vUv.x * 19.0) - cos(uTime * 0.08 + vUv.y * 17.0),
      cos(uTime * 0.11 + vUv.y * 21.0) + sin(uTime * 0.06 + vUv.x * 23.0)
    ) * 0.032;
    vec2 flow = vec2(
      fbm(vUv * 14.0 + wobbleA + vec2(2.4, -1.7)),
      fbm(vUv * 22.0 + wobbleB + vec2(-3.1, 4.6))
    ) - 0.5;
    float convection = fbm(vUv * 12.0 + flow * 1.28 + wobbleA * 1.8);
    float granulation = fbm(vUv * 26.0 + flow * 2.0 + wobbleB * 2.2);
    float subGranulation = fbm(vUv * 58.0 + flow * 3.2 + wobbleA * 2.8 + wobbleB * 1.2);
    float sparkle = noise(vUv * 34.0 + flow * 2.2 + wobbleB * 2.4 + vec2(13.4, 0.0));
    float pits = smoothstep(0.6, 0.9, fbm(vUv * 16.0 + flow * 1.55 + wobbleA * 2.1 + vec2(7.2, 0.0)));
    float microPits = smoothstep(0.68, 0.95, fbm(vUv * 74.0 + flow * 3.5 + wobbleB * 3.2));
    float spotSeed = fbm(vUv * 5.6 + flow * 0.7 + vec2(41.0, -17.0));
    float spotScatter = fbm(vUv * 9.4 - flow * 1.1 + vec2(-23.0, 58.0));
    float spotClusterMask = smoothstep(0.72, 0.9, spotSeed) * smoothstep(0.48, 0.82, spotScatter);
    float spotVoid = smoothstep(0.62, 0.94, fbm(vUv * 3.2 + vec2(91.0, -73.0)));
    float ember = smoothstep(0.52, 0.9, fbm(vUv * 22.0 + flow * 2.0 + wobbleA * 1.7 + vec2(17.6, -3.1)));
    float shadow = smoothstep(0.56, 0.92, fbm(vUv * 40.0 + flow * 2.8 + wobbleB * 2.4 + vec2(9.8, 2.4)));
    float ridge = pow(abs(fbm(vUv * 46.0 - flow * 2.6 + wobbleA * 2.3 - wobbleB * 1.2) - 0.5) * 2.0, 1.18);
    float faculae = smoothstep(0.56, 0.9, fbm(vUv * 52.0 + flow * 2.35 + wobbleB * 2.0 + vec2(5.7, -7.4)));
    float orangeVeins = smoothstep(0.52, 0.92, fbm(vUv * 82.0 + flow * 4.1 + wobbleA * 3.4 + vec2(4.6, 1.8)));
    float facing = clamp(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    float limb = pow(1.0 - facing, 1.58);
    float coreHotspot = pow(max(0.0, 1.0 - distance(vUv, vec2(0.5)) * 2.0), 4.2);
    float coolBias = clamp(uMorphology, 0.0, 1.0);
    float hotBias = 1.0 - coolBias;
    float warmth = clamp(uWarmth, 0.0, 1.0);
    float spotPresence = clamp(spotClusterMask * (1.0 - spotVoid * 0.58), 0.0, 1.0);
    pits *= mix(0.28, 1.08, coolBias) * spotPresence;
    shadow *= mix(0.56, 1.06, coolBias) * mix(0.42, 1.0, spotPresence);
    microPits *= mix(0.22, 1.16, coolBias) * spotPresence;
    ridge *= mix(0.78, 1.08, coolBias);
    faculae *= mix(1.16, 0.82, coolBias);
    orangeVeins *= mix(1.04, 0.82, coolBias) * warmth;
    vec3 emberTone = mix(
      mix(
        mix(vec3(1.0, 0.66, 0.24), vec3(0.94, 0.4, 0.12), pits * 0.4),
        mix(uCoreColor, uRimColor, 0.4),
        1.0 - warmth
      ),
      mix(vec3(0.9, 0.95, 1.0), vec3(0.74, 0.84, 1.0), pits * 0.3),
      hotBias * 0.82
    );
    vec3 burnTone = mix(
      uRimColor,
      mix(
        mix(vec3(1.0, 0.5, 0.18), uRimColor, 1.0 - warmth),
        vec3(0.76, 0.86, 1.0),
        hotBias * 0.82
      ),
      0.24
    );
    vec3 textureTone = mix(
      mix(vec3(0.76, 0.62, 0.5), vec3(0.76, 0.78, 0.88), 1.0 - warmth),
      vec3(0.82, 0.88, 1.0),
      hotBias * 0.9
    );
    float pulse = 0.96 + 0.04 * sin(uTime * 1.25 + fbm(vUv * 7.0 + flow * 1.6) * 6.28318);

    vec3 color = mix(uCoreColor, uRimColor, clamp(limb * 0.94 + (1.0 - convection) * 0.08, 0.0, 1.0));
    color *= 0.9 + convection * 0.07 + granulation * mix(0.08, 0.16, coolBias) + subGranulation * mix(0.04, 0.12, coolBias);
    color = mix(color, blendMultiply(color, textureTone - shadow * 0.1 - ridge * 0.04), mix(0.04, 0.1, coolBias));
    color = mix(color, blendMultiply(color, vec3(0.88, 0.82, 0.74) - subGranulation * 0.06), mix(0.01, 0.05, coolBias));
    color = mix(color, blendSubtract(color, vec3(pits * 0.12 + microPits * 0.1 + shadow * 0.08)), mix(0.12, 0.26, coolBias));
    color = mix(color, blendColorBurn(color, burnTone), ember * 0.12 + pits * 0.173 + microPits * 0.146);
    color = mix(color, blendColorBurn(color, vec3(0.82 - shadow * 0.24 - ridge * 0.16 - pits * 0.12 - microPits * 0.106)), mix(0.213, 0.4, coolBias));
    color = mix(color, blendColorDodge(color, vec3(0.15 + faculae * 0.3 + sparkle * 0.125)), 0.275);
    color = mix(color, blendColorDodge(color, emberTone), ember * 0.125 + orangeVeins * 0.1);
    color *= 1.0 - pits * 0.16 - microPits * 0.12;
    color = mix(color, blendColorDodge(color, vec3(coreHotspot * 0.2125 + sparkle * 0.0875 + faculae * 0.125)), 0.2);
    color += uCoreColor * coreHotspot * 0.075 + emberTone * orangeVeins * 0.04;
    color *= (1.01 - limb * 0.02) * pulse;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const CORONA_FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;

  uniform float uTime;
  uniform vec3 uColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float rays(vec2 uv, float time) {
    vec2 p = uv - 0.5;
    float angle = atan(p.y, p.x);
    float radius = length(p);
    float spokeA = 0.5 + 0.5 * sin(angle * 10.0 + time * 0.9);
    float spokeB = 0.5 + 0.5 * sin(angle * 18.0 - time * 0.6 + noise(vec2(angle * 3.0, radius * 8.0)) * 2.4);
    float plumeMask = smoothstep(0.14, 0.88, radius) * (1.0 - smoothstep(0.7, 1.18, radius));
    return max(spokeA * 0.7, spokeB) * plumeMask;
  }

  void main() {
    vec2 centeredUv = vUv - 0.5;
    float radius = length(centeredUv);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.4);
    float flicker = noise(vUv * 8.0 + vec2(uTime * 0.05, -uTime * 0.04));
    float plume = noise(vUv * 22.0 - vec2(uTime * 0.11, uTime * 0.07));
    float rayField = rays(vUv, uTime);
    float shell = smoothstep(0.42, 0.94, radius) * (1.0 - smoothstep(0.84, 1.2, radius));
    float alpha = (fresnel * (0.12 + flicker * 0.08 + plume * 0.06) + rayField * 0.14 * shell) * smoothstep(0.28, 0.92, radius);
    vec3 coronaColor = mix(uColor, vec3(1.0), 0.08 + rayField * 0.06 + plume * 0.04);
    gl_FragColor = vec4(coronaColor, alpha);
  }
`;

const ACTIVE_SYSTEM_DAYS_PER_SECOND = 2.6;

function threeColor(color: Palette["star"], lightnessOffset = 0) {
  return new THREE.Color().setHSL(color.h / 360, clamp(color.s, 0, 100) / 100, clamp(color.l + lightnessOffset, 0, 100) / 100);
}

function scienceKey(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function findPlanetTarget(snapshot: UniverseSnapshot, planetName: string) {
  const targetKey = scienceKey(planetName);
  for (const system of snapshot.systems) {
    const planet = system.planets.find((entry) => scienceKey(entry.name) === targetKey);
    if (planet) {
      return { system, planet };
    }
  }
  return null;
}

function buildGuidedTargets(snapshot: UniverseSnapshot): GuidedTarget[] {
  const targets: GuidedTarget[] = [];
  const addPlanet = (planetName: string, eyebrow: string, note: string, query: string) => {
    const found = findPlanetTarget(snapshot, planetName);
    if (!found) return;
    targets.push({
      kind: "planet",
      id: `planet:${found.planet.id}`,
      label: found.planet.name,
      eyebrow,
      note,
      query,
      systemId: found.system.id,
      planetId: found.planet.id,
    });
  };

  addPlanet("Earth", "Home fix", "Start with a known world and see how observed, derived, and inferred labels differ.", "Earth");
  addPlanet("Proxima Cen b", "Nearest exoplanet fix", "Plot a nearby rocky target with propagated flux, temperature, and archive provenance.", "Proxima");
  addPlanet("TRAPPIST-1 e", "Compact-system fix", "Plot a well-known temperate target in a crowded M-dwarf system.", "TRAPPIST-1");
  addPlanet("L 98-59 d", "Optimizer fix", "Plot a nearby candidate that usually appears high in the follow-up shortlist.", "L 98-59");

  const orion = DEEP_SKY_CATALOG.find((entry) => entry.name === "Orion Nebula");
  if (orion) {
    targets.push({
      kind: "deepSky",
      id: `deepSky:${orion.name}`,
      label: orion.name,
      eyebrow: "Deep-sky fix",
      note: "Switch from exoplanets to a visible nebula and compare how the chart panel changes.",
      query: "",
      name: orion.name,
    });
  }

  return targets.slice(0, 5);
}

function planetMedianRadius(planet: UniversePlanet) {
  return planet.propagation?.radiusEarth.median ?? planet.radiusEarth;
}

function planetMedianFlux(system: UniverseSystem, planet: UniversePlanet) {
  return planet.propagation?.fluxEarthMultiple.median ?? insolationEarth(system, planet);
}

function planetMedianTemperature(planet: UniversePlanet) {
  return planet.propagation?.equilibriumK.median ?? planet.equilibriumK;
}

function isTemperateCandidateWorld(system: UniverseSystem, planet: UniversePlanet) {
  if (system.id === "sun") return false;
  const radius = planetMedianRadius(planet);
  const flux = planetMedianFlux(system, planet);
  const temperature = planetMedianTemperature(planet);
  const sizeCandidate = radius !== null && radius <= 2.4;
  const fluxCandidate = flux !== null && flux >= 0.25 && flux <= 2.2;
  const temperatureCandidate = temperature !== null && temperature >= 180 && temperature <= 340;
  return sizeCandidate && (fluxCandidate || temperatureCandidate);
}

function isGasGiantWorld(planet: UniversePlanet) {
  const radius = planetMedianRadius(planet);
  return radius !== null ? radius >= 4 : planetClass(planet) === "gas giant";
}

function planetMatchesChartPreset(system: UniverseSystem, planet: UniversePlanet, preset: ChartPreset) {
  if (preset === "all") return true;
  if (preset === "temperateCandidates") return isTemperateCandidateWorld(system, planet);
  return system.distancePc <= FIFTY_LIGHT_YEARS_PC && isGasGiantWorld(planet);
}

function systemMatchesChartPreset(system: UniverseSystem, preset: ChartPreset) {
  if (preset === "all") return true;
  return system.planets.some((planet) => planetMatchesChartPreset(system, planet, preset));
}

function firstPlanetForChartPreset(systems: UniverseSystem[], preset: ChartPreset) {
  const orderedSystems = preset === "all"
    ? systems
    : [
        ...systems.filter((system) => system.id !== "sun"),
        ...systems.filter((system) => system.id === "sun"),
      ];
  for (const system of orderedSystems) {
    const planet = system.planets.find((entry) => planetMatchesChartPreset(system, entry, preset));
    if (planet) return { system, planet };
  }
  return null;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function hashUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function hexToRgba(hex: string, alpha: number) {
  const color = new THREE.Color(hex);
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function mixHexColors(fromHex: string, toHex: string, amount: number) {
  const mixed = new THREE.Color(fromHex);
  mixed.lerp(new THREE.Color(toHex), clamp(amount, 0, 1));
  return `#${mixed.getHexString()}`;
}

function tuneHexColor(hex: string, lightnessOffset = 0, saturationScale = 1) {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, clamp(hsl.s * saturationScale, 0, 1), clamp(hsl.l + lightnessOffset, 0, 1));
  return `#${color.getHexString()}`;
}

function kelvinHexColor(teff: number | null, fallback = "#ffd18a") {
  if (!teff || Number.isNaN(teff)) return fallback;
  const temperature = clamp(teff, 1000, 40000) / 100;
  let red: number;
  let green: number;
  let blue: number;
  if (temperature <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temperature) - 161.1195681661;
    blue = temperature <= 19 ? 0 : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(temperature - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temperature - 60, -0.0755148492);
    blue = 255;
  }
  const color = new THREE.Color(
    clamp(red, 0, 255) / 255,
    clamp(green, 0, 255) / 255,
    clamp(blue, 0, 255) / 255,
  );
  return `#${color.getHexString()}`;
}

function extendedObjectDisplaySize(distancePc: number, sizePc: number) {
  const size = Math.max(Number(sizePc) || 0.2, 0.2);
  const distance = Math.max(Number(distancePc) || 0.5, size * 0.55);
  const near = Math.max(0.001, distance - size * 0.5);
  const far = distance + size * 0.5;
  return clamp((Math.log10(1 + far) - Math.log10(1 + near)) * DISPLAY_LOG_SCALE * 11.5, 1.8, 18);
}

function deepSkyKindLabel(kind: DeepSkyKind) {
  switch (kind) {
    case "dark":
      return "Dark nebula";
    case "molecular":
      return "Molecular cloud";
    case "planetary":
      return "Planetary nebula";
    case "supernova":
      return "Supernova remnant";
    case "galaxy":
      return "Nearby galaxy";
    case "pulsar":
      return "Pulsar";
    case "blackHole":
      return "Black-hole system";
    case "quasar":
      return "Quasar";
    default:
      return "Emission nebula";
  }
}

function getNebulaTexture(entry: DeepSkyObject) {
  const key = [
    "__cosmoplot_nebula_v1__",
    entry.name,
    entry.kind,
    entry.tint,
    entry.accent,
  ].join("_");
  const cached = nebulaTextureCache.get(key);
  if (cached) return cached;

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    nebulaTextureCache.set(key, fallback);
    return fallback;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  nebulaTextureCache.set(key, texture);

  const artPath = DEEP_SKY_ART[entry.name];
  if (artPath) {
    const image = new Image();
    image.src = artPath;
    image.onload = () => {
      ctx.clearRect(0, 0, size, size);
      const width = image.naturalWidth || image.width || size;
      const height = image.naturalHeight || image.height || size;
      const scale = Math.max(size / width, size / height);
      const drawWidth = width * scale;
      const drawHeight = height * scale;
      const dx = (size - drawWidth) * 0.5;
      const dy = (size - drawHeight) * 0.5;

      ctx.save();
      ctx.filter =
        entry.kind === "dark" || entry.kind === "molecular"
          ? "saturate(1.08) contrast(1.16) brightness(0.86)"
          : entry.kind === "blackHole" || entry.kind === "quasar"
            ? "saturate(1.22) contrast(1.18) brightness(1.02)"
          : entry.kind === "supernova"
            ? "saturate(1.24) contrast(1.14) brightness(1.02)"
            : "saturate(1.2) contrast(1.12) brightness(0.98)";
      ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const colorWash = ctx.createRadialGradient(size * 0.42, size * 0.42, size * 0.06, size * 0.5, size * 0.5, size * 0.48);
      colorWash.addColorStop(0, hexToRgba(entry.tint, entry.kind === "dark" ? 0.08 : 0.18));
      colorWash.addColorStop(0.45, hexToRgba(entry.accent, entry.kind === "molecular" ? 0.08 : 0.12));
      colorWash.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = colorWash;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      const mask = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.08, size * 0.5, size * 0.5, size * (entry.kind === "dark" || entry.kind === "molecular" ? 0.47 : 0.49));
      mask.addColorStop(0, "rgba(255,255,255,1)");
      mask.addColorStop(0.54, "rgba(255,255,255,0.88)");
      mask.addColorStop(0.84, "rgba(255,255,255,0.28)");
      mask.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      texture.needsUpdate = true;
    };

    image.onerror = () => {
      texture.needsUpdate = true;
    };

    return texture;
  }

  const cx = size / 2;
  const cy = size / 2;
  const seed = hashUnit(key);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(cx, cy);

  if (entry.kind === "pulsar") {
    const halo = ctx.createRadialGradient(0, 0, size * 0.02, 0, 0, size * 0.22);
    halo.addColorStop(0, hexToRgba(entry.accent, 0.95));
    halo.addColorStop(0.25, hexToRgba(entry.tint, 0.82));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = hexToRgba(entry.accent, 0.72);
    for (let ray = 0; ray < 10; ray += 1) {
      const angle = (Math.PI * 2 * ray) / 10 + seed * Math.PI * 0.6;
      const inner = size * 0.05;
      const outer = size * (ray % 2 === 0 ? 0.4 : 0.28);
      ctx.lineWidth = ray % 2 === 0 ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  } else if (entry.kind === "galaxy") {
    const glow = ctx.createRadialGradient(0, 0, size * 0.02, 0, 0, size * 0.42);
    glow.addColorStop(0, hexToRgba(entry.accent, 0.24));
    glow.addColorStop(0.42, hexToRgba(entry.tint, 0.16));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fill();

    const arms = entry.name.includes("Magellanic") ? 2 : 4;
    for (let arm = 0; arm < arms; arm += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 220; step += 1) {
        const t = step / 220;
        const angle = arm * ((Math.PI * 2) / arms) + t * 3.8 + seed * 0.7;
        const radius = size * (0.04 + t * 0.34 + Math.sin(t * 18 + arm) * 0.008);
        const x = Math.cos(angle) * radius * (entry.name.includes("Magellanic") ? 1.15 : 1.0);
        const y = Math.sin(angle) * radius * 0.62;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hexToRgba(arm % 2 === 0 ? entry.tint : entry.accent, 0.18);
      ctx.lineWidth = arm % 2 === 0 ? 16 : 10;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    const core = ctx.createRadialGradient(0, 0, size * 0.01, 0, 0, size * 0.16);
    core.addColorStop(0, hexToRgba("#ffffff", 0.95));
    core.addColorStop(0.45, hexToRgba(entry.accent, 0.78));
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.18, size * 0.11, seed * 1.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (entry.kind === "blackHole" || entry.kind === "quasar") {
    const glow = ctx.createRadialGradient(0, 0, size * 0.02, 0, 0, size * 0.4);
    glow.addColorStop(0, hexToRgba(entry.accent, 0.18));
    glow.addColorStop(0.36, hexToRgba(entry.tint, 0.12));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(seed * Math.PI * 0.6);
    const disk = ctx.createLinearGradient(-size * 0.26, 0, size * 0.26, 0);
    disk.addColorStop(0, hexToRgba(entry.tint, 0.0));
    disk.addColorStop(0.24, hexToRgba(entry.tint, 0.54));
    disk.addColorStop(0.5, hexToRgba(entry.accent, 0.82));
    disk.addColorStop(0.76, hexToRgba(entry.tint, 0.54));
    disk.addColorStop(1, hexToRgba(entry.tint, 0.0));
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.29, size * (entry.kind === "quasar" ? 0.08 : 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.94)";
    ctx.arc(0, 0, size * (entry.kind === "quasar" ? 0.08 : 0.12), 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "screen";
    const jetAngle = seed * Math.PI * 1.4;
    for (const direction of [-1, 1]) {
      ctx.strokeStyle = hexToRgba(entry.accent, entry.kind === "quasar" ? 0.42 : 0.24);
      ctx.lineWidth = entry.kind === "quasar" ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(jetAngle) * size * 0.08 * direction, Math.sin(jetAngle) * size * 0.08 * direction);
      ctx.lineTo(Math.cos(jetAngle) * size * 0.34 * direction, Math.sin(jetAngle) * size * 0.34 * direction);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  } else if (entry.kind === "dark" || entry.kind === "molecular") {
    const outer = ctx.createRadialGradient(0, 0, size * 0.06, 0, 0, size * 0.42);
    outer.addColorStop(0, hexToRgba(entry.tint, 0.12));
    outer.addColorStop(0.55, hexToRgba(entry.tint, entry.kind === "dark" ? 0.08 : 0.12));
    outer.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fill();

    for (let index = 0; index < 18; index += 1) {
      const angle = (seed + index * 0.071) * Math.PI * 2;
      const radial = size * (0.08 + ((seed * 1.7 + index * 0.047) % 1) * 0.16);
      const x = Math.cos(angle) * radial;
      const y = Math.sin(angle) * radial * (0.6 + ((seed * 2.1 + index * 0.083) % 1) * 0.8);
      const rx = size * (0.12 + ((seed * 2.7 + index * 0.037) % 1) * 0.1);
      const ry = rx * (0.48 + ((seed * 3.3 + index * 0.053) % 1) * 0.44);
      const blob = ctx.createRadialGradient(x - rx * 0.18, y - ry * 0.12, rx * 0.04, x, y, rx);
      blob.addColorStop(0, hexToRgba(entry.accent, 0.16));
      blob.addColorStop(0.58, hexToRgba(entry.accent, 0.06));
      blob.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = blob;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, ((seed * 4.1 + index * 0.029) % 1) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "multiply";
    for (let index = 0; index < 14; index += 1) {
      const angle = (seed * 1.1 + index * 0.059) * Math.PI * 2;
      const radial = size * (0.03 + ((seed * 2.5 + index * 0.041) % 1) * 0.18);
      const x = Math.cos(angle) * radial;
      const y = Math.sin(angle) * radial;
      const rx = size * (0.11 + ((seed * 3.1 + index * 0.067) % 1) * 0.12);
      const ry = rx * (0.44 + ((seed * 4.5 + index * 0.071) % 1) * 0.36);
      const shadow = ctx.createRadialGradient(x - rx * 0.1, y - ry * 0.08, rx * 0.02, x, y, rx);
      shadow.addColorStop(0, "rgba(18,10,8,0.72)");
      shadow.addColorStop(0.7, "rgba(28,18,14,0.32)");
      shadow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, ((seed * 5.2 + index * 0.061) % 1) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  } else {
    const outer = ctx.createRadialGradient(0, 0, size * 0.04, 0, 0, size * 0.44);
    outer.addColorStop(0, hexToRgba(entry.accent, 0.18));
    outer.addColorStop(0.3, hexToRgba(entry.tint, 0.14));
    outer.addColorStop(0.72, hexToRgba(entry.tint, 0.08));
    outer.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.44, 0, Math.PI * 2);
    ctx.fill();

    for (let index = 0; index < 24; index += 1) {
      const angle = (seed * 1.4 + index * 0.047) * Math.PI * 2;
      const radial = Math.sqrt((seed * 2.3 + index * 0.061) % 1) * size * 0.24;
      const x = Math.cos(angle) * radial;
      const y = Math.sin(angle) * radial;
      const rx = size * (0.1 + ((seed * 2.9 + index * 0.033) % 1) * 0.11);
      const ry = rx * (0.5 + ((seed * 3.7 + index * 0.051) % 1) * 0.5);
      const mist = ctx.createRadialGradient(x - rx * 0.2, y - ry * 0.16, rx * 0.04, x, y, rx);
      const useAccent = entry.kind === "supernova" ? index % 2 === 0 : ((seed * 4.2 + index * 0.043) % 1) > 0.58;
      mist.addColorStop(0, hexToRgba(useAccent ? entry.accent : entry.tint, 0.18));
      mist.addColorStop(0.46, hexToRgba(useAccent ? entry.accent : entry.tint, 0.08));
      mist.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = mist;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, ((seed * 5.4 + index * 0.057) % 1) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    if (entry.kind === "planetary" || entry.kind === "supernova") {
      ctx.strokeStyle = hexToRgba(entry.accent, entry.kind === "planetary" ? 0.3 : 0.22);
      ctx.lineWidth = entry.kind === "planetary" ? size * 0.028 : size * 0.02;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.19, size * (entry.kind === "planetary" ? 0.15 : 0.2), ((seed * 7.1) % 1) * Math.PI, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
  texture.needsUpdate = true;
  return texture;
}

function stellarStyleFromData({
  seedKey,
  spectralType,
  effectiveTemperatureK,
  luminositySolar,
  radiusSolar,
  apparentMagnitude,
}: {
  seedKey: string;
  spectralType: string | null;
  effectiveTemperatureK: number | null;
  luminositySolar: number | null;
  radiusSolar: number | null;
  apparentMagnitude?: number | null;
}): StarRenderStyle {
  const bucket = spectralBucket(spectralType);
  const luminosity = clamp(Math.log10(1 + Math.max(luminositySolar ?? 0.1, 0.1)), 0, 1.5);
  const radius = Math.max(radiusSolar ?? 1, 0.25);
  const variation = hashUnit(seedKey);
  const morphologyByBucket: Record<string, number> = {
    O: 0.14,
    B: 0.2,
    A: 0.28,
    F: 0.38,
    G: 0.52,
    K: 0.72,
    M: 0.9,
    Other: 0.5,
    Unspecified: 0.5,
  };

  const paletteByBucket: Record<string, Pick<StarRenderStyle, "core" | "rim" | "corona" | "halo">> = {
    O: { core: "#eef7ff", rim: "#5f99ff", corona: "#8fc0ff", halo: "#edf7ff" },
    B: { core: "#f5fbff", rim: "#7eaeff", corona: "#b4d4ff", halo: "#f4f9ff" },
    A: { core: "#f7fbff", rim: "#a9cbff", corona: "#d8e9ff", halo: "#fbfdff" },
    F: { core: "#fff8e9", rim: "#f2dfbf", corona: "#fff3d8", halo: "#fff7e8" },
    G: { core: "#fff4cf", rim: "#ffc879", corona: "#ffe0a8", halo: "#fff0c8" },
    K: { core: "#ffe5c6", rim: "#ffab67", corona: "#ffd0a2", halo: "#ffe7ca" },
    M: { core: "#ffc7bb", rim: "#ff5a39", corona: "#ff9a70", halo: "#ffd1c6" },
    Other: { core: "#fff0c6", rim: "#ffbb76", corona: "#ffdaab", halo: "#fff0cf" },
    Unspecified: { core: "#fff0c6", rim: "#ffbb76", corona: "#ffdaab", halo: "#fff0cf" },
  };

  const palette = paletteByBucket[bucket] ?? paletteByBucket.Other;
  const blackbody = kelvinHexColor(effectiveTemperatureK, palette.core);
  const isHot = bucket === "O" || bucket === "B" || bucket === "A";
  const blackbodyMix = bucket === "M" ? 0.42 : bucket === "K" ? 0.56 : 0.72;
  const warmAnchor = bucket === "M" ? "#ff643f" : bucket === "K" ? "#ff9958" : "#ffbe7f";
  const core = tuneHexColor(mixHexColors(palette.core, blackbody, blackbodyMix), isHot ? 0.04 : 0.02, isHot ? 0.88 : 1.08);
  const rim = tuneHexColor(
    mixHexColors(palette.rim, mixHexColors(blackbody, isHot ? "#7faeff" : warmAnchor, isHot ? 0.55 : bucket === "M" ? 0.46 : 0.3), 0.62),
    -0.05,
    isHot ? 0.94 : 1.12,
  );
  const corona = tuneHexColor(mixHexColors(palette.corona, blackbody, 0.76), 0.08, isHot ? 0.84 : 1.02);
  const halo = tuneHexColor(mixHexColors(palette.halo, blackbody, 0.68), 0.12, 0.78);
  const hotStarBoost = bucket === "O" || bucket === "B" || bucket === "A";
  const brightnessScale = apparentMagnitude !== null && apparentMagnitude !== undefined
    ? clamp(1.34 - apparentMagnitude * 0.08 + (hotStarBoost ? 0.1 : 0), 0.42, 1.6)
    : clamp(0.72 + luminosity * 0.24 + variation * 0.08 + (hotStarBoost ? 0.14 : 0), 0.58, 1.34);
  const sizeLift = clamp(0.7 + Math.pow(radius, 0.5) * 0.34 + luminosity * 0.1 + brightnessScale * 0.03 + variation * 0.03, 0.72, 1.86);

  return {
    core,
    rim,
    corona,
    halo,
    radiusScale: sizeLift,
    glowScale: clamp(1.42 + luminosity * 0.32 + brightnessScale * 0.18 + variation * 0.08 + (hotStarBoost ? 0.14 : 0), 1.34, 2.38),
    glowOpacity: clamp(0.07 + luminosity * 0.05 + brightnessScale * 0.04 + variation * 0.015 + (hotStarBoost ? 0.03 : 0), 0.07, 0.24),
    brightnessScale,
    morphologyBias: morphologyByBucket[bucket] ?? morphologyByBucket.Other,
  };
}

function stellarStyle(system: UniverseSystem): StarRenderStyle {
  return stellarStyleFromData({
    seedKey: system.id,
    spectralType: system.stellar.spectralType,
    effectiveTemperatureK: system.stellar.effectiveTemperatureK,
    luminositySolar: stellarLuminosity(system),
    radiusSolar: system.stellar.radiusSolar,
    apparentMagnitude: system.stellar.photometry.vMag ?? system.stellar.photometry.jMag ?? system.stellar.photometry.kMag,
  });
}

function whiteDwarfStyle(anchor: WhiteDwarfAnchor): StarRenderStyle {
  const base = stellarStyleFromData({
    seedKey: anchor.id,
    spectralType: anchor.spectralType ?? "A",
    effectiveTemperatureK: anchor.effectiveTemperatureK ?? 10000,
    luminositySolar: 0.001,
    radiusSolar: anchor.radiusSolar ?? 0.012,
  });

  return {
    ...base,
    core: "#f8fcff",
    rim: "#9ec9ff",
    corona: "#d4e7ff",
    halo: "#ffffff",
    radiusScale: 0.74,
    glowScale: 1.26,
    glowOpacity: 0.12,
    brightnessScale: 0.66,
    morphologyBias: 0.22,
  };
}

function stellarColor(teff: number | null, spectralType: string | null = null) {
  const bucket = spectralBucket(spectralType);
  const fallbackByBucket: Record<string, string> = {
    O: "#75aaff",
    B: "#a9cbff",
    A: "#f7fbff",
    F: "#fff3d9",
    G: "#ffe09c",
    K: "#ffb977",
    M: "#ff855c",
    Other: "#ffd18a",
    Unspecified: "#ffd18a",
  };
  return kelvinHexColor(teff, fallbackByBucket[bucket] ?? "#ffd18a");
}

function spectralBucket(spectralType: string | null) {
  if (!spectralType) return "Unspecified";
  const letter = spectralType.trim().charAt(0).toUpperCase();
  return /[OBAFGKM]/.test(letter) ? letter : "Other";
}

function isBlueHostSystem(system: UniverseSystem) {
  const bucket = spectralBucket(system.stellar.spectralType);
  return bucket === "O" || bucket === "B" || bucket === "A";
}

function systemInterestLabels(system: UniverseSystem) {
  const labels: string[] = [];
  if (system.localAnalysis?.studied) {
    labels.push(
      system.localAnalysis.studiedPlanetCount && system.localAnalysis.studiedPlanetCount > 1
        ? `studied x${system.localAnalysis.studiedPlanetCount}`
        : "studied",
    );
  }
  if (isBlueHostSystem(system)) {
    labels.push("blue host");
  }
  if (!system.localAnalysis?.studied && system.localAnalysis?.interesting) {
    labels.push("interesting");
  }
  return labels;
}

function systemInterestLabel(system: UniverseSystem) {
  return systemInterestLabels(system).slice(0, 2).join(" · ");
}

function systemRadius(distancePc: number) {
  return Math.max(0.065, 0.2 - Math.min(distancePc, 90) * 0.001);
}

function selectedStarRadius(system: UniverseSystem) {
  const luminosity = clamp(Math.log10(1 + Math.max(stellarLuminosity(system) ?? 0.2, 0.2)), 0, 1.5);
  const radius = Math.max(system.stellar.radiusSolar ?? 1, 0.25);
  const apparentMagnitude = system.stellar.photometry.vMag ?? system.stellar.photometry.jMag ?? system.stellar.photometry.kMag;
  const brightnessBoost = apparentMagnitude !== null && apparentMagnitude !== undefined
    ? clamp((8.5 - apparentMagnitude) * 0.01, 0, 0.09)
    : 0;
  return clamp(0.22 + Math.pow(radius, 0.55) * 0.11 + luminosity * 0.045 + brightnessBoost, 0.24, 0.76);
}

function planetRadius(radiusEarth: number | null) {
  return Math.max(0.025, Math.min(0.085, Math.cbrt(Math.max(radiusEarth ?? 1, 0.25)) * 0.02));
}

function systemOrbitRadius(index: number, semiMajorAxisAu: number | null) {
  return 0.48 + index * 0.22 + Math.min((semiMajorAxisAu ?? 0.03) * 2.4, 1.5);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unknown";
  return value.toFixed(digits);
}

function titleCaseSlug(text: string) {
  return text
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function retentionDisplayValue(retention: RetentionAudit) {
  const label = titleCaseSlug(retention.regime);
  return retention.confidence === "low" ? label : `${label} (${retention.confidence})`;
}

function retentionDisplayDetail(retention: RetentionAudit) {
  const parts = [
    `verdict ${retention.verdict}`,
    `process ${titleCaseSlug(retention.dominantLossProcess)}`,
    retention.escapeVelocityKmS ? `v_escape ${formatNumber(retention.escapeVelocityKmS, 1)} km/s` : null,
    retention.jeansLambdaH2 ? `Jeans λ(H2) ${formatNumber(retention.jeansLambdaH2, 1)}` : null,
    retention.jeansLambdaN2 ? `Jeans λ(N2) ${formatNumber(retention.jeansLambdaN2, 1)}` : null,
    retention.irradiationStress ? `irradiation ${formatNumber(retention.irradiationStress, 2)} S⊕` : null,
  ].filter(Boolean);
  return parts.join("; ");
}

function formatSigned(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unknown";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function measurementBoundsText(
  bounds: { plus: number | null; minus: number | null } | null | undefined,
  digits: number,
  suffix = "",
) {
  if (!bounds) return null;
  const plus = bounds.plus;
  const minus = bounds.minus;
  if (plus === null || plus === undefined || minus === null || minus === undefined) return null;
  return `+${formatNumber(plus, digits)} / ${formatNumber(Math.abs(minus), digits)}${suffix}`;
}

function formatCartesian(vec: UniverseSystem["cartesianPc"], digits = 2) {
  return `${formatSigned(vec.x, digits)}, ${formatSigned(vec.y, digits)}, ${formatSigned(vec.z, digits)} pc`;
}

function distanceLy(distancePc: number) {
  return distancePc * 3.26156;
}

function stellarLuminosity(system: UniverseSystem) {
  if (system.stellar.luminosityLogSolar !== null && system.stellar.luminosityLogSolar !== undefined) {
    return 10 ** system.stellar.luminosityLogSolar;
  }
  const teff = system.stellar.effectiveTemperatureK;
  const radius = system.stellar.radiusSolar;
  if (!teff || !radius) return null;
  return Math.pow(radius, 2) * Math.pow(teff / 5772, 4);
}

function densityGcc(planet: UniversePlanet | null) {
  if (planet?.densityGcc !== null && planet?.densityGcc !== undefined) return planet.densityGcc;
  if (!planet?.massEarth || !planet.radiusEarth) return null;
  return 5.51 * (planet.massEarth / Math.pow(planet.radiusEarth, 3));
}

function orbitVelocityKmS(system: UniverseSystem, planet: UniversePlanet | null) {
  if (!planet?.semiMajorAxisAu || !system.stellar.massSolar) return null;
  return 29.78 * Math.sqrt(system.stellar.massSolar / planet.semiMajorAxisAu);
}

function insolationEarth(system: UniverseSystem, planet: UniversePlanet | null) {
  if (planet?.insolationEarth !== null && planet?.insolationEarth !== undefined) return planet.insolationEarth;
  const lum = stellarLuminosity(system);
  if (!lum || !planet?.semiMajorAxisAu) return null;
  return lum / Math.pow(planet.semiMajorAxisAu, 2);
}

function surfaceGravityMs2(planet: UniversePlanet | null) {
  if (!planet?.massEarth || !planet.radiusEarth) return null;
  return 9.80665 * (planet.massEarth / Math.pow(planet.radiusEarth, 2));
}

function hasWaterEvidence(planet: UniversePlanet) {
  const tags = planet.localAnalysis?.moleculeTags ?? [];
  return tags.some((tag) => /(^|[^a-z])h2o([^a-z]|$)|water/i.test(tag));
}

function hasJwstEvidence(planet: UniversePlanet, system: UniverseSystem) {
  return Boolean(planet.localAnalysis?.jwstInstrumentLabels.length || system.localAnalysis?.jwstInstrumentLabels.length);
}

function matchesNumericRange(value: number | null, min: number, max: number, defaultMin: number, defaultMax: number) {
  const active = min !== defaultMin || max !== defaultMax;
  if (!active) return true;
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  return value >= min && value <= max;
}

function matchesIntervalRange(
  low: number | null,
  high: number | null,
  min: number,
  max: number,
  defaultMin: number,
  defaultMax: number,
) {
  const active = min !== defaultMin || max !== defaultMax;
  if (!active) return true;
  if (low === null || low === undefined || high === null || high === undefined || Number.isNaN(low) || Number.isNaN(high)) {
    return false;
  }
  return high >= min && low <= max;
}

function planetFluxForFilter(system: UniverseSystem, planet: UniversePlanet, uncertaintyMode: AdvancedStageFilters["uncertaintyMode"]) {
  if (uncertaintyMode === "propagated" && planet.propagation) {
    return {
      low: planet.propagation.fluxEarthMultiple.low,
      median: planet.propagation.fluxEarthMultiple.median,
      high: planet.propagation.fluxEarthMultiple.high,
      hasInterval: true,
    };
  }
  const flux = insolationEarth(system, planet);
  return {
    low: flux,
    median: flux,
    high: flux,
    hasInterval: false,
  };
}

function planetGravityForFilter(planet: UniversePlanet, uncertaintyMode: AdvancedStageFilters["uncertaintyMode"]) {
  if (uncertaintyMode === "propagated" && planet.propagation) {
    return {
      low: planet.propagation.surfaceGravityMs2.low,
      median: planet.propagation.surfaceGravityMs2.median,
      high: planet.propagation.surfaceGravityMs2.high,
      hasInterval: true,
    };
  }
  const gravity = surfaceGravityMs2(planet);
  return {
    low: gravity,
    median: gravity,
    high: gravity,
    hasInterval: false,
  };
}

function planetTemperatureForFilter(planet: UniversePlanet, uncertaintyMode: AdvancedStageFilters["uncertaintyMode"]) {
  if (uncertaintyMode === "propagated" && planet.propagation) {
    return {
      low: planet.propagation.equilibriumK.low,
      median: planet.propagation.equilibriumK.median,
      high: planet.propagation.equilibriumK.high,
      hasInterval: true,
    };
  }
  return {
    low: planet.equilibriumK,
    median: planet.equilibriumK,
    high: planet.equilibriumK,
    hasInterval: false,
  };
}

function planetRadiusForFilter(planet: UniversePlanet, uncertaintyMode: AdvancedStageFilters["uncertaintyMode"]) {
  if (uncertaintyMode === "propagated" && planet.propagation) {
    return {
      low: planet.propagation.radiusEarth.low,
      median: planet.propagation.radiusEarth.median,
      high: planet.propagation.radiusEarth.high,
      hasInterval: true,
    };
  }
  return {
    low: planet.radiusEarth,
    median: planet.radiusEarth,
    high: planet.radiusEarth,
    hasInterval: false,
  };
}

function systemMatchesAdvancedFilters(system: UniverseSystem, filters: AdvancedStageFilters) {
  const studied = Boolean(system.localAnalysis?.studied || system.planets.some((planet) => planet.localAnalysis?.studied));
  const interesting = Boolean(system.localAnalysis?.interesting || system.planets.some((planet) => planet.localAnalysis?.interesting));

  if (filters.requireStudied && !studied) return false;
  if (filters.requireInteresting && !interesting) return false;
  if (filters.requireWater && !system.planets.some((planet) => hasWaterEvidence(planet))) return false;
  if (filters.requireJwst && !system.planets.some((planet) => hasJwstEvidence(planet, system))) return false;

  return system.planets.some((planet) => {
    const flux = planetFluxForFilter(system, planet, filters.uncertaintyMode);
    const gravity = planetGravityForFilter(planet, filters.uncertaintyMode);
    const temperature = planetTemperatureForFilter(planet, filters.uncertaintyMode);
    const radius = planetRadiusForFilter(planet, filters.uncertaintyMode);
    return (
      (flux.hasInterval
        ? matchesIntervalRange(flux.low, flux.high, filters.minFlux, filters.maxFlux, DEFAULT_ADVANCED_STAGE_FILTERS.minFlux, DEFAULT_ADVANCED_STAGE_FILTERS.maxFlux)
        : matchesNumericRange(flux.median, filters.minFlux, filters.maxFlux, DEFAULT_ADVANCED_STAGE_FILTERS.minFlux, DEFAULT_ADVANCED_STAGE_FILTERS.maxFlux)) &&
      (temperature.hasInterval
        ? matchesIntervalRange(temperature.low, temperature.high, filters.minTemp, filters.maxTemp, DEFAULT_ADVANCED_STAGE_FILTERS.minTemp, DEFAULT_ADVANCED_STAGE_FILTERS.maxTemp)
        : matchesNumericRange(temperature.median, filters.minTemp, filters.maxTemp, DEFAULT_ADVANCED_STAGE_FILTERS.minTemp, DEFAULT_ADVANCED_STAGE_FILTERS.maxTemp)) &&
      (gravity.hasInterval
        ? matchesIntervalRange(gravity.low, gravity.high, filters.minGravity, filters.maxGravity, DEFAULT_ADVANCED_STAGE_FILTERS.minGravity, DEFAULT_ADVANCED_STAGE_FILTERS.maxGravity)
        : matchesNumericRange(gravity.median, filters.minGravity, filters.maxGravity, DEFAULT_ADVANCED_STAGE_FILTERS.minGravity, DEFAULT_ADVANCED_STAGE_FILTERS.maxGravity)) &&
      (radius.hasInterval
        ? matchesIntervalRange(radius.low, radius.high, filters.minRadius, filters.maxRadius, DEFAULT_ADVANCED_STAGE_FILTERS.minRadius, DEFAULT_ADVANCED_STAGE_FILTERS.maxRadius)
        : matchesNumericRange(radius.median, filters.minRadius, filters.maxRadius, DEFAULT_ADVANCED_STAGE_FILTERS.minRadius, DEFAULT_ADVANCED_STAGE_FILTERS.maxRadius))
    );
  });
}

function habitableZoneAu(system: UniverseSystem) {
  const lum = stellarLuminosity(system);
  if (!lum) return null;
  return {
    inner: Math.sqrt(lum / 1.1),
    outer: Math.sqrt(lum / 0.53),
  };
}

function temperatureClass(kelvin: number | null) {
  if (!kelvin) return "Thermal regime unresolved";
  if (kelvin < 180) return "cryogenic";
  if (kelvin < 260) return "cold temperate";
  if (kelvin < 360) return "temperate";
  if (kelvin < 800) return "hot";
  return "ultra-hot";
}

function planetClass(planet: UniversePlanet | null) {
  if (!planet?.radiusEarth) return "Unclassified world";
  if (planet.radiusEarth < 1.25) return "rocky terrestrial";
  if (planet.radiusEarth < 2.2) return "super-Earth / sub-Neptune transition";
  if (planet.radiusEarth < 4.0) return "sub-Neptune";
  return "gas giant";
}

function systemCompactness(system: UniverseSystem) {
  const axes = system.planets.map((planet) => planet.semiMajorAxisAu).filter((value): value is number => value !== null);
  if (!axes.length) return null;
  const mean = axes.reduce((sum, value) => sum + value, 0) / axes.length;
  return mean;
}

function scienceChemistryTags(science?: PlanetScienceBundle | null) {
  if (!science) return [];
  const tags = science.atmosphere.moleculeTags.length
    ? science.atmosphere.moleculeTags.map((tag) => tag.molecule)
    : science.spectrum.moleculeTags;
  return Array.from(new Set(tags.filter(Boolean)));
}

function chemistrySummary(science?: PlanetScienceBundle | null) {
  if (!science?.atmosphere.moleculeTags.length) return null;
  const statusRank = { detected: 4, feature: 3, mentioned: 2, coverage: 1 } as const;
  const confidenceRank = { high: 3, medium: 2, low: 1 } as const;
  const ranked = [...science.atmosphere.moleculeTags].sort((left, right) => {
    const leftScore = statusRank[left.status] * 10 + confidenceRank[left.confidence];
    const rightScore = statusRank[right.status] * 10 + confidenceRank[right.confidence];
    return rightScore - leftScore;
  });
  const labels = Array.from(new Set(ranked.map((tag) => tag.molecule))).slice(0, 4);
  return labels.length ? labels.join(", ") : null;
}

function wavelengthCoverageText(science?: PlanetScienceBundle | null) {
  const min = science?.atmosphere.wavelengthCoverage.minUm;
  const max = science?.atmosphere.wavelengthCoverage.maxUm;
  if (min === null || min === undefined || max === null || max === undefined) return null;
  return `${formatNumber(min, 2)}-${formatNumber(max, 2)} um`;
}

function activePropagation(planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  return science?.propagation ?? planet?.propagation ?? null;
}

function intervalSummary(
  interval: { low: number | null; median: number | null; high: number | null } | null | undefined,
  digits: number,
  suffix = "",
) {
  if (!interval) return null;
  if (interval.low === null || interval.median === null || interval.high === null) return null;
  return `${formatNumber(interval.low, digits)}-${formatNumber(interval.high, digits)}${suffix} (${formatNumber(interval.median, digits)}${suffix} median)`;
}

function intervalSpan(
  interval: { low: number | null; high: number | null } | null | undefined,
  digits: number,
  suffix = "",
) {
  if (!interval) return null;
  if (interval.low === null || interval.high === null) return null;
  return `${formatNumber(interval.low, digits)}-${formatNumber(interval.high, digits)}${suffix}`;
}

function compactPlanetFluxTemp(system: UniverseSystem, planet: UniversePlanet, science?: PlanetScienceBundle | null) {
  const propagation = activePropagation(planet, science);
  const fluxText = propagation?.fluxEarthMultiple
    ? intervalSpan(propagation.fluxEarthMultiple, 2, " S⊕")
    : (() => {
        const flux = science?.radiation.fluxEarthMultiple ?? insolationEarth(system, planet);
        return flux !== null && flux !== undefined ? `${formatNumber(flux, 2)} S⊕` : null;
      })();
  const tempText = propagation?.equilibriumK
    ? intervalSpan(propagation.equilibriumK, 0, " K")
    : planet.equilibriumK
      ? `${formatNumber(planet.equilibriumK, 0)} K`
      : null;
  return [
    fluxText ? `Flux ${propagation?.fluxEarthMultiple ? "[MC]" : "[Derived]"} ${fluxText}` : null,
    tempText ? `T_eq ${propagation?.equilibriumK ? "[MC]" : "[Archive]"} ${tempText}` : null,
  ].filter(Boolean).join(" · ");
}

function compactPlanetMassRadius(planet: UniversePlanet, science?: PlanetScienceBundle | null) {
  const propagation = activePropagation(planet, science);
  const radiusText = propagation?.radiusEarth
    ? intervalSpan(propagation.radiusEarth, 2, " R⊕")
    : planet.radiusEarth
      ? `${formatNumber(planet.radiusEarth, 2)} R⊕`
      : null;
  const massText = propagation?.massEarth
    ? intervalSpan(propagation.massEarth, 2, " M⊕")
    : planet.massEarth
      ? `${formatNumber(planet.massEarth, 2)} M⊕`
      : null;
  return [
    radiusText ? `R ${propagation?.radiusEarth ? "[MC]" : "[Archive]"} ${radiusText}` : null,
    massText ? `M ${propagation?.massEarth ? "[MC]" : "[Archive]"} ${massText}` : null,
  ].filter(Boolean).join(" · ");
}

function compactSourceBadges(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  const badges = ["Archive"];
  if (science) badges.push("Internet");
  if ((science?.spectrum.jwstObservations.length ?? 0) > 0 || (science?.spectrum.numericSeries.length ?? 0) > 0) badges.push("JWST");
  if (activePropagation(planet, science)) badges.push("MC");
  if (mergedLocalAnalysis(system, planet, science)) badges.push("Local");
  return badges.join(" · ");
}

function compactSourceNote(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  const sources = dedupeSources(system, planet, science);
  const labels = Array.from(new Set(sources.map((source) => source.name))).slice(0, 3);
  return labels.join(" · ");
}

function jwstModeSummary(science?: PlanetScienceBundle | null) {
  const modes = (science?.spectrum.jwstObservations ?? [])
    .map((observation) => [observation.instrumentName, observation.filters].filter(Boolean).join(" "))
    .filter(Boolean);
  return Array.from(new Set(modes)).slice(0, 4);
}

type PlannerRecommendation = {
  mode: string;
  rationale: string;
  readiness: "ready" | "caution" | "blocked";
};

function plannerRecommendationText(recommendation: PlannerRecommendation) {
  const prefix =
    recommendation.readiness === "ready"
      ? "ready"
      : recommendation.readiness === "caution"
        ? "caution"
        : "blocked";
  return `${recommendation.mode} [${prefix}] ${recommendation.rationale}`;
}

function buildPlannerRecommendations(system: UniverseSystem, planet: UniversePlanet, science?: PlanetScienceBundle | null) {
  const recommendations: PlannerRecommendation[] = [];
  const jMag = science?.stellar.photometry.jMag ?? system.stellar.photometry.jMag;
  const kMag = science?.stellar.photometry.kMag ?? system.stellar.photometry.kMag;
  const coverage = science?.atmosphere.wavelengthCoverage;
  const propagation = activePropagation(planet, science);
  const signal = propagation?.oneScaleHeightSignalPpm.median ?? null;
  const signalHigh = propagation?.oneScaleHeightSignalPpm.high ?? signal;
  const cloudFraction = science?.atmosphere.cloudCoverFraction ?? null;
  const dayside = science?.temperatures.daysideK ?? propagation?.equilibriumK.median ?? planet.equilibriumK ?? null;

  const needBlueCoverage = !coverage || coverage.minUm === null || coverage.minUm > 0.8;
  const needMidCoverage = !coverage || coverage.maxUm === null || coverage.maxUm < 4.2;
  const needThermalCoverage = !coverage || coverage.maxUm === null || coverage.maxUm < 8;

  if (needBlueCoverage) {
    recommendations.push({
      mode: "NIRISS SOSS",
      readiness:
        jMag === null
          ? "caution"
          : jMag < 6.5
            ? "blocked"
            : jMag < 9
              ? "caution"
              : "ready",
      rationale:
        jMag === null
          ? "0.6-2.8 um coverage gap present, but host J magnitude is unresolved so bright-limit screening still requires ETC/APT."
          : jMag < 6.5
            ? `0.6-2.8 um coverage gap is present, but J=${formatNumber(jMag, 2)} mag is bright enough that SOSS saturation risk is high without a stricter ETC setup.`
            : jMag < 9
              ? `0.6-2.8 um coverage gap is present and J=${formatNumber(jMag, 2)} mag keeps SOSS plausible with subarray/readout caution.`
              : `0.6-2.8 um coverage gap is present and J=${formatNumber(jMag, 2)} mag is in a comfortable SOSS regime for transit spectroscopy.`,
    });
  }

  if (needMidCoverage) {
    recommendations.push({
      mode: signalHigh !== null && signalHigh > 60 ? "NIRSpec G395H BOTS" : "NIRSpec Prism BOTS",
      readiness:
        jMag === null
          ? "caution"
          : jMag < 7
            ? "caution"
            : "ready",
      rationale:
        signalHigh !== null && signalHigh > 60
          ? `Propagated one-scale-height signal spans ${intervalSummary(propagation?.oneScaleHeightSignalPpm, 0, " ppm") ?? `${formatNumber(signal, 0)} ppm`} and supports higher-resolution 2.9-5.2 um follow-up if brightness checks pass.`
          : `Mid-IR/CO2-sensitive coverage is incomplete; a lower-resolution broad-band BOTS pass is the safer first constraint before committing to higher resolution.`,
    });
  }

  if (needThermalCoverage && dayside !== null && dayside > 900) {
    recommendations.push({
      mode: "MIRI LRS slitless",
      readiness:
        kMag === null
          ? "caution"
          : kMag < 5.5
            ? "blocked"
            : kMag < 8
              ? "caution"
              : "ready",
      rationale:
        kMag === null
          ? `Dayside temperature near ${formatNumber(dayside, 0)} K makes thermal-phase leverage attractive, but K magnitude is unresolved so MIRI saturation/throughput must be checked explicitly.`
          : kMag < 5.5
            ? `Dayside temperature near ${formatNumber(dayside, 0)} K favors thermal follow-up, but K=${formatNumber(kMag, 2)} mag is bright enough that LRS slitless would need a strict saturation review.`
            : `Dayside temperature near ${formatNumber(dayside, 0)} K and K=${formatNumber(kMag, 2)} mag make >5 um thermal follow-up a plausible next discriminator.`,
    });
  }

  if (cloudFraction !== null && cloudFraction > 0.7 && recommendations.length) {
    recommendations.push({
      mode: "Repeat-transit stack",
      readiness: "ready",
      rationale: `Cloud proxy near ${formatNumber(cloudFraction * 100, 0)}% favors stacking multiple visits to recover shallow modulation rather than relying on a single deep transit.`,
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      mode: "JWST revisit triage",
      readiness: "caution",
      rationale: "Current coverage already spans the main atmospheric windows or the target is too incomplete for a stronger mode call; next step is ETC/APT visibility and saturation screening against the existing inventory.",
    });
  }

  return recommendations.slice(0, 4);
}

function mergedLocalAnalysis(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  return science?.localAnalysis ?? planet?.localAnalysis ?? system.localAnalysis ?? null;
}

function chemistryTagsForAppearance(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  const local = mergedLocalAnalysis(system, planet, science);
  return Array.from(new Set([
    ...scienceChemistryTags(science),
    ...(local?.moleculeTags ?? []),
  ].filter(Boolean))).map((tag) => tag.toUpperCase());
}

function localAnalysisStatus(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  const local = mergedLocalAnalysis(system, planet, science);
  if (science && local) return "Official enrichment + local analysis merged";
  if (science) return "Official enrichment loaded";
  if (local) return "Local analysis merged";
  return "Archive snapshot only";
}

function paletteForSelection(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null): Palette {
  const starTemp = system.stellar.effectiveTemperatureK ?? 5200;
  const starHue = starTemp >= 9000 ? 216 : starTemp >= 7200 ? 205 : starTemp >= 6000 ? 44 : starTemp >= 5000 ? 28 : 12;
  const star = {
    h: starHue,
    s: starTemp >= 7200 ? 92 : 96,
    l: starTemp >= 7200 ? 72 : starTemp >= 6000 ? 68 : 64,
  };

  if (!planet) {
    return {
      star,
      planet: { h: (starHue + 162) % 360, s: 74, l: 52 },
      accent: { h: (starHue + 218) % 360, s: 82, l: 62 },
    };
  }

  const normalizedId = planet.id.toLowerCase();
  if (normalizedId === "earth") {
    return {
      star,
      planet: { h: 204, s: 72, l: 45 },
      accent: { h: 138, s: 52, l: 50 },
    };
  }
  if (normalizedId === "mercury") {
    return {
      star,
      planet: { h: 28, s: 18, l: 42 },
      accent: { h: 34, s: 28, l: 58 },
    };
  }
  if (normalizedId === "mars") {
    return {
      star,
      planet: { h: 18, s: 62, l: 44 },
      accent: { h: 30, s: 52, l: 52 },
    };
  }
  if (normalizedId === "venus") {
    return {
      star,
      planet: { h: 40, s: 28, l: 82 },
      accent: { h: 34, s: 46, l: 68 },
    };
  }
  if (normalizedId === "jupiter") {
    return {
      star,
      planet: { h: 38, s: 44, l: 68 },
      accent: { h: 22, s: 66, l: 54 },
    };
  }
  if (normalizedId === "saturn") {
    return {
      star,
      planet: { h: 42, s: 30, l: 78 },
      accent: { h: 34, s: 34, l: 64 },
    };
  }
  if (normalizedId === "uranus") {
    return {
      star,
      planet: { h: 190, s: 44, l: 72 },
      accent: { h: 198, s: 52, l: 62 },
    };
  }
  if (normalizedId === "neptune") {
    return {
      star,
      planet: { h: 206, s: 74, l: 52 },
      accent: { h: 220, s: 84, l: 48 },
    };
  }

  const appearance = previewAppearance(system, planet, science);
  const chemistry = new Set(chemistryTagsForAppearance(system, planet, science));
  const flux = appearance.insolationEarth ?? 1;
  const density = appearance.densityGcc ?? 5.5;
  const paletteByRegime: Record<PlanetPreviewAppearance["regime"], { planet: Palette["planet"]; accent: Palette["accent"] }> = {
    airless: {
      planet: { h: 28, s: 18, l: 42 },
      accent: { h: 34, s: 24, l: 58 },
    },
    lava: {
      planet: { h: 10, s: 92, l: 44 },
      accent: { h: 30, s: 98, l: 62 },
    },
    "hot-jupiter": {
      planet: { h: 18, s: 84, l: 52 },
      accent: { h: 340, s: 80, l: 60 },
    },
    "gas-giant": flux > 2
      ? {
          planet: { h: 18, s: 84, l: 52 },
          accent: { h: 344, s: 78, l: 62 },
        }
      : {
          planet: { h: 42, s: 62, l: 56 },
          accent: { h: 22, s: 76, l: 62 },
        },
    saturnian: {
      planet: { h: 44, s: 30, l: 78 },
      accent: { h: 34, s: 36, l: 64 },
    },
    "ice-giant": {
      planet: { h: 194, s: 78, l: 54 },
      accent: { h: 223, s: 90, l: 66 },
    },
    hycean: {
      planet: { h: 190, s: 84, l: 46 },
      accent: { h: 164, s: 72, l: 58 },
    },
    "sub-neptune": {
      planet: { h: 188, s: 82, l: 56 },
      accent: { h: 266, s: 78, l: 64 },
    },
    venusian: {
      planet: { h: 42, s: 24, l: 82 },
      accent: { h: 34, s: 42, l: 68 },
    },
    desert: {
      planet: { h: 34, s: 82, l: 54 },
      accent: { h: 12, s: 86, l: 60 },
    },
    temperate: density < 5.1
      ? {
          planet: { h: 198, s: 86, l: 46 },
          accent: { h: 154, s: 72, l: 58 },
        }
      : {
          planet: { h: 202, s: 68, l: 48 },
          accent: { h: 176, s: 58, l: 56 },
        },
    rocky: {
      planet: { h: flux < 0.7 ? 214 : 24, s: flux < 0.7 ? 46 : 54, l: flux < 0.7 ? 52 : 50 },
      accent: { h: flux < 0.7 ? 184 : 198, s: 62, l: 58 },
    },
  };

  const base = paletteByRegime[appearance.regime];
  const methane = chemistry.has("CH4");
  const water = chemistry.has("H2O");
  const sulfur = chemistry.has("SO2");
  const carbon = chemistry.has("CO2") || chemistry.has("CO");
  const alkali = chemistry.has("NA") || chemistry.has("K");
  const starMixedHue = (base.accent.h * 0.72 + star.h * 0.28 + 360) % 360;
  const planetHue = methane && ["gas-giant", "hot-jupiter", "ice-giant", "sub-neptune", "hycean"].includes(appearance.regime)
    ? lerp(base.planet.h, 204, 0.48)
    : sulfur
      ? lerp(base.planet.h, 42, 0.42)
      : carbon && !["temperate", "hycean"].includes(appearance.regime)
        ? lerp(base.planet.h, 24, 0.35)
        : water && (appearance.regime === "temperate" || appearance.regime === "hycean")
          ? lerp(base.planet.h, appearance.regime === "hycean" ? 188 : 196, appearance.regime === "hycean" ? 0.36 : 0.18)
          : base.planet.h;
  const accentHue = methane
    ? lerp(starMixedHue, 220, 0.44)
    : alkali
      ? lerp(starMixedHue, 18, 0.38)
      : sulfur
        ? lerp(starMixedHue, 48, 0.28)
        : water
          ? lerp(starMixedHue, 176, 0.22)
          : starMixedHue;

  return {
    star,
    planet: {
      h: planetHue,
      s: clamp(base.planet.s + appearance.cloudCover * 6 + (methane ? 6 : 0) + (sulfur ? 8 : 0) + (appearance.regime === "hot-jupiter" ? 8 : 0), 18, 98),
      l: clamp(base.planet.l + (appearance.regime === "lava" ? 2 : 0) + (water ? 2 : 0) + (appearance.regime === "airless" ? -2 : 0), 20, 82),
    },
    accent: {
      h: accentHue,
      s: clamp(base.accent.s + appearance.cloudCover * 4 + (alkali ? 8 : 0), 42, 98),
      l: clamp(base.accent.l + (methane ? -2 : 0) + (water ? 2 : 0), 24, 84),
    },
  };
}

function toneClasses(kind: MetricKind) {
  switch (kind) {
    case "observed":
      return "border-emerald-300/18 bg-emerald-300/10 text-emerald-50";
    case "inferred":
      return "border-sky-300/18 bg-sky-300/10 text-sky-50";
    case "derived":
      return "border-fuchsia-300/16 bg-fuchsia-300/10 text-fuchsia-50";
    default:
      return "border-amber-300/16 bg-amber-300/10 text-amber-50";
  }
}

function defaultMetricProvenance(kind: MetricKind) {
  switch (kind) {
    case "observed":
      return "Source: NASA Exoplanet Archive / official host-planet row";
    case "derived":
      return "Source: derived from loaded observed fields";
    case "inferred":
      return "Source: model or interpretation layer using loaded archive/JWST context";
    default:
      return "Source: merged local EXOPLANET_ANALYSES layer";
  }
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className={`rounded-[1.2rem] border p-3 ${toneClasses(metric.kind)}`}>
      <div className="text-[0.64rem] uppercase tracking-[0.22em] opacity-70">{metric.label}</div>
      <div className="mt-2 text-base font-semibold">{metric.value}</div>
      <p className="mt-2 text-xs leading-5 opacity-80">{metric.note}</p>
      <div className="mt-3 space-y-1 text-[0.62rem] leading-5 opacity-70">
        <div>{metric.provenance ?? defaultMetricProvenance(metric.kind)}</div>
        {metric.equation ? <div>{metric.equation}</div> : null}
      </div>
    </article>
  );
}

function buildSynopsis(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  const lum = stellarLuminosity(system);
  const compactness = systemCompactness(system);
  const local = mergedLocalAnalysis(system, planet, science);
  if (!planet) {
    return `${system.name} sits ${formatNumber(distanceLy(system.distancePc), 1)} light-years from the Sun in the current archive slice. The host star is ${spectralBucket(system.stellar.spectralType)}-class with ${system.planetCount} confirmed planets in the working snapshot. Luminosity is ${lum ? `${formatNumber(lum, 2)} L☉` : "not yet constrained from the loaded fields"}, and the mean orbital scale is ${compactness ? `${formatNumber(compactness, 2)} AU` : "not yet resolved"}.${local?.interestingReason ? ` Local analysis flags this system as notable: ${local.interestingReason}.` : ""}`; 
  }

  const insolation = insolationEarth(system, planet);
  const density = densityGcc(planet);
  const orbitVelocity = orbitVelocityKmS(system, planet);
  const propagation = activePropagation(planet, science);
  const magnetic = science?.magnetosphere.surfaceFieldMicroTesla;
  const protection = science?.magnetosphere.protection;
  const dayside = science?.temperatures.daysideK;
  const chemistry = chemistrySummary(science);
  const coverage = wavelengthCoverageText(science);
  const jwstObservationCount = science?.spectrum.jwstObservations.length ?? 0;
  const jwstProductCount = science?.spectrum.jwstProducts.length ?? 0;
  const cloudFraction = science?.atmosphere.cloudCoverFraction;
  const fluxRange = intervalSummary(propagation?.fluxEarthMultiple, 2, " S⊕");
  const tempRange = intervalSummary(propagation?.equilibriumK, 0, " K");
  return `${planet.name} is modeled here as a ${planetClass(planet)} in the ${system.name} system. Official archive radius and mass place it in a ${density ? `${formatNumber(density, 2)} g/cm³ bulk-density` : "density-unresolved"} regime, while the host star and semi-major axis imply ${insolation ? `${formatNumber(insolation, 2)} S⊕ incident flux` : "an unresolved irradiation field"}. The current temperature regime is ${temperatureClass(planet.equilibriumK)}${dayside ? ` with a dayside estimate near ${formatNumber(dayside, 0)} K` : ""}${orbitVelocity ? ` and an orbital velocity near ${formatNumber(orbitVelocity, 1)} km/s` : ""}${magnetic ? `; the current magnetic proxy is ${formatNumber(magnetic, 1)} microT with ${protection} shielding.` : ""}${science?.retention ? ` Escape audit: ${retentionDisplayValue(science.retention)} via ${titleCaseSlug(science.retention.dominantLossProcess)}.` : ""}${fluxRange ? ` Propagated flux range: ${fluxRange}.` : ""}${tempRange ? ` Propagated equilibrium-temperature range: ${tempRange}.` : ""}${science ? ` JWST/MAST currently contributes ${jwstObservationCount} observation${jwstObservationCount === 1 ? "" : "s"} and ${jwstProductCount} product${jwstProductCount === 1 ? "" : "s"}${coverage ? ` across ${coverage}` : ""}. ${chemistry ? `Atmosphere evidence presently favors ${chemistry}. ` : ""}${science.atmosphere.cloudInterpretation}${cloudFraction !== null && cloudFraction !== undefined ? ` Cloud proxy: ${formatNumber(cloudFraction * 100, 0)}%.` : ""}` : ""} Orbit display basis: ${orbitBasisSummary(planet)}.${local?.habitability ? ` Local analysis assessment: ${local.habitability}.` : local?.interestingReason ? ` Local analysis flag: ${local.interestingReason}.` : ""}`;
}

function buildDeepSkySynopsis(entry: DeepSkyObject) {
  const distance = distanceLy(entry.distancePc);
  const size = entry.kind === "pulsar" ? null : entry.sizePc * 3.26156;
  const massText = entry.massSolar ? ` The current mass anchor is ${entry.massSolar >= 1_000_000 ? `${formatNumber(entry.massSolar / 1_000_000, 2)} million M☉` : `${formatNumber(entry.massSolar, 1)} M☉`}.` : "";
  const behaviorText =
    entry.kind === "blackHole"
      ? " The visual layer treats this as an accretion-disk-dominated black-hole system rather than a resolved body."
      : entry.kind === "quasar"
        ? " The visual layer treats this as an active-galactic-nucleus beacon with a compact luminous core and jet structure."
        : entry.kind === "galaxy"
          ? " The visual layer keeps the galaxy image, class, and rough scale fixed while compressing distance for exploration."
          : "";
  return `${entry.name} is rendered here as a ${deepSkyKindLabel(entry.kind).toLowerCase()} ${formatNumber(distance, 0)} light-years from the Sun. The stage uses the archive-style sky position and a display-compressed distance model, but the object tag, class, and approximate physical scale remain tied to the catalog layer.${size ? ` The working size proxy is about ${formatNumber(size, 0)} light-years across.` : ""}${entry.kind === "pulsar" && entry.pulsePeriodSeconds ? ` Pulse period is ${formatNumber(entry.pulsePeriodSeconds * 1000, 2)} ms.` : ""}${massText}${behaviorText}`;
}

function buildWhiteDwarfSynopsis(anchor: WhiteDwarfAnchor) {
  return `${anchor.name} is a white dwarf anchor in the local degenerate-star layer, ${formatNumber(distanceLy(anchor.distancePc), 1)} light-years from the Sun.${anchor.effectiveTemperatureK ? ` The current catalog temperature is ${formatNumber(anchor.effectiveTemperatureK, 0)} K.` : ""}${anchor.massSolar ? ` Mass is ${formatNumber(anchor.massSolar, 2)} M☉` : " Mass is unresolved"}${anchor.radiusSolar ? ` and radius is ${formatNumber(anchor.radiusSolar, 4)} R☉.` : "."}${anchor.gravitationalRedshiftKmS ? ` The local white-dwarf lab currently tracks a gravitational-redshift proxy near ${formatNumber(anchor.gravitationalRedshiftKmS, 1)} km/s.` : ""}`;
}

function buildReferenceStarSynopsis(star: ReferenceStar) {
  return `${star.name} is a reference ${star.spectralType} anchor ${formatNumber(distanceLy(star.distancePc), 1)} light-years from the Sun. The current catalog temperature is ${formatNumber(star.effectiveTemperatureK, 0)} K, with radius ${formatNumber(star.radiusSolar, 2)} R☉ and luminosity ${formatNumber(star.luminositySolar, 2)} L☉. This layer exists to keep nearby bright stellar color and scale anchored to known astrophysical reference points.`;
}

function deepSkyAngularSizeArcmin(entry: DeepSkyObject) {
  if (!entry.sizePc || !entry.distancePc) return null;
  return 2 * Math.atan((entry.sizePc * 0.5) / entry.distancePc) * (180 / Math.PI) * 60;
}

function staticSource(name: string, kind: SourceDescriptor["kind"], url: string): SourceDescriptor {
  return {
    id: scienceKey(name),
    name,
    kind,
    url,
    accessedAt: new Date().toISOString(),
    cache: "hit",
  };
}

function deepSkySources(entry: DeepSkyObject) {
  return [
    staticSource(`${entry.name} layer`, "catalog", entry.sourceUrl ?? "https://science.nasa.gov/universe/"),
    ...(DEEP_SKY_ART[entry.name] ? [staticSource(`${entry.name} art reference`, "imaging", entry.artReferenceUrl ?? entry.sourceUrl ?? "https://science.nasa.gov/universe/")] : []),
  ];
}

function referenceStarSources(star: ReferenceStar) {
  return [staticSource(`${star.name} reference star`, "catalog", "https://science.nasa.gov/universe/stars/")];
}

function buildDeepSkyObservedMetrics(entry: DeepSkyObject): Metric[] {
  return [
    {
      label: "Object Class",
      value: deepSkyKindLabel(entry.kind),
      note: "Deep-sky object class carried by the local exploration catalog layer.",
      kind: "observed",
      provenance: "Source: deep-sky catalog layer",
    },
    {
      label: "Distance",
      value: `${formatNumber(entry.distancePc, 0)} pc`,
      note: `${formatNumber(distanceLy(entry.distancePc), 0)} light-years from the Sun.`,
      kind: "observed",
      provenance: "Source: deep-sky catalog layer distance anchor",
    },
    {
      label: "RA / Dec",
      value: `${formatNumber(entry.raDeg, 2)}° / ${formatSigned(entry.decDeg, 2)}°`,
      note: "Sky position used for Sun-centered placement in the exploration scene.",
      kind: "observed",
      provenance: "Source: deep-sky catalog layer",
    },
    {
      label: "Size Proxy",
      value: `${formatNumber(entry.sizePc, 1)} pc`,
      note: entry.kind === "pulsar" ? "Compact object display scale proxy." : `${formatNumber(entry.sizePc * 3.26156, 1)} light-year working size proxy.`,
      kind: "observed",
      provenance: "Source: deep-sky catalog layer",
    },
    ...(entry.kind === "pulsar" && entry.pulsePeriodSeconds
      ? [{
          label: "Pulse Period",
          value: `${formatNumber(entry.pulsePeriodSeconds * 1000, 2)} ms`,
          note: `${formatNumber(1 / entry.pulsePeriodSeconds, 2)} Hz visualized in the scene pulse.`,
          kind: "observed" as const,
          provenance: "Source: deep-sky catalog pulsar anchor",
        }]
      : []),
    ...(entry.massSolar
      ? [{
          label: entry.kind === "blackHole" || entry.kind === "quasar" ? "Mass Anchor" : "Mass Proxy",
          value: entry.massSolar >= 1_000_000 ? `${formatNumber(entry.massSolar / 1_000_000, 2)} million M☉` : `${formatNumber(entry.massSolar, 1)} M☉`,
          note: entry.kind === "blackHole" || entry.kind === "quasar"
            ? "Catalog/standard-reference mass used to contextualize the compact object."
            : "Catalog mass proxy carried in the deep-sky layer.",
          kind: "observed" as const,
          provenance: "Source: deep-sky catalog / standard reference anchor",
        }]
      : []),
  ];
}

function buildDeepSkyDerivedMetrics(entry: DeepSkyObject): Metric[] {
  const xyz = equatorialToCartesianPc(entry.raDeg, entry.decDeg, entry.distancePc);
  const angularSize = deepSkyAngularSizeArcmin(entry);
  return [
    {
      label: "XYZ from Sun",
      value: formatCartesian(xyz),
      note: "Derived from RA, Dec, and distance in the current equatorial frame.",
      kind: "derived",
      provenance: "Source: deep-sky catalog RA/Dec/distance",
      equation: "Eq: Cartesian transform from spherical coordinates",
    },
    {
      label: "Angular Size",
      value: angularSize ? `${formatNumber(angularSize, 1)} arcmin` : "Unresolved",
      note: "First-pass angular-size estimate from physical-size proxy and distance.",
      kind: "derived",
      provenance: "Source: size proxy + distance",
      equation: "Eq: theta ≈ 2 atan(size / 2d)",
    },
    {
      label: "Scene Basis",
      value: "Display-compressed",
      note: "Distance and size are compressed for exploration, but direction and object class remain source-anchored.",
      kind: "inferred",
      provenance: "Source: scene display transform",
    },
  ];
}

function buildDeepSkyUncertaintyMetrics(entry: DeepSkyObject): Metric[] {
  return [{
    label: "Catalog state",
    value: entry.kind === "pulsar" ? "Timing anchor" : "Scene anchor",
    note: "This object currently uses catalog-grade placement and class metadata rather than a planet-style propagated uncertainty model.",
    kind: "source",
    provenance: "Source: deep-sky catalog layer",
  }];
}

function buildDeepSkyChartRows(entry: DeepSkyObject): ChartRow[] {
  const distance = distanceLy(entry.distancePc);
  const angularSize = deepSkyAngularSizeArcmin(entry);
  return [
    { label: "Distance", value: Math.min(distance, 2_600_000), max: 2_600_000, note: `${formatNumber(distance, 0)} ly`, hue: 198 },
    { label: "Size", value: Math.min(entry.sizePc * 3.26156, 50_000), max: 50_000, note: `${formatNumber(entry.sizePc * 3.26156, 1)} ly`, hue: 28 },
    {
      label: entry.kind === "pulsar" ? "Pulse" : entry.massSolar ? "Mass" : "Angular",
      value:
        entry.kind === "pulsar" && entry.pulsePeriodSeconds
          ? Math.min(1 / entry.pulsePeriodSeconds, 200)
          : entry.massSolar
            ? Math.min(Math.log10(1 + entry.massSolar), 12)
            : Math.min(angularSize ?? 0, 200),
      max: entry.kind === "pulsar" ? 200 : entry.massSolar ? 12 : 200,
      note:
        entry.kind === "pulsar" && entry.pulsePeriodSeconds
          ? `${formatNumber(1 / entry.pulsePeriodSeconds, 2)} Hz`
          : entry.massSolar
            ? entry.massSolar >= 1_000_000
              ? `${formatNumber(entry.massSolar / 1_000_000, 2)} million M☉`
              : `${formatNumber(entry.massSolar, 1)} M☉`
            : angularSize ? `${formatNumber(angularSize, 1)} arcmin` : "pending",
      hue: entry.kind === "pulsar" ? 214 : entry.massSolar ? 18 : 286,
    },
  ];
}

function buildDeepSkyAnalysis(entry: DeepSkyObject) {
  const xyz = equatorialToCartesianPc(entry.raDeg, entry.decDeg, entry.distancePc);
  return [
    `TARGET: ${entry.name}`,
    `OBJECT CLASS: ${deepSkyKindLabel(entry.kind)}`,
    `FRAME: Sun-centered equatorial XYZ generated from deep-sky catalog RA / Dec / distance.`,
    "",
    "OBSERVED INPUTS [O]",
    analysisClaim({
      label: "Distance",
      classification: "O",
      value: `${formatNumber(entry.distancePc, 0)} pc (${formatNumber(distanceLy(entry.distancePc), 0)} ly)`,
      source: "deep-sky catalog layer",
    }),
    analysisClaim({
      label: "RA / Dec",
      classification: "O",
      value: `${formatNumber(entry.raDeg, 2)}° / ${formatSigned(entry.decDeg, 2)}°`,
      source: "deep-sky catalog layer",
    }),
    analysisClaim({
      label: "Size proxy",
      classification: "O",
      value: `${formatNumber(entry.sizePc, 1)} pc`,
      source: "deep-sky catalog layer",
    }),
    ...(entry.kind === "pulsar" && entry.pulsePeriodSeconds ? [analysisClaim({
      label: "Pulse period",
      classification: "O",
      value: `${formatNumber(entry.pulsePeriodSeconds * 1000, 2)} ms`,
      source: "deep-sky pulsar timing anchor",
    })] : []),
    ...(entry.massSolar ? [analysisClaim({
      label: "Mass anchor",
      classification: "O",
      value: entry.massSolar >= 1_000_000 ? `${formatNumber(entry.massSolar / 1_000_000, 2)} million M☉` : `${formatNumber(entry.massSolar, 1)} M☉`,
      source: "deep-sky catalog / standard reference anchor",
    })] : []),
    "",
    "DERIVED / DISPLAY [D/I]",
    analysisClaim({
      label: "XYZ from Sun",
      classification: "D",
      value: formatCartesian(xyz),
      source: "catalog RA/Dec/distance",
      equation: "Eq: Cartesian transform from spherical coordinates",
    }),
    analysisClaim({
      label: "Scene basis",
      classification: "I",
      value: "Display-compressed deep-sky exploration layer",
      source: "scene transform and catalog class anchor",
    }),
    "",
    "SCIENCE INTERPRETATION",
    buildDeepSkySynopsis(entry),
  ].join("\n");
}

function buildWhiteDwarfObservedMetrics(anchor: WhiteDwarfAnchor): Metric[] {
  return [
    {
      label: "Distance",
      value: `${formatNumber(anchor.distancePc, 2)} pc`,
      note: `${formatNumber(distanceLy(anchor.distancePc), 1)} light-years from the Sun.`,
      kind: "observed",
      provenance: "Source: white-dwarf anchor catalog",
    },
    {
      label: "Spectral Type",
      value: anchor.spectralType ?? "Unknown",
      note: "White-dwarf spectral type carried by the local degenerate-star layer.",
      kind: "observed",
      provenance: "Source: white-dwarf anchor catalog",
    },
    {
      label: "Effective Temp",
      value: anchor.effectiveTemperatureK ? `${formatNumber(anchor.effectiveTemperatureK, 0)} K` : "Unknown",
      note: "Observed/collated temperature from the white-dwarf anchor record.",
      kind: "observed",
      provenance: "Source: white-dwarf anchor catalog",
    },
    {
      label: "Mass / Radius",
      value: `${anchor.massSolar ? `${formatNumber(anchor.massSolar, 2)} M☉` : "Unknown"} / ${anchor.radiusSolar ? `${formatNumber(anchor.radiusSolar, 4)} R☉` : "Unknown"}`,
      note: "Compact-object structural anchor from the white-dwarf layer.",
      kind: "observed",
      provenance: "Source: white-dwarf anchor catalog",
    },
  ];
}

function buildWhiteDwarfDerivedMetrics(anchor: WhiteDwarfAnchor): Metric[] {
  return [
    {
      label: "XYZ from Sun",
      value: formatCartesian(anchor.cartesianPc),
      note: "Derived from the white-dwarf anchor position in the current equatorial frame.",
      kind: "derived",
      provenance: "Source: white-dwarf anchor coordinates",
      equation: "Eq: Cartesian transform from spherical coordinates",
    },
    {
      label: "Gravitational Redshift",
      value: anchor.gravitationalRedshiftKmS ? `${formatNumber(anchor.gravitationalRedshiftKmS, 1)} km/s` : "Unresolved",
      note: "White-dwarf lab redshift proxy carried into the scene layer.",
      kind: "derived",
      provenance: "Source: white-dwarf lab bundle",
    },
  ];
}

function buildWhiteDwarfUncertaintyMetrics(): Metric[] {
  return [{
    label: "Catalog state",
    value: "Degenerate-star layer",
    note: "White-dwarf anchors currently use the repaired local lab catalog, not the exoplanet Monte Carlo path.",
    kind: "source",
    provenance: "Source: local white-dwarf lab catalog",
  }];
}

function buildWhiteDwarfChartRows(anchor: WhiteDwarfAnchor): ChartRow[] {
  return [
    { label: "Distance", value: Math.min(anchor.distancePc, 100), max: 100, note: `${formatNumber(anchor.distancePc, 2)} pc`, hue: 198 },
    { label: "Mass", value: Math.min(anchor.massSolar ?? 0, 1.4), max: 1.4, note: anchor.massSolar ? `${formatNumber(anchor.massSolar, 2)} M☉` : "pending", hue: 24 },
    { label: "Radius", value: Math.min((anchor.radiusSolar ?? 0) * 1000, 30), max: 30, note: anchor.radiusSolar ? `${formatNumber(anchor.radiusSolar, 4)} R☉` : "pending", hue: 214 },
    { label: "Teff", value: Math.min(anchor.effectiveTemperatureK ?? 0, 150000), max: 150000, note: anchor.effectiveTemperatureK ? `${formatNumber(anchor.effectiveTemperatureK, 0)} K` : "pending", hue: 286 },
  ];
}

function buildWhiteDwarfAnalysis(anchor: WhiteDwarfAnchor) {
  return [
    `TARGET: ${anchor.name}`,
    `OBJECT CLASS: White dwarf`,
    `FRAME: Sun-centered equatorial XYZ generated from the local degenerate-star anchor layer.`,
    "",
    "OBSERVED INPUTS [O]",
    analysisClaim({
      label: "Distance",
      classification: "O",
      value: `${formatNumber(anchor.distancePc, 2)} pc (${formatNumber(distanceLy(anchor.distancePc), 1)} ly)`,
      source: "white-dwarf anchor catalog",
    }),
    analysisClaim({
      label: "Spectral type / Teff",
      classification: "O",
      value: `${anchor.spectralType ?? "Unknown"} / ${anchor.effectiveTemperatureK ? `${formatNumber(anchor.effectiveTemperatureK, 0)} K` : "unresolved"}`,
      source: "white-dwarf anchor catalog",
    }),
    analysisClaim({
      label: "Mass / Radius",
      classification: "O",
      value: `${anchor.massSolar ? `${formatNumber(anchor.massSolar, 2)} M☉` : "unresolved"} / ${anchor.radiusSolar ? `${formatNumber(anchor.radiusSolar, 4)} R☉` : "unresolved"}`,
      source: "white-dwarf anchor catalog",
    }),
    "",
    "DERIVED / LAB CONTEXT [D]",
    analysisClaim({
      label: "XYZ from Sun",
      classification: "D",
      value: formatCartesian(anchor.cartesianPc),
      source: "white-dwarf anchor coordinates",
      equation: "Eq: Cartesian transform from spherical coordinates",
    }),
    analysisClaim({
      label: "Gravitational redshift proxy",
      classification: "D",
      value: anchor.gravitationalRedshiftKmS ? `${formatNumber(anchor.gravitationalRedshiftKmS, 1)} km/s` : "unresolved",
      source: "white-dwarf lab bundle",
    }),
    "",
    "SCIENCE INTERPRETATION",
    buildWhiteDwarfSynopsis(anchor),
  ].join("\n");
}

function buildReferenceStarObservedMetrics(star: ReferenceStar): Metric[] {
  return [
    {
      label: "Distance",
      value: `${formatNumber(star.distancePc, 2)} pc`,
      note: `${formatNumber(distanceLy(star.distancePc), 1)} light-years from the Sun.`,
      kind: "observed",
      provenance: "Source: reference-star catalog layer",
    },
    {
      label: "Spectral Type",
      value: star.spectralType,
      note: "Reference stellar class used to anchor field-star color and scale.",
      kind: "observed",
      provenance: "Source: reference-star catalog layer",
    },
    {
      label: "Effective Temp",
      value: `${formatNumber(star.effectiveTemperatureK, 0)} K`,
      note: "Catalog effective temperature used for color and morphology.",
      kind: "observed",
      provenance: "Source: reference-star catalog layer",
    },
    {
      label: "Radius / Luminosity",
      value: `${formatNumber(star.radiusSolar, 2)} R☉ / ${formatNumber(star.luminositySolar, 2)} L☉`,
      note: "Reference stellar size and luminosity anchor.",
      kind: "observed",
      provenance: "Source: reference-star catalog layer",
    },
  ];
}

function buildReferenceStarDerivedMetrics(star: ReferenceStar): Metric[] {
  const xyz = equatorialToCartesianPc(star.raDeg, star.decDeg, star.distancePc);
  return [
    {
      label: "XYZ from Sun",
      value: formatCartesian(xyz),
      note: "Derived from RA, Dec, and distance in the reference-star layer.",
      kind: "derived",
      provenance: "Source: reference-star RA/Dec/distance",
      equation: "Eq: Cartesian transform from spherical coordinates",
    },
    {
      label: "Color Basis",
      value: spectralBucket(star.spectralType),
      note: "Temperature and spectral class drive the field-star palette and morphology.",
      kind: "inferred",
      provenance: "Source: effective temperature + spectral type",
    },
  ];
}

function buildReferenceStarUncertaintyMetrics(): Metric[] {
  return [{
    label: "Catalog state",
    value: "Reference-star layer",
    note: "Reference stars use catalog-grade anchors for color, size, and placement rather than exoplanet propagation.",
    kind: "source",
    provenance: "Source: local reference-star catalog",
  }];
}

function buildReferenceStarChartRows(star: ReferenceStar): ChartRow[] {
  return [
    { label: "Distance", value: Math.min(star.distancePc, 30), max: 30, note: `${formatNumber(star.distancePc, 2)} pc`, hue: 198 },
    { label: "Radius", value: Math.min(star.radiusSolar, 8), max: 8, note: `${formatNumber(star.radiusSolar, 2)} R☉`, hue: 24 },
    { label: "Luminosity", value: Math.min(star.luminositySolar, 300), max: 300, note: `${formatNumber(star.luminositySolar, 2)} L☉`, hue: 214 },
    { label: "Teff", value: Math.min(star.effectiveTemperatureK, 15000), max: 15000, note: `${formatNumber(star.effectiveTemperatureK, 0)} K`, hue: 286 },
  ];
}

function buildReferenceStarAnalysis(star: ReferenceStar) {
  const xyz = equatorialToCartesianPc(star.raDeg, star.decDeg, star.distancePc);
  return [
    `TARGET: ${star.name}`,
    `OBJECT CLASS: Reference star`,
    `FRAME: Sun-centered equatorial XYZ generated from the bright-star reference layer.`,
    "",
    "OBSERVED INPUTS [O]",
    analysisClaim({
      label: "Distance",
      classification: "O",
      value: `${formatNumber(star.distancePc, 2)} pc (${formatNumber(distanceLy(star.distancePc), 1)} ly)`,
      source: "reference-star catalog layer",
    }),
    analysisClaim({
      label: "Spectral type / Teff",
      classification: "O",
      value: `${star.spectralType} / ${formatNumber(star.effectiveTemperatureK, 0)} K`,
      source: "reference-star catalog layer",
    }),
    analysisClaim({
      label: "Radius / Luminosity",
      classification: "O",
      value: `${formatNumber(star.radiusSolar, 2)} R☉ / ${formatNumber(star.luminositySolar, 2)} L☉`,
      source: "reference-star catalog layer",
    }),
    "",
    "DERIVED / DISPLAY [D/I]",
    analysisClaim({
      label: "XYZ from Sun",
      classification: "D",
      value: formatCartesian(xyz),
      source: "reference-star catalog coordinates",
      equation: "Eq: Cartesian transform from spherical coordinates",
    }),
    analysisClaim({
      label: "Palette basis",
      classification: "I",
      value: `${spectralBucket(star.spectralType)}-class visual morphology anchor`,
      source: "effective temperature + spectral type",
    }),
    "",
    "SCIENCE INTERPRETATION",
    buildReferenceStarSynopsis(star),
  ].join("\n");
}

function FocusFrame({
  eyebrow,
  synopsis,
  controls,
  children,
}: {
  eyebrow: string;
  synopsis: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate overflow-hidden rounded-[1.85rem] border border-white/10 bg-[linear-gradient(180deg,rgba(5,12,26,0.84),rgba(3,8,19,0.72))] p-5 shadow-[0_28px_80px_rgba(2,8,24,0.45)]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,8,20,0.08),rgba(2,6,17,0.78))]" />
      <div className="absolute inset-x-[16%] top-[5%] h-16 rounded-full bg-sky-300/8 blur-3xl" />
      <div className="relative z-10 mb-4 rounded-[1.35rem] border border-white/8 bg-slate-950/28 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[0.66rem] uppercase tracking-[0.24em] text-sky-100/48">{eyebrow}</div>
          {controls ?? null}
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-200/82">{synopsis}</p>
      </div>
      {children}
    </div>
  );
}

function StarOverviewVisual({ system }: { system: UniverseSystem }) {
  const style = stellarStyle(system);
  const starSize = clamp(selectedStarRadius(system) * 56, 72, 158);
  const orbitPreview = system.planets.slice(0, 5);
  return (
    <div className="relative min-h-[18rem] overflow-hidden rounded-[1.5rem] border border-white/8 bg-[radial-gradient(circle_at_32%_30%,rgba(255,255,255,0.08),transparent_0_18%,rgba(255,170,120,0.04)_34%,transparent_56%),linear-gradient(180deg,rgba(7,16,36,0.82),rgba(2,8,18,0.96))]">
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative rounded-full"
          style={{
            width: `${starSize}px`,
            height: `${starSize}px`,
            background: `radial-gradient(circle at 38% 36%, rgba(255,255,255,0.94), ${style.core} 24%, ${style.rim} 68%, rgba(0,0,0,0.2) 100%)`,
            boxShadow: `0 0 54px ${hexToRgba(style.halo, 0.28)}, 0 0 120px ${hexToRgba(style.corona, 0.16)}`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full opacity-60 mix-blend-screen"
            style={{
              background: `radial-gradient(circle at 56% 42%, rgba(255,255,255,0) 0 36%, ${hexToRgba(style.core, 0.2)} 52%, rgba(255,255,255,0) 72%)`,
            }}
          />
        </div>
      </div>
      {orbitPreview.map((entry, index) => (
        <div
          key={entry.id}
          className="absolute rounded-full border border-white/10"
          style={{
            inset: `${18 + index * 8}% ${14 + index * 7}%`,
          }}
        />
      ))}
      {orbitPreview.map((entry, index) => (
        <div
          key={`${entry.id}-planet`}
          className="absolute rounded-full"
          style={{
            left: `${54 + index * 6}%`,
            top: `${31 + index * 8}%`,
            width: `${entry.radiusEarth && entry.radiusEarth > 3 ? 16 : 10}px`,
            height: `${entry.radiusEarth && entry.radiusEarth > 3 ? 16 : 10}px`,
            background: index % 2 === 0 ? "rgba(114,226,255,0.94)" : "rgba(255,177,105,0.94)",
            boxShadow: "0 0 20px rgba(114,226,255,0.22)",
          }}
        />
      ))}
      <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/8 bg-slate-950/28 px-3 py-2 text-xs text-slate-200/70">
        Host-star overview mode: click a planet to switch the rail into planet detail.
      </div>
    </div>
  );
}

function DeepSkyVisualFocus({ entry }: { entry: DeepSkyObject }) {
  const artPath = DEEP_SKY_ART[entry.name];
  return (
    <FocusFrame eyebrow={`${deepSkyKindLabel(entry.kind)} Synopsis`} synopsis={buildDeepSkySynopsis(entry)}>
      <div className="relative min-h-[18rem] overflow-hidden rounded-[1.5rem] border border-white/8 bg-[linear-gradient(180deg,rgba(7,16,36,0.82),rgba(2,8,18,0.96))]">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-92"
          style={{
            backgroundImage: artPath ? `url(${artPath})` : `radial-gradient(circle at 45% 52%, ${entry.tint}, transparent 0 22%, ${entry.accent} 40%, transparent 72%)`,
            filter: entry.kind === "dark" ? "saturate(1.08) contrast(1.08) brightness(0.78)" : "saturate(1.18) contrast(1.14) brightness(1.06)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06),transparent_0_32%,rgba(2,8,18,0.16)_58%,rgba(2,8,18,0.72)_100%)]" />
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/8 bg-slate-950/38 px-3 py-2 text-xs text-slate-200/74">
          {deepSkyKindLabel(entry.kind)} · {formatNumber(distanceLy(entry.distancePc), 0)} ly · XYZ derived from RA / Dec / distance
        </div>
      </div>
    </FocusFrame>
  );
}

function WhiteDwarfVisualFocus({ anchor }: { anchor: WhiteDwarfAnchor }) {
  const style = whiteDwarfStyle(anchor);
  return (
    <FocusFrame eyebrow="White Dwarf Synopsis" synopsis={buildWhiteDwarfSynopsis(anchor)}>
      <div className="relative min-h-[18rem] overflow-hidden rounded-[1.5rem] border border-white/8 bg-[radial-gradient(circle_at_50%_28%,rgba(190,225,255,0.14),transparent_0_18%,rgba(125,190,255,0.08)_32%,transparent_56%),linear-gradient(180deg,rgba(7,16,36,0.82),rgba(2,8,18,0.96))]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative rounded-full"
            style={{
              width: "6.8rem",
              height: "6.8rem",
              background: `radial-gradient(circle at 40% 38%, rgba(255,255,255,0.98), ${style.core} 30%, ${style.rim} 72%, rgba(0,0,0,0.16) 100%)`,
              boxShadow: `0 0 46px ${hexToRgba(style.halo, 0.3)}, 0 0 110px ${hexToRgba(style.corona, 0.18)}`,
            }}
          />
        </div>
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/8 bg-slate-950/38 px-3 py-2 text-xs text-slate-200/74">
          White dwarf lab layer · {anchor.spectralType ?? "type unresolved"} · {anchor.massSolar ? `${formatNumber(anchor.massSolar, 2)} M☉` : "mass unresolved"}
        </div>
      </div>
    </FocusFrame>
  );
}

function ReferenceStarVisualFocus({ star }: { star: ReferenceStar }) {
  const style = stellarStyleFromData({
    seedKey: `reference-${star.name}`,
    spectralType: star.spectralType,
    effectiveTemperatureK: star.effectiveTemperatureK,
    luminositySolar: star.luminositySolar,
    radiusSolar: star.radiusSolar,
  });
  const starSize = clamp((0.26 + Math.pow(star.radiusSolar, 0.55) * 0.12) * 88, 74, 164);
  return (
    <FocusFrame eyebrow="Reference Star Synopsis" synopsis={buildReferenceStarSynopsis(star)}>
      <div className="relative min-h-[18rem] overflow-hidden rounded-[1.5rem] border border-white/8 bg-[radial-gradient(circle_at_26%_28%,rgba(255,255,255,0.10),transparent_0_20%,rgba(255,170,120,0.06)_34%,transparent_58%),linear-gradient(180deg,rgba(7,16,36,0.82),rgba(2,8,18,0.96))]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative rounded-full"
            style={{
              width: `${starSize}px`,
              height: `${starSize}px`,
              background: `radial-gradient(circle at 38% 36%, rgba(255,255,255,0.96), ${style.core} 24%, ${style.rim} 68%, rgba(0,0,0,0.2) 100%)`,
              boxShadow: `0 0 54px ${hexToRgba(style.halo, 0.28)}, 0 0 116px ${hexToRgba(style.corona, 0.16)}`,
            }}
          >
            <div
              className="absolute inset-0 rounded-full opacity-58 mix-blend-screen"
              style={{
                background: `radial-gradient(circle at 56% 42%, rgba(255,255,255,0) 0 36%, ${hexToRgba(style.core, 0.18)} 52%, rgba(255,255,255,0) 72%)`,
              }}
            />
          </div>
        </div>
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/8 bg-slate-950/38 px-3 py-2 text-xs text-slate-200/74">
          Reference-star layer · {star.spectralType} · {formatNumber(star.effectiveTemperatureK, 0)} K
        </div>
      </div>
    </FocusFrame>
  );
}

function buildObservedMetrics(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null): Metric[] {
  const local = mergedLocalAnalysis(system, planet, science);
  const propagation = activePropagation(planet, science);
  const shared: Metric[] = [
    {
      label: "Distance",
      value: `${formatNumber(system.distancePc, 2)} pc`,
      note: `${formatNumber(distanceLy(system.distancePc), 1)} light-years from the Sun.`,
      kind: "observed",
    },
    {
      label: "RA / Dec",
      value: `${formatNumber(system.raDeg, 2)}° / ${formatSigned(system.decDeg, 2)}°`,
      note: "Archive sky position of the host system.",
      kind: "observed",
    },
    {
      label: "Host Teff",
      value: system.stellar.effectiveTemperatureK ? `${formatNumber(system.stellar.effectiveTemperatureK, 0)} K` : "Unknown",
      note: "Effective temperature from the archive stellar record.",
      kind: "observed",
    },
    {
      label: "Spectral Type",
      value: system.stellar.spectralType ?? "Unknown",
      note: "Spectral classification as provided by the current official source.",
      kind: "observed",
    },
  ];

  if (!planet) {
    return [
      ...shared,
      {
        label: "Host Radius",
        value: system.stellar.radiusSolar ? `${formatNumber(system.stellar.radiusSolar, 2)} R☉` : "Unknown",
        note: "Observed stellar radius when available in the archive row set.",
        kind: "observed",
      },
      {
        label: "Host Mass",
        value: system.stellar.massSolar ? `${formatNumber(system.stellar.massSolar, 2)} M☉` : "Unknown",
        note: "Observed stellar mass when available in the archive row set.",
        kind: "observed",
      },
      {
        label: "Host V/J/K",
        value: system.stellar.photometry.vMag !== null || system.stellar.photometry.jMag !== null || system.stellar.photometry.kMag !== null
          ? `${formatNumber(system.stellar.photometry.vMag, 2)} / ${formatNumber(system.stellar.photometry.jMag, 2)} / ${formatNumber(system.stellar.photometry.kMag, 2)}`
          : "Unknown",
        note: "Archive stellar photometry carried forward for planning constraints.",
        kind: "observed",
        provenance: "Source: NASA Exoplanet Archive photometry columns sy_vmag/sy_jmag/sy_kmag",
      },
      {
        label: "Planet Count",
        value: `${system.planetCount}`,
        note: "Confirmed planets represented in this snapshot.",
        kind: "observed",
      },
      ...(local
        ? [{
            label: "Local Science Layer",
            value: local.interestingReason ?? "Merged",
            note: local.jwstInstrumentLabels.length
              ? `Legacy bundle instruments: ${local.jwstInstrumentLabels.slice(0, 3).join(", ")}.`
              : "Legacy EXOPLANET_ANALYSES bundle merged for this system.",
            kind: "source" as const,
            provenance: "Source: local EXOPLANET_ANALYSES registry",
          }]
        : []),
    ];
  }

  return [
    ...shared,
    {
      label: "Planet Radius",
      value: planet.radiusEarth ? `${formatNumber(planet.radiusEarth, 2)} R⊕` : "Unknown",
      note: [
        "Observed planetary radius from the archive row.",
        science ? `Archive/exo.MAST uncertainty: ${measurementBoundsText(science.uncertainty.radiusEarth, 2, " R⊕") ?? "unresolved"}.` : null,
        propagation?.radiusEarth ? `Propagated interval: ${intervalSummary(propagation.radiusEarth, 2, " R⊕") ?? "unresolved"}.` : null,
      ].filter(Boolean).join(" "),
      kind: "observed",
      provenance: "Source: NASA Exoplanet Archive pl_rade",
    },
    {
      label: "Planet Mass",
      value: planet.massEarth ? `${formatNumber(planet.massEarth, 2)} M⊕` : "Unknown",
      note: [
        "Observed planetary mass from the archive row.",
        science ? `Archive/exo.MAST uncertainty: ${measurementBoundsText(science.uncertainty.massEarth, 2, " M⊕") ?? "unresolved"}.` : null,
        propagation?.massEarth ? `Propagated interval: ${intervalSummary(propagation.massEarth, 2, " M⊕") ?? "unresolved"}.` : null,
      ].filter(Boolean).join(" "),
      kind: "observed",
      provenance: "Source: NASA Exoplanet Archive pl_bmasse",
    },
    {
      label: "Equilibrium Temp",
      value: planet.equilibriumK ? `${formatNumber(planet.equilibriumK, 0)} K` : "Unknown",
      note: [
        "Loaded archive equilibrium-temperature field.",
        science ? `Archive/exo.MAST uncertainty: ${measurementBoundsText(science.uncertainty.equilibriumK, 0, " K") ?? "unresolved"}.` : null,
        propagation?.equilibriumK ? `Propagated interval: ${intervalSummary(propagation.equilibriumK, 0, " K") ?? "unresolved"}.` : null,
      ].filter(Boolean).join(" "),
      kind: "observed",
      provenance: "Source: NASA Exoplanet Archive pl_eqt",
    },
    {
      label: "Eccentricity",
      value: planet.eccentricity !== null && planet.eccentricity !== undefined ? formatNumber(planet.eccentricity, 3) : "Unknown",
      note: "Archive orbital eccentricity where reported.",
      kind: "observed",
      provenance: "Source: NASA Exoplanet Archive pl_orbeccen",
    },
    {
      label: "Semi-major Axis",
      value: planet.semiMajorAxisAu ? `${formatNumber(planet.semiMajorAxisAu, 3)} AU` : "Unknown",
      note: [
        "Observed orbital scale for the current catalog entry.",
        science ? `Archive/exo.MAST uncertainty: ${measurementBoundsText(science.uncertainty.semiMajorAxisAu, 3, " AU") ?? "unresolved"}.` : null,
        propagation?.semiMajorAxisAu ? `Propagated interval: ${intervalSummary(propagation.semiMajorAxisAu, 3, " AU") ?? "unresolved"}.` : null,
      ].filter(Boolean).join(" "),
      kind: "observed",
      provenance: "Source: NASA Exoplanet Archive pl_orbsmax",
    },
    {
      label: "Host J / K",
      value: science?.stellar.photometry.jMag !== null || science?.stellar.photometry.kMag !== null
        ? `${formatNumber(science?.stellar.photometry.jMag, 2)} / ${formatNumber(science?.stellar.photometry.kMag, 2)} mag`
        : system.stellar.photometry.jMag !== null || system.stellar.photometry.kMag !== null
          ? `${formatNumber(system.stellar.photometry.jMag, 2)} / ${formatNumber(system.stellar.photometry.kMag, 2)} mag`
          : "Unknown",
      note: "Host brightness constraints for transit/instrument planning.",
      kind: "observed",
      provenance: "Source: NASA Exoplanet Archive host photometry columns",
    },
    ...(local
      ? [{
          label: "Legacy Habitability",
          value: local.habitability ?? "No habitability note",
          note: "Pulled from the original EXOPLANET_ANALYSES bundle and kept separate from the official catalog row.",
          kind: "source" as const,
          provenance: "Source: local EXOPLANET_ANALYSES narrative bundle",
        }]
      : []),
  ];
}

function buildDerivedMetrics(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null): Metric[] {
  const xyz = system.cartesianPc;
  const hz = habitableZoneAu(system);
  const lum = stellarLuminosity(system);
  const local = mergedLocalAnalysis(system, planet, science);
  const propagation = activePropagation(planet, science);

  if (!planet) {
    return [
      {
        label: "Sun-centered XYZ",
        value: `${formatSigned(xyz.x, 2)}, ${formatSigned(xyz.y, 2)}, ${formatSigned(xyz.z, 2)} pc`,
        note: "Derived from RA, Dec, and distance in the current equatorial frame.",
        kind: "derived",
        provenance: "Source: archive RA/Dec/distance fields",
        equation: "Eq: Cartesian transform from spherical coordinates",
      },
      {
        label: "Luminosity Proxy",
        value: lum ? `${formatNumber(lum, 2)} L☉` : "Insufficient host data",
        note: "Stefan-Boltzmann scaling from host radius and effective temperature.",
        kind: "derived",
        provenance: "Source: host radius + effective temperature",
        equation: "Eq: L/L☉ = R² (T/5772 K)^4",
      },
      {
        label: "Habitable Zone",
        value: hz ? `${formatNumber(hz.inner, 2)} - ${formatNumber(hz.outer, 2)} AU` : "Insufficient host data",
        note: "Simple luminosity-scaled approximation for a first-pass system context.",
        kind: "inferred",
        provenance: "Source: derived luminosity proxy",
        equation: "Eq: a_HZ ∝ sqrt(L/L☉)",
      },
      {
        label: "System Architecture",
        value: systemCompactness(system) ? `${formatNumber(systemCompactness(system), 2)} AU mean orbit` : "Sparse orbital data",
        note: "Mean orbital scale for planets with reported semi-major axis.",
        kind: "inferred",
        provenance: "Source: planet semi-major-axis fields in current snapshot",
      },
    ];
  }

  const density = densityGcc(planet);
  const speed = orbitVelocityKmS(system, planet);
  const insolation = science?.radiation.fluxEarthMultiple ?? insolationEarth(system, planet);
  const hzText = hz && planet.semiMajorAxisAu
    ? planet.semiMajorAxisAu >= hz.inner && planet.semiMajorAxisAu <= hz.outer
      ? "Inside first-pass HZ"
      : "Outside first-pass HZ"
    : "HZ placement unresolved";

  const metrics: Metric[] = [
    {
      label: "Bulk Density",
      value: density ? `${formatNumber(density, 2)} g/cm³` : "Insufficient mass/radius",
      note: propagation?.densityGcc
        ? `Earth-scaled density estimate from observed mass and radius. Propagated interval: ${intervalSummary(propagation.densityGcc, 2, " g/cm³") ?? "unresolved"}.`
        : "Earth-scaled density estimate from observed mass and radius.",
      kind: "derived",
      provenance: "Source: pl_bmasse + pl_rade",
      equation: "Eq: rho = 5.51 * (M/M⊕) / (R/R⊕)^3",
    },
    {
      label: "Incident Flux",
      value: insolation ? `${formatNumber(insolation, 2)} S⊕` : "Insufficient orbit/host data",
      note: [
        science?.radiation.fluxEarthMultiple !== null && science?.radiation.fluxEarthMultiple !== undefined
          ? `Official internet-backed flux layer: ${formatNumber(science?.radiation.fluxWm2, 0)} W/m².`
          : "Luminosity proxy divided by orbital distance squared.",
        propagation?.fluxEarthMultiple
          ? `Propagated interval: ${intervalSummary(propagation.fluxEarthMultiple, 2, " S⊕") ?? "unresolved"}.`
          : null,
      ].filter(Boolean).join(" "),
      kind: "derived",
      provenance: science?.radiation.fluxEarthMultiple !== null && science?.radiation.fluxEarthMultiple !== undefined
        ? "Source: selected-planet official enrichment bundle"
        : "Source: host luminosity proxy + semi-major axis",
      equation: "Eq: S/S⊕ = (L/L☉) / a²",
    },
    {
      label: "Orbital Velocity",
      value: speed ? `${formatNumber(speed, 1)} km/s` : "Insufficient orbit/host data",
      note: "Keplerian first-order estimate from stellar mass and semi-major axis.",
      kind: "derived",
      provenance: "Source: stellar mass + semi-major axis",
      equation: "Eq: v ≈ 29.78 * sqrt(M★/a)",
    },
    {
      label: "Regime",
      value: `${planetClass(planet)} | ${temperatureClass(planet.equilibriumK)}`,
      note: `${hzText}.`,
      kind: "inferred",
      provenance: "Source: planet radius/mass/temperature regime interpretation",
    },
    {
      label: "Magnetosphere",
      value: science?.magnetosphere.surfaceFieldMicroTesla !== null && science?.magnetosphere.surfaceFieldMicroTesla !== undefined
        ? `${formatNumber(science?.magnetosphere.surfaceFieldMicroTesla, 1)} microT`
        : "Pending enriched pull",
      note: science
        ? `Radiation-pressure-adjusted proxy. Magnetopause ${formatNumber(science.magnetosphere.magnetopauseRadii, 1)} Rp; shielding ${science.magnetosphere.protection}.`
        : "Loads from the per-planet enrichment route once the official pull completes.",
      kind: "inferred",
      provenance: science ? "Source: selected-planet magnetosphere audit" : "Source: pending per-planet enrichment route",
      equation: "Eq: dynamo/stellar-wind proxy + escape-regime audit",
    },
  ];

  if (science) {
    metrics.push({
      label: "JWST Coverage",
      value: wavelengthCoverageText(science) ?? "Metadata only",
      note: `${science.spectrum.jwstObservations.length} observation(s), ${science.spectrum.jwstProducts.length} product(s), ${science.spectrum.curatedTransmissionFiles.length} curated transmission file(s), ${science.spectrum.numericSeries.length} parsed numeric spectrum series.`,
      kind: "observed",
      provenance: "Source: exo.MAST + MAST JWST observation/product inventory",
    });
    metrics.push({
      label: "Atmosphere Evidence",
      value: chemistrySummary(science) ?? "No molecule tags yet",
      note: science.atmosphere.cloudInterpretation,
      kind: "inferred",
      provenance: "Source: curated transmission spectra + JWST mode/coverage metadata + local chemistry tags",
      equation: "Eq: transmission amplitude/slope heuristic vs one-scale-height expectation",
    });
  }

  if (science?.retention) {
    metrics.push({
      label: "Escape / Retention Audit",
      value: retentionDisplayValue(science.retention),
      note: `${retentionDisplayDetail(science.retention)}. ${science.retention.notes[0] ?? "Escape-regime reinterpretation of the legacy retention language."}`,
      kind: "inferred",
      provenance: "Source: selected-planet escape-regime audit",
      equation: "Eq: Jeans parameter + irradiation stress + energy-limited loss proxy",
    });
  }

  if (local) {
    metrics.push({
      label: "Local Magnetosphere",
      value: local.surfaceFieldMicroTesla !== null && local.surfaceFieldMicroTesla !== undefined
        ? `${formatNumber(local.surfaceFieldMicroTesla, 1)} microT`
        : "No local field estimate",
      note: local.magnetopauseRadii !== null && local.magnetopauseRadii !== undefined
        ? `Legacy magnetopause estimate ${formatNumber(local.magnetopauseRadii, 1)} Rp.`
        : "Original EXOPLANET_ANALYSES interpretation layer.",
      kind: "source",
      provenance: "Source: local EXOPLANET_ANALYSES magnetosphere layer",
    });
  }

  if (science?.interior && science.interior.composition !== "unresolved") {
    const top = science.interior.probabilities?.[0];
    metrics.push({
      label: "Interior Composition",
      value: `${titleCaseSlug(science.interior.composition)}${top ? ` (${Math.round(top.probability * 100)}% ${titleCaseSlug(top.composition)})` : ""}`,
      note: science.interior.requiresVolatiles
        ? "Radius exceeds a pure-rock body at this mass, so a volatile layer is required. Monte Carlo over mass-radius uncertainty vs Zeng et al. (2016) curves."
        : "Bulk composition from the mass-radius point vs Zeng et al. (2016) reference curves; probabilities from Monte Carlo over the uncertainties.",
      kind: "inferred",
      provenance: "Source: archive mass + radius",
      equation: "Eq: R = C * M^(1/3.7) reference curves (iron/rock/water)",
    });
  }

  if (science?.earthSimilarity) {
    const esi = science.earthSimilarity;
    metrics.push({
      label: "Earth Similarity Index",
      value: `${formatNumber(esi.index, 2)} (interior ${formatNumber(esi.interiorIndex, 2)}, surface ${formatNumber(esi.surfaceIndex, 2)})`,
      note: "Schulze-Makuch et al. (2011) similarity over radius, density, escape velocity, and equilibrium temperature. A similarity score, not a habitability probability.",
      kind: "derived",
      provenance: "Source: archive radius / mass / temperature",
      equation: "Eq: ESI = product (1 - |(x - x_E)/(x + x_E)|)^(w/n)",
    });
  }

  if (science?.habitableZone) {
    const hz = science.habitableZone;
    metrics.push({
      label: "Habitable Zone (Kopparapu)",
      value: `${titleCaseSlug(hz.zone)}${hz.insolationEarth !== null && hz.insolationEarth !== undefined ? ` at ${formatNumber(hz.insolationEarth, 2)} S⊕` : ""}`,
      note: `Conservative ${formatNumber(hz.conservativeInnerAu, 2)}-${formatNumber(hz.conservativeOuterAu, 2)} AU, optimistic ${formatNumber(hz.optimisticInnerAu, 2)}-${formatNumber(hz.optimisticOuterAu, 2)} AU (Kopparapu et al. 2013).`,
      kind: "inferred",
      provenance: "Source: stellar luminosity + effective temperature",
      equation: "Eq: d = sqrt((L/L_sun)/S_eff), S_eff quartic in (Teff - 5780)",
    });
  }

  if (science?.transmission) {
    const t = science.transmission;
    metrics.push({
      label: "Atmosphere (spectrum)",
      value: `${titleCaseSlug(t.atmosphereClass)} (mu ~ ${formatNumber(t.impliedMeanMolecularWeightAmu, 1)} amu)`,
      note: `Mean molecular weight inverted from a ${formatNumber(t.featureAmplitudePpm, 0)} ppm feature amplitude via scale-height physics; H ~ ${formatNumber(t.impliedScaleHeightKm, 0)} km. Screen, not a full retrieval.`,
      kind: "inferred",
      provenance: "Source: transmission spectrum sample",
      equation: "Eq: dDepth ~ 2 N_H H R_p / R_star^2; mu = kT/(H g)",
    });
  }

  if (science?.emission) {
    const e = science.emission;
    metrics.push({
      label: "Thermal Emission",
      value: `Dayside ${formatNumber(e.daysideTemperatureK, 0)} K, peak ${formatNumber(e.thermalPeakUm, 1)} um${e.secondaryEclipseDepthPpm !== null && e.secondaryEclipseDepthPpm !== undefined ? `, eclipse ${formatNumber(e.secondaryEclipseDepthPpm, 0)} ppm at ${e.referenceWavelengthUm}um` : ""}`,
      note: "Dayside temperature (no heat redistribution), Wien peak wavelength, and a blackbody secondary-eclipse depth. Emission-side estimate.",
      kind: "derived",
      provenance: "Source: equilibrium temperature + stellar Teff + R_p/R_star",
      equation: "Eq: T_day = T_eq (8/3)^0.25; depth = (Rp/Rs)^2 B(l,Tp)/B(l,Ts)",
    });
  }

  if (science?.massForecast) {
    const f = science.massForecast;
    metrics.push({
      label: "Mass Forecast (M-R)",
      value: `${formatNumber(f.massEarth, 2)} M(+) (${formatNumber(f.lowEarth, 2)}-${formatNumber(f.highEarth, 2)})`,
      note: `Empirical mass-radius forecast (QR least-squares fit, ${f.scatterDex} dex scatter). ${f.notes[f.notes.length - 1] ?? ""}`,
      kind: "inferred",
      provenance: "Source: empirical mass-radius relation over archive planets",
      equation: `Eq: ${f.relation}`,
    });
  }

  return metrics;
}

function buildUncertaintyMetrics(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null): Metric[] {
  if (!planet) {
    return [
      {
        label: "Current state",
        value: "Catalog-grade",
        note: "The rewrite now carries archive photometry and uncertainty fields. Planet-selected internet enrichment fills the deeper bundle.",
        kind: "source",
        provenance: "Source: archive snapshot + selected-target enrichment route",
      },
    ];
  }

  if (science) {
    return [
      {
        label: "Radius / Mass",
        value: `${formatNumber(science.uncertainty.radiusEarth.plus, 2)} / ${formatNumber(science.uncertainty.massEarth.plus, 2)}`,
        note: "Positive-side archive or exo.MAST error bars for radius and mass.",
        kind: "source",
        provenance: "Source: archive/exo.MAST measurement uncertainties",
      },
      {
        label: "Teq / Orbit",
        value: `${formatNumber(science.uncertainty.equilibriumK.plus, 0)} K / ${formatNumber(science.uncertainty.semiMajorAxisAu.plus, 3)} AU`,
        note: `Official uncertainty widths now feed a ${science.propagation.sampleCount}-sample Monte Carlo pass (${science.propagation.inputMode}).`,
        kind: "source",
        provenance: "Source: archive/exo.MAST uncertainties",
      },
      {
        label: "Stellar inputs",
        value: `${formatNumber(science.uncertainty.stellarTemperatureK.plus, 0)} K / ${formatNumber(science.uncertainty.stellarRadiusSolar.plus, 3)} R☉`,
        note: "Host-star uncertainty carried from archive/exo.MAST into the selected-planet bundle.",
        kind: "source",
        provenance: "Source: archive/exo.MAST stellar uncertainties",
      },
      {
        label: "Density / Gravity",
        value: `${formatNumber(science.propagation.densityGcc.median, 2)} g/cc / ${formatNumber(science.propagation.surfaceGravityMs2.median, 1)} m/s²`,
        note: `${formatNumber(science.propagation.densityGcc.low, 2)}-${formatNumber(science.propagation.densityGcc.high, 2)} g/cc and ${formatNumber(science.propagation.surfaceGravityMs2.low, 1)}-${formatNumber(science.propagation.surfaceGravityMs2.high, 1)} m/s² across the propagated interval.`,
        kind: "derived",
        provenance: "Source: Monte Carlo propagation over archive/exo.MAST uncertainties",
        equation: "Eq: rho(M,R), g(M,R)",
      },
      {
        label: "Flux / Scale Height",
        value: `${formatNumber(science.propagation.fluxEarthMultiple.median, 2)} S⊕ / ${formatNumber(science.propagation.scaleHeightKm.median, 0)} km`,
        note: `${formatNumber(science.propagation.fluxEarthMultiple.low, 2)}-${formatNumber(science.propagation.fluxEarthMultiple.high, 2)} S⊕ flux and ${formatNumber(science.propagation.oneScaleHeightSignalPpm.median, 0)} ppm one-scale-height signal.`,
        kind: "derived",
        provenance: "Source: Monte Carlo propagation over stellar + orbital inputs",
        equation: "Eq: S/S⊕ = L/a², H = kT/(μg), signal ≈ 2HRp/Rs²",
      },
    ];
  }

  if (planet?.propagation) {
    return [
      {
        label: "Wide-field Propagation",
        value: `${planet.propagation.sampleCount} samples`,
        note: `Snapshot-level Monte Carlo propagation (${planet.propagation.inputMode}) runs even before selected-target enrichment resolves.`,
        kind: "source",
        provenance: "Source: archive snapshot uncertainties",
      },
      {
        label: "Density / Gravity",
        value: `${formatNumber(planet.propagation.densityGcc.median, 2)} g/cc / ${formatNumber(planet.propagation.surfaceGravityMs2.median, 1)} m/s²`,
        note: `${formatNumber(planet.propagation.densityGcc.low, 2)}-${formatNumber(planet.propagation.densityGcc.high, 2)} g/cc and ${formatNumber(planet.propagation.surfaceGravityMs2.low, 1)}-${formatNumber(planet.propagation.surfaceGravityMs2.high, 1)} m/s².`,
        kind: "derived",
        provenance: "Source: wide-snapshot propagation",
        equation: "Eq: rho(M,R), g(M,R)",
      },
      {
        label: "Flux / Scale Height",
        value: `${formatNumber(planet.propagation.fluxEarthMultiple.median, 2)} S⊕ / ${formatNumber(planet.propagation.scaleHeightKm.median, 0)} km`,
        note: `${formatNumber(planet.propagation.fluxEarthMultiple.low, 2)}-${formatNumber(planet.propagation.fluxEarthMultiple.high, 2)} S⊕ and ${formatNumber(planet.propagation.oneScaleHeightSignalPpm.median, 0)} ppm one-scale-height signal.`,
        kind: "derived",
        provenance: "Source: wide-snapshot propagation",
        equation: "Eq: S/S⊕ = L/a², H = kT/(μg)",
      },
    ];
  }

  const missing = [
    !planet.massEarth && "mass",
    !planet.radiusEarth && "radius",
    !planet.equilibriumK && "equilibrium temperature",
    !planet.semiMajorAxisAu && "semi-major axis",
    !system.stellar.massSolar && "host mass",
  ].filter(Boolean);

  return [
    {
      label: "Propagation state",
      value: missing.length ? "Partial" : "Ready for next pass",
      note: missing.length
        ? `Archive fields still missing: ${missing.join(", ")}.`
        : "The archive row contains the minimum fields required for first-pass Monte Carlo propagation.",
      kind: "source",
    },
  ];
}

function buildObservationPlan(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  if (!planet) {
    return "Select a planet to move from system geometry into target-specific planning. The science-side structure is preserved here, but the new pipeline still needs brightness metadata and archive uncertainties before it can issue instrument-grade mode decisions.";
  }

  const propagation = activePropagation(planet, science);
  const insolation = science?.radiation.fluxEarthMultiple ?? propagation?.fluxEarthMultiple.median ?? insolationEarth(system, planet);
  const thermal = temperatureClass(propagation?.equilibriumK.median ?? planet.equilibriumK);
  const brightness = science?.stellar.photometry.jMag ?? system.stellar.photometry.jMag;
  const kBrightness = science?.stellar.photometry.kMag ?? system.stellar.photometry.kMag;
  const spectra = science?.spectrum.fileCount ?? 0;
  const coverage = wavelengthCoverageText(science);
  const modes = jwstModeSummary(science);
  const signal = propagation?.oneScaleHeightSignalPpm.median;
  const fluxRange = intervalSummary(propagation?.fluxEarthMultiple, 2, " S⊕");
  const tempRange = intervalSummary(propagation?.equilibriumK, 0, " K");
  const radiusRange = intervalSummary(propagation?.radiusEarth, 2, " R⊕");
  const recommendations = buildPlannerRecommendations(system, planet, science).map(plannerRecommendationText).join(" | ");
  return `Next observation priority: constrain atmosphere and orbit jointly. ${planet.name} currently reads as a ${thermal} target with ${insolation ? `${formatNumber(insolation, 2)} S⊕ insolation` : "unresolved insolation"}, ${brightness !== null && brightness !== undefined ? `J=${formatNumber(brightness, 2)} mag` : "unresolved J-band brightness"}, and ${kBrightness !== null && kBrightness !== undefined ? `K=${formatNumber(kBrightness, 2)} mag` : "unresolved K-band brightness"}. ${fluxRange ? `Propagated flux range: ${fluxRange}. ` : ""}${tempRange ? `Propagated equilibrium-temperature range: ${tempRange}. ` : ""}${radiusRange ? `Propagated radius range: ${radiusRange}. ` : ""}${spectra ? `The joined JWST inventory already contains ${science?.spectrum.jwstObservations.length ?? 0} observation(s), ${science?.spectrum.jwstProducts.length ?? 0} product(s), ${science?.spectrum.numericSeries.length ?? 0} parsed numeric spectrum series, and ${spectra} linked spectral asset(s)` : "No exo.MAST / MAST spectral assets were returned in this pass."}${coverage ? ` spanning ${coverage}` : ""}${modes.length ? ` via ${modes.join(", ")}` : ""}. ${signal !== null ? `Propagated one-scale-height signal is ${intervalSummary(propagation?.oneScaleHeightSignalPpm, 0, " ppm") ?? `${formatNumber(signal, 0)} ppm`}.` : "Scale-height signal remains unresolved."} Planner recommendations: ${recommendations}. ETC/APT visibility and saturation screening are still required before any of these modes should be treated as executable observation setups.`;
}

function analysisClaim(input: {
  label: string;
  classification: "O" | "D" | "I" | "S";
  value: string;
  source: string;
  equation?: string;
}) {
  const suffix = [
    `source: ${input.source}`,
    input.equation,
  ].filter(Boolean).join(" | ");
  return `- ${input.label} [${input.classification}]: ${input.value}${suffix ? ` {${suffix}}` : ""}`;
}

function dedupeSources(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  const combined = [...system.provenance, ...(planet?.provenance ?? []), ...(science?.sources ?? [])];
  const seen = new Set<string>();
  return combined.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function buildAnalysis(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null) {
  const local = mergedLocalAnalysis(system, planet, science);
  if (planet && science?.localAnalysis?.narrative) {
    const localStructuredClaims = [
      analysisClaim({
        label: "Distance",
        classification: "O",
        value: `${formatNumber(system.distancePc, 2)} pc (${formatNumber(distanceLy(system.distancePc), 2)} ly)`,
        source: "NASA Exoplanet Archive host row",
      }),
      analysisClaim({
        label: "Bulk density",
        classification: "D",
        value: densityGcc(planet) ? `${formatNumber(densityGcc(planet), 2)} g/cm³` : "requires both mass and radius",
        source: "pl_bmasse + pl_rade from archive/enrichment bundle",
        equation: "Eq: rho = 5.51 * (M/M⊕) / (R/R⊕)^3",
      }),
      ...(science
        ? [
            analysisClaim({
              label: "Propagated density / gravity",
              classification: "D",
              value: `${formatNumber(science.propagation.densityGcc.median, 2)} g/cm³ / ${formatNumber(science.propagation.surfaceGravityMs2.median, 1)} m/s²`,
              source: `selected-planet Monte Carlo propagation (${science.propagation.sampleCount} samples, ${science.propagation.inputMode})`,
              equation: "Eq: rho(M,R), g(M,R)",
            }),
            analysisClaim({
              label: "Escape / retention audit",
              classification: "I",
              value: `${retentionDisplayValue(science.retention)}; ${retentionDisplayDetail(science.retention)}`,
              source: "selected-planet escape-regime audit",
              equation: "Eq: Jeans parameter + irradiation stress + energy-limited loss proxy",
            }),
            analysisClaim({
              label: "JWST coverage",
              classification: "O",
              value: `${science.spectrum.jwstObservations.length} observation(s), ${science.spectrum.jwstProducts.length} product(s), ${science.spectrum.numericSeries.length} parsed numeric series`,
              source: "exo.MAST + MAST JWST observation/product inventory",
            }),
          ]
        : []),
    ];
    const localLines = [
      `TARGET: ${planet.name}`,
      `HOST SYSTEM: ${system.name}`,
      `LOCAL ANALYSIS SOURCE: ${science.localAnalysis.sourceLabel}${science.localAnalysis.registryVersion ? ` (${science.localAnalysis.registryVersion})` : ""}`,
      ...(science.localAnalysis.habitability ? [`LOCAL HABITABILITY FLAG: ${science.localAnalysis.habitability}`] : []),
      ...(science.localAnalysis.interestingReason ? [`LOCAL INTERESTING FLAG: ${science.localAnalysis.interestingReason}`] : []),
      "",
      "STRUCTURED CLAIM BASIS",
      ...localStructuredClaims,
      "",
      "PHYSICS CAVEATS",
      ...science.localAnalysis.caveats.map((line) => `- ${line}`),
      "",
      "LOCAL REPORTS",
      ...science.localAnalysis.reports.map((report) => `- ${report.label} | ${report.filename}`),
      "",
      science.localAnalysis.narrative,
      "",
      "PROVENANCE",
      ...dedupeSources(system, planet, science).map((source) => `- ${source.name} (${source.kind}) | cache=${source.cache} | ${source.url}`),
    ];
    return localLines.join("\n");
  }

  const xyz = system.cartesianPc;
  const lum = stellarLuminosity(system);
  const hz = habitableZoneAu(system);
  const density = densityGcc(planet);
  const flux = science?.radiation.fluxEarthMultiple ?? insolationEarth(system, planet);
  const speed = orbitVelocityKmS(system, planet);
  const chemistry = chemistrySummary(science);
  const coverage = wavelengthCoverageText(science);
  const lines = [
    `TARGET: ${planet ? planet.name : system.name}`,
    `HOST SYSTEM: ${system.name}`,
    `FRAME: Sun-centered equatorial XYZ generated from official archive RA / Dec / distance.`,
    "",
    "OBSERVED INPUTS [O]",
    analysisClaim({
      label: "Distance",
      classification: "O",
      value: `${formatNumber(system.distancePc, 2)} pc (${formatNumber(distanceLy(system.distancePc), 2)} ly)`,
      source: "NASA Exoplanet Archive host row",
    }),
    analysisClaim({
      label: "Right ascension / declination",
      classification: "O",
      value: `${formatNumber(system.raDeg, 3)}° / ${formatSigned(system.decDeg, 3)}°`,
      source: "NASA Exoplanet Archive host row",
    }),
    analysisClaim({
      label: "Host effective temperature",
      classification: "O",
      value: system.stellar.effectiveTemperatureK ? `${formatNumber(system.stellar.effectiveTemperatureK, 0)} K` : "not present in the current row set",
      source: "st_teff / selected-host enrichment",
    }),
    analysisClaim({
      label: "Host radius / mass",
      classification: "O",
      value: `${system.stellar.radiusSolar ? `${formatNumber(system.stellar.radiusSolar, 2)} R☉` : "unknown"} / ${system.stellar.massSolar ? `${formatNumber(system.stellar.massSolar, 2)} M☉` : "unknown"}`,
      source: "st_rad + st_mass / selected-host enrichment",
    }),
    analysisClaim({
      label: "Spectral type",
      classification: "O",
      value: system.stellar.spectralType ?? "not specified",
      source: "archive spectral type / local science merge",
    }),
    analysisClaim({
      label: "Host photometry",
      classification: "O",
      value: `V=${formatNumber(system.stellar.photometry.vMag, 2)} mag, J=${formatNumber(system.stellar.photometry.jMag, 2)} mag, K=${formatNumber(system.stellar.photometry.kMag, 2)} mag`,
      source: "sy_vmag + sy_jmag + sy_kmag",
    }),
    ...(planet
      ? [
          analysisClaim({
            label: "Planet radius",
            classification: "O",
            value: planet.radiusEarth ? `${formatNumber(planet.radiusEarth, 2)} R⊕` : "not present",
            source: "pl_rade / selected-planet enrichment",
          }),
          analysisClaim({
            label: "Planet mass",
            classification: "O",
            value: planet.massEarth ? `${formatNumber(planet.massEarth, 2)} M⊕` : "not present",
            source: "pl_bmasse / selected-planet enrichment",
          }),
          analysisClaim({
            label: "Equilibrium temperature",
            classification: "O",
            value: planet.equilibriumK ? `${formatNumber(planet.equilibriumK, 0)} K` : "not present",
            source: "pl_eqt / selected-planet enrichment",
          }),
          analysisClaim({
            label: "Semi-major axis / orbital period",
            classification: "O",
            value: `${planet.semiMajorAxisAu ? `${formatNumber(planet.semiMajorAxisAu, 3)} AU` : "not present"} / ${planet.orbitalPeriodDays ? `${formatNumber(planet.orbitalPeriodDays, 2)} d` : "not present"}`,
            source: "pl_orbsmax + pl_orbper / selected-planet enrichment",
          }),
          analysisClaim({
            label: "Eccentricity / inclination",
            classification: "O",
            value: `${planet.eccentricity !== null && planet.eccentricity !== undefined ? formatNumber(planet.eccentricity, 3) : "not present"} / ${planet.inclinationDeg !== null && planet.inclinationDeg !== undefined ? `${formatNumber(planet.inclinationDeg, 2)}°` : "not present"}`,
            source: "pl_orbeccen + pl_orbincl",
          }),
        ]
      : [analysisClaim({
          label: "Planet count",
          classification: "O",
          value: String(system.planetCount),
          source: "archive-confirmed planet inventory in current snapshot",
        })]),
    "",
    "DERIVED AND INFERRED CONTEXT [D/I]",
    analysisClaim({
      label: "Sun-centered XYZ",
      classification: "D",
      value: `(${formatSigned(xyz.x, 3)}, ${formatSigned(xyz.y, 3)}, ${formatSigned(xyz.z, 3)}) pc`,
      source: "archive RA + Dec + distance",
      equation: "Eq: equatorial -> Cartesian transform",
    }),
    analysisClaim({
      label: "Host luminosity proxy",
      classification: "D",
      value: lum ? `${formatNumber(lum, 3)} L☉` : "insufficient stellar radius / temperature",
      source: "st_rad + st_teff",
      equation: "Eq: L/L☉ = R² (T/5772 K)^4",
    }),
    analysisClaim({
      label: "First-pass habitable zone",
      classification: "I",
      value: hz ? `${formatNumber(hz.inner, 2)} to ${formatNumber(hz.outer, 2)} AU` : "not computable from loaded fields",
      source: "derived luminosity proxy",
      equation: "Eq: a_HZ ∝ sqrt(L/L☉)",
    }),
    ...(planet
      ? [
          analysisClaim({
            label: "Planet class",
            classification: "I",
            value: planetClass(planet),
            source: "planet radius/mass regime interpretation",
          }),
          analysisClaim({
            label: "Thermal regime",
            classification: "I",
            value: temperatureClass(planet.equilibriumK),
            source: "equilibrium-temperature regime interpretation",
          }),
          analysisClaim({
            label: "Bulk density",
            classification: "D",
            value: density ? `${formatNumber(density, 2)} g/cm³` : "requires both mass and radius",
            source: "pl_bmasse + pl_rade",
            equation: "Eq: rho = 5.51 * (M/M⊕) / (R/R⊕)^3",
          }),
          analysisClaim({
            label: "Incident flux",
            classification: "D",
            value: flux ? `${formatNumber(flux, 2)} S⊕` : "requires host luminosity and semi-major axis",
            source: science?.radiation.fluxEarthMultiple !== null && science?.radiation.fluxEarthMultiple !== undefined
              ? "selected-planet official enrichment bundle"
              : "derived luminosity proxy + semi-major axis",
            equation: "Eq: S/S⊕ = (L/L☉) / a²",
          }),
          analysisClaim({
            label: "Orbital velocity",
            classification: "D",
            value: speed ? `${formatNumber(speed, 2)} km/s` : "requires host mass and semi-major axis",
            source: "stellar mass + semi-major axis",
            equation: "Eq: v ≈ 29.78 * sqrt(M★/a)",
          }),
          ...(science
            ? [
                analysisClaim({
                  label: "Dayside / nightside temperatures",
                  classification: "I",
                  value: `${science.temperatures.daysideK ? `${formatNumber(science.temperatures.daysideK, 0)} K` : "unresolved"} / ${science.temperatures.nightsideK ? `${formatNumber(science.temperatures.nightsideK, 0)} K` : "unresolved"}`,
                  source: "selected-planet thermal redistribution layer",
                }),
                analysisClaim({
                  label: "Magnetic field / magnetopause",
                  classification: "I",
                  value: `${science.magnetosphere.surfaceFieldMicroTesla ? `${formatNumber(science.magnetosphere.surfaceFieldMicroTesla, 1)} microT` : "unresolved"} / ${science.magnetosphere.magnetopauseRadii ? `${formatNumber(science.magnetosphere.magnetopauseRadii, 1)} Rp` : "unresolved"}`,
                  source: "selected-planet magnetosphere audit",
                  equation: "Eq: dynamo/stellar-wind proxy + escape-regime context",
                }),
                analysisClaim({
                  label: "Shielding class",
                  classification: "I",
                  value: science.magnetosphere.protection,
                  source: "selected-planet magnetosphere audit",
                }),
                analysisClaim({
                  label: "JWST observations / products",
                  classification: "O",
                  value: `${science.spectrum.jwstObservations.length} / ${science.spectrum.jwstProducts.length}`,
                  source: "MAST JWST observation/product inventory",
                }),
                analysisClaim({
                  label: "Spectral assets / parsed series",
                  classification: "O",
                  value: `${science.spectrum.fileCount} / ${science.spectrum.numericSeries.length}`,
                  source: "exo.MAST curated spectra + public JWST numeric extraction",
                }),
                analysisClaim({
                  label: "Wavelength coverage",
                  classification: "O",
                  value: coverage ?? "not yet constrained from the returned assets",
                  source: "curated spectra + JWST mode coverage merge",
                }),
                analysisClaim({
                  label: "Atmosphere evidence",
                  classification: "I",
                  value: chemistry ?? "No molecule tags yet",
                  source: "curated transmission spectra + JWST coverage metadata + local chemistry tags",
                  equation: "Eq: transmission amplitude/slope heuristic vs one-scale-height expectation",
                }),
                analysisClaim({
                  label: "Cloud / haze interpretation",
                  classification: "I",
                  value: science.atmosphere.cloudInterpretation,
                  source: "selected-planet atmosphere evidence layer",
                }),
                analysisClaim({
                  label: "Propagated density / gravity",
                  classification: "D",
                  value: `${formatNumber(science.propagation.densityGcc.median, 2)} g/cm³ / ${formatNumber(science.propagation.surfaceGravityMs2.median, 1)} m/s² from ${science.propagation.sampleCount} Monte Carlo samples (${science.propagation.inputMode})`,
                  source: "Monte Carlo propagation over archive/exo.MAST uncertainties",
                  equation: "Eq: rho(M,R), g(M,R)",
                }),
                analysisClaim({
                  label: "Escape / retention audit",
                  classification: "I",
                  value: `${retentionDisplayValue(science.retention)}; ${retentionDisplayDetail(science.retention)}`,
                  source: "selected-planet escape-regime audit",
                  equation: "Eq: Jeans parameter + irradiation stress + energy-limited loss proxy",
                }),
              ]
            : []),
        ]
      : [analysisClaim({
          label: "System compactness",
          classification: "I",
          value: systemCompactness(system) ? `${formatNumber(systemCompactness(system), 3)} AU mean orbit` : "insufficient semi-major-axis coverage",
          source: "mean semi-major axis across planets in current snapshot",
        })]),
    "",
    "SCIENCE INTERPRETATION",
    planet
      ? `${planet.name} is being organized as a science-first target card rather than a raw catalog row. The rewrite now pulls the selected target through official internet services, keeping the wide-field universe snapshot lightweight while enriching the active planet with archive uncertainties, exo.MAST references, radiation context, and a magnetosphere proxy tied to the same observed orbit/host data.${local?.interestingReason ? ` Local analysis also flags: ${local.interestingReason}.` : ""}`
      : `${system.name} is already usable as a system-level navigation object. The host position, stellar context, and planet inventory are live from the official archive path, which means the renderer can now be treated as a downstream science view instead of a source of truth.${local?.interestingReason ? ` Local analysis highlight: ${local.interestingReason}.` : ""}`,
    "",
    "PROVENANCE",
    ...dedupeSources(system, planet, science).map((source) => `- ${source.name} (${source.kind}) | cache=${source.cache} | ${source.url}`),
    ...(science?.references.length
      ? ["", "REFERENCE LINKS", ...science.references.map((reference) => `- ${reference.label} | ${reference.url}`)]
      : []),
    "",
    "OPEN GAPS",
    "- Product-level JWST metadata is joined and numeric spectra are parsed when public spectral payloads are available; the remaining gap is broader coverage across unsupported/private X1DINTS/S3D products.",
    "- Atmosphere chemistry now reaches the selected-planet renderer, but non-selected planets still fall back to class priors until enriched on demand.",
    "- Instrument-grade planning still needs ETC/APT/visibility and saturation logic on top of the newly joined JWST inventory.",
  ];

  return lines.join("\n");
}

function buildChartRows(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null): ChartRow[] {
  if (!planet) {
    const compactness = systemCompactness(system) ?? 0;
    const lum = stellarLuminosity(system);
    return [
      { label: "Distance", value: Math.min(system.distancePc, 40), max: 40, note: `${formatNumber(system.distancePc, 1)} pc`, hue: 190 },
      { label: "Planets", value: Math.min(system.planetCount, 10), max: 10, note: `${system.planetCount} in snapshot`, hue: 32 },
      { label: "Luminosity", value: Math.min(stellarLuminosity(system) ?? 0.2, 4), max: 4, note: lum ? `${formatNumber(lum, 2)} L☉` : "pending", hue: 215 },
      { label: "Compactness", value: Math.min(compactness, 3), max: 3, note: compactness ? `${formatNumber(compactness, 2)} AU` : "pending", hue: 332 },
    ];
  }

  const propagation = activePropagation(planet, science);
  const radiusValue = propagation?.radiusEarth.median ?? planet.radiusEarth ?? 0;
  const massValue = propagation?.massEarth.median ?? planet.massEarth ?? 0;
  const tempValue = science?.temperatures.daysideK ?? propagation?.equilibriumK.median ?? planet.equilibriumK ?? 0;
  const fluxValue = science?.radiation.fluxEarthMultiple ?? propagation?.fluxEarthMultiple.median ?? planet.insolationEarth ?? 0;
  return [
    {
      label: "Radius",
      value: Math.min(radiusValue, 8),
      max: 8,
      note: intervalSummary(propagation?.radiusEarth, 2, " R⊕") ?? (planet.radiusEarth ? `${formatNumber(planet.radiusEarth, 2)} R⊕` : "pending"),
      hue: 192,
      intervalLow: propagation?.radiusEarth.low ?? null,
      intervalHigh: propagation?.radiusEarth.high ?? null,
    },
    {
      label: "Mass",
      value: Math.min(massValue, 25),
      max: 25,
      note: intervalSummary(propagation?.massEarth, 2, " M⊕") ?? (planet.massEarth ? `${formatNumber(planet.massEarth, 2)} M⊕` : "pending"),
      hue: 24,
      intervalLow: propagation?.massEarth.low ?? null,
      intervalHigh: propagation?.massEarth.high ?? null,
    },
    {
      label: "Temp",
      value: Math.min(tempValue, 1600),
      max: 1600,
      note: science?.temperatures.daysideK ? `${formatNumber(science.temperatures.daysideK, 0)} K day` : intervalSummary(propagation?.equilibriumK, 0, " K") ?? (planet.equilibriumK ? `${formatNumber(planet.equilibriumK, 0)} K` : "pending"),
      hue: 334,
      intervalLow: propagation?.equilibriumK.low ?? null,
      intervalHigh: propagation?.equilibriumK.high ?? null,
    },
    {
      label: "Flux",
      value: Math.min(fluxValue, 12),
      max: 12,
      note: intervalSummary(propagation?.fluxEarthMultiple, 2, " S⊕") ?? (planet.insolationEarth ? `${formatNumber(planet.insolationEarth, 2)} S⊕` : "pending"),
      hue: 214,
      intervalLow: propagation?.fluxEarthMultiple.low ?? null,
      intervalHigh: propagation?.fluxEarthMultiple.high ?? null,
    },
    ...(science
      ? [
          { label: "Field", value: Math.min(science.magnetosphere.surfaceFieldMicroTesla ?? 0, 120), max: 120, note: science.magnetosphere.surfaceFieldMicroTesla ? `${formatNumber(science.magnetosphere.surfaceFieldMicroTesla, 1)} microT` : "pending", hue: 178 },
          ...(science.atmosphere.cloudCoverFraction !== null && science.atmosphere.cloudCoverFraction !== undefined
            ? [{ label: "Cloud", value: science.atmosphere.cloudCoverFraction * 100, max: 100, note: `${formatNumber(science.atmosphere.cloudCoverFraction * 100, 0)}% proxy`, hue: 196 }]
            : []),
          ...(science.atmosphere.spectralAmplitudePpm !== null && science.atmosphere.spectralAmplitudePpm !== undefined
            ? [{ label: "Spec Amp", value: Math.min(science.atmosphere.spectralAmplitudePpm, 1200), max: 1200, note: `${formatNumber(science.atmosphere.spectralAmplitudePpm, 0)} ppm`, hue: 286 }]
            : wavelengthCoverageText(science)
              ? [{
                  label: "JWST Span",
                  value: Math.min(
                    (science.atmosphere.wavelengthCoverage.maxUm ?? 0) - (science.atmosphere.wavelengthCoverage.minUm ?? 0),
                    12,
                  ),
                  max: 12,
                  note: wavelengthCoverageText(science)!,
                  hue: 286,
                }]
              : []),
        ]
      : []),
  ];
}

function metricPercentage(value: number, max: number) {
  if (!max || Number.isNaN(value) || value <= 0) return 4;
  return Math.max(4, Math.min(100, (value / max) * 100));
}

function metricPosition(value: number | null | undefined, max: number) {
  if (!max || value === null || value === undefined || Number.isNaN(value) || value <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function hashFraction(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function initialOrbitPhase(planet: UniversePlanet, index: number) {
  if (planet.meanAnomalyDegAtEpoch !== null && planet.meanAnomalyDegAtEpoch !== undefined) {
    return (planet.meanAnomalyDegAtEpoch * Math.PI) / 180;
  }
  return hashFraction(`${planet.id}:${index}:phase`) * Math.PI * 2;
}

function orbitInclination(planet: UniversePlanet, index: number) {
  return (hashFraction(`${planet.id}:${index}:inc`) - 0.5) * 0.38;
}

function orbitLongitudeAscendingNode(planet: UniversePlanet, index: number) {
  if (planet.longitudeAscendingNodeDeg !== null && planet.longitudeAscendingNodeDeg !== undefined) {
    return (planet.longitudeAscendingNodeDeg * Math.PI) / 180;
  }
  return hashFraction(`${planet.id}:${index}:node`) * Math.PI * 2;
}

function orbitArgumentPeriastron(planet: UniversePlanet, index: number) {
  if (planet.argumentPeriastronDeg !== null && planet.argumentPeriastronDeg !== undefined) {
    return (planet.argumentPeriastronDeg * Math.PI) / 180;
  }
  return hashFraction(`${planet.id}:${index}:omega`) * Math.PI * 2;
}

function orbitEccentricity(planet: UniversePlanet) {
  return clamp(planet.eccentricity ?? 0, 0, 0.82);
}

function orbitPlaneTilt(planet: UniversePlanet, index: number) {
  const fallback = orbitInclination(planet, index);
  if (planet.inclinationDeg === null || planet.inclinationDeg === undefined) return fallback;
  if (planet.inclinationReference === "ecliptic") {
    return clamp((planet.inclinationDeg * Math.PI) / 180, -0.42, 0.42);
  }
  const deviation = clamp((planet.inclinationDeg - 90) * (Math.PI / 180), -0.75, 0.75);
  return clamp(deviation * 0.8 + fallback * 0.35, -0.62, 0.62);
}

function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number) {
  let eccentricAnomaly = meanAnomaly;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const delta = (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly)
      / Math.max(1 - eccentricity * Math.cos(eccentricAnomaly), 0.0001);
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 0.000001) break;
  }
  return eccentricAnomaly;
}

function orbitAngleForPlanet(planet: UniversePlanet, index: number, timeDays: number) {
  const period = Math.max(planet.orbitalPeriodDays ?? 80 + index * 25, 0.4);
  return initialOrbitPhase(planet, index) + (timeDays / period) * Math.PI * 2;
}

function orbitPointForEccentricAnomaly(planet: UniversePlanet, index: number, eccentricAnomaly: number) {
  const semiMajorRadius = systemOrbitRadius(index, planet.semiMajorAxisAu);
  const eccentricity = orbitEccentricity(planet);
  const semiMinorRadius = semiMajorRadius * Math.sqrt(Math.max(1 - eccentricity * eccentricity, 0.0001));
  const tilt = orbitPlaneTilt(planet, index);
  const node = orbitLongitudeAscendingNode(planet, index);
  const argumentPeriastron = orbitArgumentPeriastron(planet, index);
  const point = new THREE.Vector3(
    semiMajorRadius * (Math.cos(eccentricAnomaly) - eccentricity),
    0,
    semiMinorRadius * Math.sin(eccentricAnomaly),
  );
  point.applyAxisAngle(WORLD_Y_AXIS, argumentPeriastron);
  point.applyAxisAngle(WORLD_X_AXIS, tilt);
  point.applyAxisAngle(WORLD_Y_AXIS, node);
  return point;
}

function orbitBasisSummary(planet: UniversePlanet) {
  if (planet.orbitBasis === "jpl-approx") {
    return "JPL approximate Solar System elements anchored near the current epoch";
  }
  if (planet.orbitBasis === "measured") {
    return "archive eccentricity, inclination, argument of periastron, and epoch anchor";
  }
  if (planet.orbitBasis === "mixed") {
    return "archive eccentricity/inclination with inferred node or phase where unavailable";
  }
  return "best-guess compressed ellipse with inferred phase/orientation";
}

function activeSystemLocalPosition(planet: UniversePlanet, index: number, timeDays: number) {
  const meanAnomaly = orbitAngleForPlanet(planet, index, timeDays);
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, orbitEccentricity(planet));
  return orbitPointForEccentricAnomaly(planet, index, eccentricAnomaly);
}

function orbitTrackPoints(planet: UniversePlanet, index: number, segments = 180) {
  const points: THREE.Vector3[] = [];
  for (let step = 0; step < segments; step += 1) {
    const eccentricAnomaly = (step / segments) * Math.PI * 2;
    points.push(orbitPointForEccentricAnomaly(planet, index, eccentricAnomaly));
  }
  return points;
}

function previewAppearance(system: UniverseSystem, planet: UniversePlanet, science?: PlanetScienceBundle | null): PlanetPreviewAppearance {
  const normalizedId = planet.id.toLowerCase();
  const local = mergedLocalAnalysis(system, planet, science);
  const descriptor = [
    local?.atmosphereType,
    local?.compositionType,
    local?.habitability,
    local?.interestingReason,
  ].filter(Boolean).join(" ").toLowerCase();
  const density = densityGcc(planet);
  const flux = science?.radiation.fluxEarthMultiple ?? insolationEarth(system, planet);
  const eq = planet.equilibriumK ?? 280;
  const radius = planet.radiusEarth ?? 1;
  const tidalLock = science?.orbital.tidallyLocked ?? (!!planet.semiMajorAxisAu && !!planet.orbitalPeriodDays && planet.semiMajorAxisAu < 0.08 && planet.orbitalPeriodDays < 12);
  const chemistry = new Set(chemistryTagsForAppearance(system, planet, science));
  const methane = chemistry.has("CH4");
  const water = chemistry.has("H2O");
  const ammonia = chemistry.has("NH3");
  const sulfur = chemistry.has("SO2");
  const alkali = chemistry.has("NA") || chemistry.has("K");
  const hydrogenRich = chemistry.has("H2") || descriptor.includes("hydrogen-rich") || descriptor.includes("h-rich");
  const cloudEvidence = science?.atmosphere.cloudCoverFraction;

  if (normalizedId === "earth") {
    return {
      regime: "temperate",
      densityGcc: density,
      insolationEarth: flux,
      cloudCover: cloudEvidence ?? 0.52,
      bandCount: 0,
      stormCount: 6,
      tidalLock: false,
    };
  }
  if (normalizedId === "jupiter") {
    return {
      regime: "gas-giant",
      densityGcc: density,
      insolationEarth: flux,
      cloudCover: cloudEvidence ?? 0.58,
      bandCount: 12,
      stormCount: 10,
      tidalLock: false,
    };
  }
  if (normalizedId === "mercury") {
    return {
      regime: "airless",
      densityGcc: density,
      insolationEarth: flux,
      cloudCover: 0.01,
      bandCount: 0,
      stormCount: 0,
      tidalLock: false,
    };
  }
  if (normalizedId === "venus") {
    return {
      regime: "venusian",
      densityGcc: density,
      insolationEarth: flux,
      cloudCover: cloudEvidence ?? 0.92,
      bandCount: 0,
      stormCount: 2,
      tidalLock: false,
    };
  }
  if (normalizedId === "mars") {
    return {
      regime: "desert",
      densityGcc: density,
      insolationEarth: flux,
      cloudCover: cloudEvidence ?? 0.08,
      bandCount: 0,
      stormCount: 2,
      tidalLock: false,
    };
  }
  if (normalizedId === "saturn") {
    return {
      regime: "saturnian",
      densityGcc: density,
      insolationEarth: flux,
      cloudCover: cloudEvidence ?? 0.76,
      bandCount: 8,
      stormCount: 3,
      tidalLock: false,
    };
  }
  if (normalizedId === "uranus") {
    return {
      regime: "ice-giant",
      densityGcc: density,
      insolationEarth: flux,
      cloudCover: cloudEvidence ?? 0.62,
      bandCount: 4,
      stormCount: 2,
      tidalLock: false,
    };
  }
  if (normalizedId === "neptune") {
    return {
      regime: "ice-giant",
      densityGcc: density,
      insolationEarth: flux,
      cloudCover: cloudEvidence ?? 0.54,
      bandCount: 6,
      stormCount: 5,
      tidalLock: false,
    };
  }

  const earthLikeTemperate =
    radius >= 0.7 &&
    radius <= 1.9 &&
    eq >= 220 &&
    eq <= 330 &&
    (flux ?? 1) >= 0.55 &&
    (flux ?? 1) <= 1.75 &&
    (density ?? 5.5) >= 4.0 &&
    (density ?? 5.5) <= 7.4;

  const hyceanHint =
    descriptor.includes("hycean")
    || descriptor.includes("ocean world")
    || descriptor.includes("water world")
    || (
      radius >= 1.6
      && radius <= 4.2
      && (density ?? 4.2) < 4.4
      && eq >= 220
      && eq <= 520
      && (water || methane || hydrogenRich)
    );
  const venusianHint =
    descriptor.includes("venus")
    || descriptor.includes("co2-rich")
    || descriptor.includes("carbon dioxide")
    || descriptor.includes("sulfuric")
    || (radius <= 2.2 && eq > 580 && (cloudEvidence ?? 0.7) > 0.55);
  const airlessHint =
    descriptor.includes("airless")
    || descriptor.includes("thin atmosphere")
    || descriptor.includes("bare rock")
    || (radius < 1.4 && (density ?? 5.1) > 4.6 && eq > 260 && (cloudEvidence ?? 0.02) < 0.08);
  const saturnianHint =
    descriptor.includes("saturn")
    || (radius >= 6 && (density ?? 1) < 0.9 && eq < 420);
  const hotJupiterHint =
    descriptor.includes("hot jupiter")
    || (radius >= 4.8 && eq > 950);
  const coldMethaneWorld =
    descriptor.includes("methane")
    || (methane && eq < 260 && radius >= 2.2);

  let regime: PlanetPreviewAppearance["regime"] = "rocky";
  if (eq > 1450 && radius < 2.4) regime = "lava";
  else if (hyceanHint) regime = "hycean";
  else if (hotJupiterHint) regime = "hot-jupiter";
  else if (saturnianHint) regime = "saturnian";
  else if (radius >= 4.2 && (eq < 260 || coldMethaneWorld)) regime = "ice-giant";
  else if (radius >= 4.2) regime = "gas-giant";
  else if (radius >= 2.3 && eq < 240 && ((density ?? 3.4) < 3.4 || coldMethaneWorld)) regime = "ice-giant";
  else if (radius >= 2.3) regime = "sub-neptune";
  else if (venusianHint) regime = "venusian";
  else if (airlessHint) regime = "airless";
  else if (eq > 380 || (flux ?? 0) > 1.8) regime = "desert";
  else if (earthLikeTemperate || ((density ?? 5.6) < 5.0 && eq >= 220 && eq <= 340)) regime = "temperate";
  if (science && regime === "temperate" && radius >= 1.7 && radius <= 4.1 && (density ?? 4.2) < 4.2 && (water || methane || hydrogenRich)) {
    regime = "hycean";
  }

  const fallbackCloudCover =
    regime === "gas-giant"
      ? clamp(0.44 + (flux ?? 0.9) * 0.04, 0.38, 0.76)
      : regime === "hot-jupiter"
        ? clamp(0.34 + (flux ?? 3) * 0.01, 0.24, 0.56)
        : regime === "saturnian"
          ? 0.72
          : regime === "ice-giant" || regime === "sub-neptune"
            ? clamp(0.38 + (eq < 260 ? 0.18 : 0.08), 0.34, 0.72)
            : regime === "hycean"
              ? 0.78
              : regime === "venusian"
                ? 0.9
                : regime === "temperate"
                  ? 0.42
                  : regime === "desert"
                    ? 0.16
                    : regime === "lava"
                      ? 0.05
                      : regime === "airless"
                        ? 0.01
                        : 0.24;
  const cloudCover = clamp(
    cloudEvidence
      ?? fallbackCloudCover
      + (water ? 0.08 : 0)
      + (ammonia ? 0.06 : 0)
      + (sulfur ? 0.1 : 0)
      - (alkali && eq > 900 ? 0.08 : 0),
    0.01,
    0.95,
  );
  const bandCount =
    regime === "hot-jupiter"
      ? Math.max(10, Math.round(12 + (alkali ? 2 : 0) + (sulfur ? 1 : 0)))
      : regime === "gas-giant"
        ? Math.max(6, Math.round(9 + (methane ? 1 : 0) + (ammonia ? 1 : 0) + (alkali ? 2 : 0) - (cloudCover > 0.72 ? 2 : 0)))
        : regime === "saturnian"
          ? Math.max(5, Math.round(7 - (cloudCover > 0.78 ? 1 : 0)))
          : regime === "ice-giant"
            ? Math.max(3, Math.round(5 + (methane ? 2 : 0) + (water ? 1 : 0) - (cloudCover > 0.74 ? 1 : 0)))
            : regime === "sub-neptune"
              ? Math.max(4, Math.round(6 + (methane ? 1 : 0) + (water ? 2 : 0) + (sulfur ? 1 : 0)))
              : regime === "hycean"
                ? Math.max(2, Math.round(4 + (water ? 1 : 0)))
                : 0;
  const stormCount =
    regime === "hot-jupiter"
      ? Math.max(7, Math.round(8 + (alkali ? 2 : 0) + (sulfur ? 2 : 0)))
      : regime === "gas-giant"
        ? Math.max(4, Math.round(6 + (water ? 2 : 0) + (alkali ? 2 : 0) + ((flux ?? 0) > 4 ? 2 : 0)))
        : regime === "saturnian"
          ? 3
          : regime === "ice-giant"
            ? Math.max(3, Math.round(4 + (methane ? 1 : 0) + (water ? 1 : 0)))
            : regime === "sub-neptune"
              ? Math.max(4, Math.round(5 + (water ? 2 : 0) + (sulfur ? 1 : 0)))
              : regime === "hycean"
                ? Math.max(5, Math.round(6 + (water ? 2 : 0)))
                : regime === "venusian"
                  ? 2
                  : regime === "lava"
                    ? 4
                    : regime === "airless"
                      ? 0
                      : 3;

  return {
    regime,
    densityGcc: density,
    insolationEarth: flux,
    cloudCover,
    bandCount,
    stormCount,
    tidalLock,
  };
}

function estimatedRotationSeconds(planet: UniversePlanet, appearance: PlanetPreviewAppearance) {
  if (appearance.tidalLock) return 1_000_000;
  if (appearance.regime === "hot-jupiter") return 16;
  if (appearance.regime === "gas-giant") return 18;
  if (appearance.regime === "saturnian") return 21;
  if (appearance.regime === "ice-giant") return 22;
  if (appearance.regime === "sub-neptune") return 26;
  if (appearance.regime === "hycean") return 30;
  if (appearance.regime === "venusian") return 120;
  if (appearance.regime === "airless") return 48;
  if (appearance.regime === "lava") return 38;
  if (planet.orbitalPeriodDays && planet.orbitalPeriodDays < 5) return 24;
  return 34;
}

function visualMagnetosphere(system: UniverseSystem, planet: UniversePlanet, science?: PlanetScienceBundle | null) {
  const local = mergedLocalAnalysis(system, planet, science);
  const semiMajorAxisAu = science?.orbital.semiMajorAxisAu ?? planet.semiMajorAxisAu;
  const orbitalPeriodDays = science?.orbital.periodDays ?? planet.orbitalPeriodDays;
  const fluxEarthMultiple =
    science?.radiation.fluxEarthMultiple
    ?? local?.fluxEarthMultiple
    ?? insolationEarth(system, planet);
  const derived = deriveMagnetosphereProxy({
    massEarth: science?.physical.massEarth ?? planet.massEarth,
    radiusEarth: science?.physical.radiusEarth ?? planet.radiusEarth,
    densityGcc: science?.physical.densityGcc ?? densityGcc(planet),
    equilibriumK: science?.temperatures.equilibriumK ?? planet.equilibriumK,
    orbitalPeriodDays,
    semiMajorAxisAu,
    fluxEarthMultiple,
    spectralType: science?.stellar.spectralType ?? system.stellar.spectralType,
    tidallyLocked: science?.orbital.tidallyLocked ?? inferTidalLock(semiMajorAxisAu, orbitalPeriodDays),
  });
  const protection =
    science?.magnetosphere.protection && science.magnetosphere.protection !== "unresolved"
      ? science.magnetosphere.protection
      : derived.protection;

  return {
    magneticFieldMicroTesla:
      science?.magnetosphere.surfaceFieldMicroTesla
      ?? local?.surfaceFieldMicroTesla
      ?? derived.surfaceFieldMicroTesla,
    magnetopauseRadii:
      science?.magnetosphere.magnetopauseRadii
      ?? local?.magnetopauseRadii
      ?? derived.magnetopauseRadii,
    radiationFluxEarth: fluxEarthMultiple ?? derived.stellarWindStress,
    magneticProtection: protection,
  };
}

function planetVisualModel(system: UniverseSystem, planet: UniversePlanet, science?: PlanetScienceBundle | null) {
  const palette = paletteForSelection(system, planet, science);
  const appearance = previewAppearance(system, planet, science);
  const magnetosphere = visualMagnetosphere(system, planet, science);
  const chemistryTags = Array.from(new Set([
    ...scienceChemistryTags(science),
    ...(mergedLocalAnalysis(system, planet, science)?.moleculeTags ?? []),
  ]));

  return {
    palette,
    appearance,
    renderProps: {
      seedKey: planet.id,
      planetColor: palette.planet,
      starColor: palette.star,
      accentColor: palette.accent,
      regime: appearance.regime,
      densityGcc: appearance.densityGcc,
      equilibriumK: planet.equilibriumK,
      insolationEarth: science?.radiation.fluxEarthMultiple ?? appearance.insolationEarth,
      daysideK: science?.temperatures.daysideK ?? null,
      nightsideK: science?.temperatures.nightsideK ?? null,
      moleculeTags: chemistryTags,
      cloudCover: science?.atmosphere.cloudCoverFraction ?? appearance.cloudCover,
      bandCount: appearance.bandCount,
      stormCount: appearance.stormCount,
      rotationSeconds: estimatedRotationSeconds(planet, appearance),
      tidalLock: appearance.tidalLock,
      magneticFieldMicroTesla: magnetosphere.magneticFieldMicroTesla,
      magnetopauseRadii: magnetosphere.magnetopauseRadii,
      radiationFluxEarth: magnetosphere.radiationFluxEarth,
      magneticProtection: magnetosphere.magneticProtection,
    } satisfies PlanetGlobeProps,
  };
}

function SelectedStarBody({ style, radius }: { style: StarRenderStyle; radius: number }) {
  const starMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const coronaMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const coreColor = useMemo(() => new THREE.Color(style.core), [style.core]);
  const rimColor = useMemo(() => new THREE.Color(style.rim), [style.rim]);
  const coronaColor = useMemo(() => new THREE.Color(style.corona), [style.corona]);
  const starUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorphology: { value: style.morphologyBias },
      uWarmth: { value: clamp(style.morphologyBias * 0.18, 0.02, 0.18) },
      uCoreColor: { value: coreColor },
      uRimColor: { value: rimColor },
    }),
    [coreColor, rimColor, style.morphologyBias],
  );
  const coronaUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: coronaColor },
    }),
    [coronaColor],
  );

  useFrame(({ clock }) => {
    if (starMaterialRef.current) {
      starMaterialRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
    if (coronaMaterialRef.current) {
      coronaMaterialRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    <>
      <mesh>
        <sphereGeometry args={[radius, 168, 168]} />
        <shaderMaterial
          ref={starMaterialRef}
          vertexShader={STAR_VERTEX_SHADER}
          fragmentShader={DISTANT_STAR_FRAGMENT_SHADER}
          uniforms={starUniforms}
        />
      </mesh>
      <mesh scale={1.015 + style.brightnessScale * 0.035}>
        <sphereGeometry args={[radius, 136, 136]} />
        <meshBasicMaterial
          color={coreColor}
          transparent
          opacity={clamp(0.008 + style.brightnessScale * 0.014, 0.008, 0.028)}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={1.03 + style.brightnessScale * 0.02}>
        <sphereGeometry args={[radius, 132, 132]} />
        <shaderMaterial
          ref={coronaMaterialRef}
          vertexShader={STAR_VERTEX_SHADER}
          fragmentShader={CORONA_FRAGMENT_SHADER}
          uniforms={coronaUniforms}
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

function OrbitTrack({
  planet,
  index,
  active,
}: {
  planet: UniversePlanet;
  index: number;
  active: boolean;
}) {
  const eccentricity = orbitEccentricity(planet);
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(orbitTrackPoints(planet, index)), [planet, index]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (eccentricity > 0.015) {
    return (
      <lineLoop geometry={geometry}>
        <lineBasicMaterial color={active ? "#8fd5ff" : "#365978"} transparent opacity={active ? 0.92 : 0.5} />
      </lineLoop>
    );
  }

  const orbitRadius = systemOrbitRadius(index, planet.semiMajorAxisAu);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[orbitRadius - 0.004, orbitRadius + 0.004, 120]} />
      <meshBasicMaterial color={active ? "#8fd5ff" : "#365978"} transparent opacity={active ? 0.92 : 0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

function DistantStarMarker({ style, radius }: { style: StarRenderStyle; radius: number }) {
  const starMeshRef = useRef<THREE.Mesh>(null);
  const haloMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const coreColor = useMemo(() => new THREE.Color(style.core), [style.core]);
  const rimColor = useMemo(() => new THREE.Color(style.rim), [style.rim]);
  const haloColor = useMemo(() => new THREE.Color(style.halo), [style.halo]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorphology: { value: style.morphologyBias },
      uWarmth: { value: 1 },
      uCoreColor: { value: coreColor },
      uRimColor: { value: rimColor },
    }),
    [coreColor, rimColor, style.morphologyBias],
  );

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
    if (starMeshRef.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 1.4 + radius * 12) * (0.008 + style.brightnessScale * 0.004);
      starMeshRef.current.scale.setScalar(pulse);
    }
    if (haloMaterialRef.current) {
      haloMaterialRef.current.opacity = style.glowOpacity * (0.95 + Math.sin(clock.elapsedTime * 1.8 + radius * 10) * 0.05);
    }
  });

  return (
    <>
      <mesh>
        <sphereGeometry args={[radius * 2.4, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={starMeshRef}>
        <sphereGeometry args={[radius, 14, 14]} />
        <shaderMaterial ref={materialRef} vertexShader={STAR_VERTEX_SHADER} fragmentShader={DISTANT_STAR_FRAGMENT_SHADER} uniforms={uniforms} />
      </mesh>
      <mesh scale={1.02 + style.brightnessScale * 0.12}>
        <sphereGeometry args={[radius, 12, 12]} />
        <meshBasicMaterial
          color={coreColor}
          transparent
          opacity={clamp(0.02 + style.brightnessScale * 0.04, 0.02, 0.1)}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={Math.min(style.glowScale, 1.72)}>
        <sphereGeometry args={[radius, 12, 12]} />
        <meshBasicMaterial
          ref={haloMaterialRef}
          color={haloColor}
          transparent
          opacity={style.glowOpacity * 0.68}
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

function SystemInterestTag({
  label,
  accent,
  offset,
}: {
  label: string;
  accent: string;
  offset: number;
}) {
  return (
    <Html position={[0, offset, 0]} center distanceFactor={10} sprite>
      <div
        style={{
          pointerEvents: "none",
          whiteSpace: "nowrap",
          borderRadius: 999,
          border: `1px solid ${accent}55`,
          background: "rgba(4, 16, 31, 0.82)",
          boxShadow: `0 0 18px ${accent}22`,
          color: "#f5f7fb",
          fontSize: "10px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          padding: "4px 8px",
          backdropFilter: "blur(6px)",
        }}
      >
        {label}
      </div>
    </Html>
  );
}

function DeepSkyAnchor({
  entry,
  scale,
  onHoverChange,
}: {
  entry: DeepSkyObject;
  scale: number;
  onHoverChange: (hover: StageHover | null) => void;
}) {
  const texture = useMemo(() => getNebulaTexture(entry), [entry]);
  const groupRef = useRef<THREE.Group>(null);
  const primaryRef = useRef<THREE.Mesh>(null);
  const primaryMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const hazeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const bloomMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const primaryOpacity =
    entry.kind === "dark"
      ? 0.98
      : entry.kind === "molecular"
        ? 0.92
        : entry.kind === "galaxy"
          ? 1.34
          : entry.kind === "blackHole"
            ? 1.22
            : entry.kind === "quasar"
              ? 1.46
          : entry.kind === "pulsar"
            ? 1.38
            : 1.28;
  const hazeOpacity =
    entry.kind === "dark"
      ? 0.4
      : entry.kind === "molecular"
        ? 0.34
        : entry.kind === "galaxy"
          ? 0.48
          : entry.kind === "blackHole"
            ? 0.22
            : entry.kind === "quasar"
              ? 0.34
          : entry.kind === "pulsar"
            ? 0.26
            : 0.5;
  const hazeScale =
    entry.kind === "dark" || entry.kind === "molecular"
      ? 2.4
      : entry.kind === "galaxy"
        ? 3.3
        : entry.kind === "blackHole"
          ? 2.15
          : entry.kind === "quasar"
            ? 3.55
        : entry.kind === "pulsar"
          ? 2.5
          : 3.05;
  const bloomOpacity =
    entry.kind === "dark"
      ? 0.16
      : entry.kind === "molecular"
        ? 0.22
        : entry.kind === "galaxy"
          ? 0.3
          : entry.kind === "blackHole"
            ? 0.18
            : entry.kind === "quasar"
              ? 0.34
          : entry.kind === "pulsar"
            ? 0.38
            : 0.32;
  const bloomScale =
    entry.kind === "dark" || entry.kind === "molecular"
      ? 3
      : entry.kind === "galaxy"
        ? 4.1
        : entry.kind === "blackHole"
          ? 2.5
          : entry.kind === "quasar"
            ? 4.35
        : entry.kind === "pulsar"
          ? 3.3
          : 3.7;
  const cartesianPc = useMemo(() => equatorialToCartesianPc(entry.raDeg, entry.decDeg, entry.distancePc), [entry]);

  useEffect(() => {
    return () => {
      onHoverChange(null);
    };
  }, [onHoverChange]);

  useFrame(({ clock, camera }) => {
    if (groupRef.current) {
      groupRef.current.quaternion.copy(camera.quaternion);
    }
    if (entry.kind !== "pulsar") return;
    const period = entry.pulsePeriodSeconds ?? 0.2;
    const phase = (clock.elapsedTime % period) / period;
    const spike = Math.pow(Math.max(0, Math.cos(phase * Math.PI * 2)), 18);
    const bloom = Math.pow(Math.max(0, Math.cos(phase * Math.PI * 2)), 10);
    if (primaryMaterialRef.current) {
      primaryMaterialRef.current.opacity = primaryOpacity + spike * 0.48;
    }
    if (hazeMaterialRef.current) {
      hazeMaterialRef.current.opacity = hazeOpacity + bloom * 0.18;
    }
    if (bloomMaterialRef.current) {
      bloomMaterialRef.current.opacity = bloomOpacity + bloom * 0.42;
    }
    if (primaryRef.current) {
      const pulseScale = 1 + spike * 0.22;
      primaryRef.current.scale.set(scale * pulseScale, scale * pulseScale, 1);
    }
  });

  function showHover(event: ThreeEvent<PointerEvent>) {
    onHoverChange({
      x: event.nativeEvent.offsetX,
      y: event.nativeEvent.offsetY,
      accent: entry.tint,
      title: entry.name,
      lines: [
        deepSkyKindLabel(entry.kind),
        `${formatNumber(distanceLy(entry.distancePc), 1)} ly · ${formatNumber(entry.distancePc, 0)} pc`,
        ...(entry.kind === "pulsar" && entry.pulsePeriodSeconds
          ? [`Spin period: ${formatNumber(entry.pulsePeriodSeconds * 1000, 2)} ms · ${formatNumber(1 / entry.pulsePeriodSeconds, 2)} Hz`]
          : []),
        ...(entry.massSolar
          ? [entry.massSolar >= 1_000_000 ? `Mass anchor: ${formatNumber(entry.massSolar / 1_000_000, 2)} million M☉` : `Mass anchor: ${formatNumber(entry.massSolar, 1)} M☉`]
          : []),
        `XYZ: ${formatCartesian(cartesianPc, 0)}`,
      ],
    });
  }

  return (
    <group ref={groupRef}>
      <mesh
        ref={primaryRef}
        scale={[scale, scale, 1]}
        onPointerOver={showHover}
        onPointerMove={showHover}
        onPointerOut={() => onHoverChange(null)}
      >
        <planeGeometry args={[1, 1, 1, 1]} />
        <meshBasicMaterial
          ref={primaryMaterialRef}
          attach="material"
          map={texture}
          color="#ffffff"
          transparent
          depthWrite={false}
          depthTest
          blending={entry.kind === "dark" || entry.kind === "molecular" ? THREE.NormalBlending : THREE.AdditiveBlending}
          opacity={primaryOpacity}
        />
      </mesh>
      <mesh scale={[scale * hazeScale, scale * hazeScale, 1]} raycast={() => null}>
        <planeGeometry args={[1, 1, 1, 1]} />
        <meshBasicMaterial
          ref={hazeMaterialRef}
          attach="material"
          map={texture}
          color={entry.kind === "dark" || entry.kind === "molecular" ? entry.tint : "#ffffff"}
          transparent
          depthWrite={false}
          depthTest
          blending={entry.kind === "dark" || entry.kind === "molecular" ? THREE.NormalBlending : THREE.AdditiveBlending}
          opacity={hazeOpacity}
        />
      </mesh>
      <mesh scale={[scale * bloomScale, scale * bloomScale, 1]} raycast={() => null}>
        <planeGeometry args={[1, 1, 1, 1]} />
        <meshBasicMaterial
          ref={bloomMaterialRef}
          attach="material"
          map={texture}
          color={entry.kind === "dark" || entry.kind === "molecular" ? entry.accent : entry.tint}
          transparent
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          opacity={bloomOpacity}
        />
      </mesh>
    </group>
  );
}

function AnimatedPlanetSurface({
  radius,
  renderProps,
}: {
  radius: number;
  renderProps: PlanetGlobeProps;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const referenceImageRef = useRef<CanvasImageSource | null>(null);
  const lastPaintRef = useRef(-1);
  const emissiveColor = useMemo(() => threeColor(renderProps.accentColor, -26), [renderProps.accentColor]);
  const referenceAsset = useMemo(
    () =>
      resolvePlanetCalibrationAsset({
        seedKey: renderProps.seedKey,
        regime: renderProps.regime,
        equilibriumK: renderProps.equilibriumK,
        densityGcc: renderProps.densityGcc,
      }),
    [renderProps.seedKey, renderProps.regime, renderProps.equilibriumK, renderProps.densityGcc],
  );
  const textureState = useMemo(() => {
    if (typeof window === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return { canvas, texture };
  }, []);

  useEffect(() => {
    return () => {
      textureState?.texture.dispose();
    };
  }, [textureState]);

  useEffect(() => {
    if (!referenceAsset) {
      referenceImageRef.current = null;
      lastPaintRef.current = -1;
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    image.src = referenceAsset.src;
    image.onload = () => {
      if (cancelled) return;
      referenceImageRef.current = materializePlanetReference(referenceAsset, image);
      lastPaintRef.current = -1;
    };

    return () => {
      cancelled = true;
      referenceImageRef.current = null;
      lastPaintRef.current = -1;
    };
  }, [referenceAsset]);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      if (renderProps.tidalLock) {
        meshRef.current.rotation.y = 0;
      } else {
        meshRef.current.rotation.y = (clock.elapsedTime / Math.max(renderProps.rotationSeconds ?? 30, 1)) * Math.PI * 2;
      }
    }

    const canvas = textureState?.canvas;
    const texture = textureState?.texture;
    if (!canvas || !texture) return;

    if (clock.elapsedTime - lastPaintRef.current < 1 / 30) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    renderPlanetSurface(ctx, canvas.width, clock.elapsedTime, renderProps, referenceImageRef.current);
    if (materialRef.current?.map) {
      materialRef.current.map.needsUpdate = true;
    }
    lastPaintRef.current = clock.elapsedTime;
  });

  return (
    <>
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 28, 28]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#ffffff"
          map={textureState?.texture ?? undefined}
          emissive={emissiveColor}
          emissiveIntensity={0.08}
          roughness={0.88}
          metalness={0}
        />
      </mesh>
    </>
  );
}

function ActiveSystemPlanets({
  system,
  selectedPlanet,
  selectedPlanetScience,
  onSelectPlanet,
  onHoverChange,
  onFlyToPlanet,
  planetViewSyncRef,
  simulationDays,
  orbitSpeedMultiplier,
  zoomFactor,
  followLocked,
  controlsRef,
}: {
  system: UniverseSystem;
  selectedPlanet: UniversePlanet | null;
  selectedPlanetScience?: PlanetScienceBundle | null;
  onSelectPlanet: (planet: UniversePlanet) => void;
  onHoverChange: (hover: StageHover | null) => void;
  onFlyToPlanet: (target: THREE.Vector3, radius: number) => void;
  planetViewSyncRef?: PlanetViewSyncRef;
  simulationDays: number;
  orbitSpeedMultiplier: number;
  zoomFactor: number;
  followLocked: boolean;
  controlsRef: { current: OrbitControlsImpl | null };
}) {
  const planetRefs = useRef<Record<string, THREE.Group | null>>({});
  const pendingPlanetClickRef = useRef<number | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const followOffsetRef = useRef(new THREE.Vector3(1.8, 0.9, 1.8));
  const previousZoomFactorRef = useRef(zoomFactor);
  const worldTargetRef = useRef(new THREE.Vector3());
  const starWorldRef = useRef(new THREE.Vector3());
  const viewDirRef = useRef(new THREE.Vector3());
  const localViewDirRef = useRef(new THREE.Vector3());
  const incomingLightRef = useRef(new THREE.Vector3());
  const screenRightRef = useRef(new THREE.Vector3());
  const screenUpRef = useRef(new THREE.Vector3());
  const selectedVisualModel = useMemo(
    () => (selectedPlanet ? planetVisualModel(system, selectedPlanet, selectedPlanetScience) : null),
    [system, selectedPlanet, selectedPlanetScience],
  );

  useEffect(() => {
    return () => {
      if (pendingPlanetClickRef.current !== null) {
        window.clearTimeout(pendingPlanetClickRef.current);
      }
      onHoverChange(null);
      if (planetViewSyncRef) {
        planetViewSyncRef.current = null;
      }
    };
  }, [onHoverChange, planetViewSyncRef]);

  useEffect(() => {
    if (!planetViewSyncRef) return;
    if (!selectedPlanet) {
      planetViewSyncRef.current = null;
    }
  }, [planetViewSyncRef, selectedPlanet]);

  useEffect(() => {
    if (!followLocked || !selectedPlanet || !controlsRef.current || !cameraRef.current) return;
    const targetGroup = planetRefs.current[selectedPlanet.id];
    if (!targetGroup) return;
    const worldTarget = new THREE.Vector3();
    targetGroup.getWorldPosition(worldTarget);
    followOffsetRef.current.copy(cameraRef.current.position).sub(worldTarget);
    if (followOffsetRef.current.lengthSq() < 0.0001) {
      followOffsetRef.current.set(1.8, 0.9, 1.8);
    }
  }, [followLocked, selectedPlanet, selectedPlanet?.id, controlsRef]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return undefined;
    const handleChange = () => {
      if (!followLocked || !selectedPlanet || !cameraRef.current) return;
      const targetGroup = planetRefs.current[selectedPlanet.id];
      if (!targetGroup) return;
      const worldTarget = new THREE.Vector3();
      targetGroup.getWorldPosition(worldTarget);
      followOffsetRef.current.copy(cameraRef.current.position).sub(worldTarget);
    };
    controls.addEventListener("change", handleChange);
    return () => {
      controls.removeEventListener("change", handleChange);
    };
  }, [followLocked, selectedPlanet, selectedPlanet?.id, controlsRef]);

  useEffect(() => {
    const ratio = previousZoomFactorRef.current / Math.max(zoomFactor, 0.05);
    previousZoomFactorRef.current = zoomFactor;
    if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.0001) return;

    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    if (followLocked && selectedPlanet) {
      followOffsetRef.current.multiplyScalar(ratio);
      const targetGroup = planetRefs.current[selectedPlanet.id];
      if (!targetGroup) return;
      const worldTarget = new THREE.Vector3();
      targetGroup.getWorldPosition(worldTarget);
      camera.position.copy(worldTarget.clone().add(followOffsetRef.current));
      controls.target.copy(worldTarget);
      controls.update();
      return;
    }

    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 0.0001) return;
    camera.position.copy(controls.target.clone().add(offset.multiplyScalar(ratio)));
    controls.update();
  }, [zoomFactor, followLocked, selectedPlanet, selectedPlanet?.id, controlsRef]);

  useFrame(({ clock, camera }, delta) => {
    cameraRef.current = camera as THREE.PerspectiveCamera;
    const timeDays = simulationDays + clock.getElapsedTime() * ACTIVE_SYSTEM_DAYS_PER_SECOND * orbitSpeedMultiplier;

    for (let index = 0; index < system.planets.slice(0, 10).length; index += 1) {
      const planet = system.planets[index];
      const group = planetRefs.current[planet.id];
      if (!group) continue;
      const local = activeSystemLocalPosition(planet, index, timeDays);
      group.position.copy(local);
    }

    if (planetViewSyncRef) {
      if (selectedPlanet && selectedVisualModel) {
        const targetGroup = planetRefs.current[selectedPlanet.id];
        if (targetGroup) {
          const worldTarget = worldTargetRef.current;
          const starWorld = starWorldRef.current;
          const viewDir = viewDirRef.current;
          const localViewDir = localViewDirRef.current;
          const incomingLight = incomingLightRef.current;
          const screenRight = screenRightRef.current;
          const screenUp = screenUpRef.current;

          targetGroup.getWorldPosition(worldTarget);
          if (targetGroup.parent) {
            targetGroup.parent.getWorldPosition(starWorld);
          } else {
            starWorld.set(0, 0, 0);
          }

          viewDir.copy(camera.position).sub(worldTarget);
          if (viewDir.lengthSq() > 0.000001) {
            viewDir.normalize();
          } else {
            viewDir.set(0, 0, 1);
          }

          incomingLight.copy(worldTarget).sub(starWorld);
          if (incomingLight.lengthSq() > 0.000001) {
            incomingLight.normalize();
          } else {
            incomingLight.set(-0.72, -0.22, -0.4).normalize();
          }

          screenRight.copy(camera.up).cross(viewDir);
          if (screenRight.lengthSq() < 0.000001) {
            screenRight.set(1, 0, 0);
          } else {
            screenRight.normalize();
          }
          screenUp.copy(viewDir).cross(screenRight);
          if (screenUp.lengthSq() < 0.000001) {
            screenUp.set(0, 1, 0);
          } else {
            screenUp.normalize();
          }

          const rotationSeconds = Math.max(selectedVisualModel.renderProps.rotationSeconds ?? 30, 1);
          const spinAngle = selectedVisualModel.renderProps.tidalLock
            ? 0
            : (clock.elapsedTime / rotationSeconds) * Math.PI * 2;
          localViewDir.copy(viewDir).applyAxisAngle(WORLD_Y_AXIS, -spinAngle);

          const longitude = ((0.5 + Math.atan2(localViewDir.x, localViewDir.z) / (Math.PI * 2)) % 1 + 1) % 1;
          const latitude = clamp(0.5 - Math.asin(clamp(localViewDir.y, -1, 1)) / Math.PI, 0, 1);

          planetViewSyncRef.current = {
            longitude,
            latitude,
            lightDirectionX: clamp(incomingLight.dot(screenRight), -1, 1),
            lightDirectionY: clamp(incomingLight.dot(screenUp), -1, 1),
            lightDirectionZ: clamp(-incomingLight.dot(viewDir), -1, 1),
          };
        }
      } else {
        planetViewSyncRef.current = null;
      }
    }

    if (followLocked && selectedPlanet) {
      const targetGroup = planetRefs.current[selectedPlanet.id];
      if (!targetGroup || !controlsRef.current) return;
      const worldTarget = new THREE.Vector3();
      targetGroup.getWorldPosition(worldTarget);
      if (followOffsetRef.current.lengthSq() < 0.0001) {
        followOffsetRef.current.set(1.8, 0.9, 1.8);
      }
      const catchUp = 1 - Math.exp(-delta * 14);
      const desired = worldTarget.clone().add(followOffsetRef.current);
      controlsRef.current.target.lerp(worldTarget, catchUp);
      camera.position.lerp(desired, catchUp);
      controlsRef.current.update();
    }
  });

  function updatePlanetHover(event: ThreeEvent<PointerEvent>, planet: UniversePlanet, active: boolean, accent: string) {
    const science = active ? selectedPlanetScience : null;
    const propagation = activePropagation(planet, science);
    const flux = science?.radiation.fluxEarthMultiple ?? propagation?.fluxEarthMultiple.median ?? insolationEarth(system, planet);
    onHoverChange({
      x: event.nativeEvent.offsetX,
      y: event.nativeEvent.offsetY,
      accent,
      title: planet.name,
      lines: [
        `${planetClass(planet)} · ${temperatureClass(science?.temperatures.equilibriumK ?? planet.equilibriumK)}`,
        propagation?.radiusEarth
          ? `Radius [MC]: ${formatNumber(planet.radiusEarth, 2)} R⊕ · ${intervalSummary(propagation.radiusEarth, 2, " R⊕") ?? "range unresolved"}`
          : planet.radiusEarth
            ? `Radius [Archive]: ${formatNumber(planet.radiusEarth, 2)} R⊕`
            : "Radius [Archive]: unresolved",
        propagation?.massEarth
          ? `Mass [MC]: ${formatNumber(planet.massEarth, 2)} M⊕ · ${intervalSummary(propagation.massEarth, 2, " M⊕") ?? "range unresolved"}`
          : planet.massEarth
            ? `Mass [Archive]: ${formatNumber(planet.massEarth, 2)} M⊕`
            : "Mass [Archive]: unresolved",
        propagation?.equilibriumK
          ? `T_eq [MC]: ${intervalSummary(propagation.equilibriumK, 0, " K") ?? "range unresolved"}`
          : planet.equilibriumK
            ? `T_eq [Archive]: ${formatNumber(planet.equilibriumK, 0)} K`
            : "T_eq [Archive]: unresolved",
        propagation?.fluxEarthMultiple
          ? `Flux [MC]: ${intervalSummary(propagation.fluxEarthMultiple, 2, " S⊕") ?? "range unresolved"}`
          : flux !== null && flux !== undefined
            ? `Flux [Derived]: ${formatNumber(flux, 2)} S⊕`
            : "Flux [Derived]: unresolved",
        ...(science?.retention ? [`Escape audit [Model]: ${retentionDisplayValue(science.retention)}`] : []),
      ],
    });
  }

  return (
    <>
      {system.planets.slice(0, 10).map((planet, index) => {
        const active = selectedPlanet?.id === planet.id;
        const visualModel = planetVisualModel(system, planet, active ? selectedPlanetScience : null);
        const radius = planetRadius(planet.radiusEarth);

        return (
          <group key={planet.id}>
            <OrbitTrack planet={planet} index={index} active={active} />
            <group
              ref={(node) => {
                planetRefs.current[planet.id] = node;
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                updatePlanetHover(event, planet, active, active ? "#8fd5ff" : "#5fa7d8");
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
                updatePlanetHover(event, planet, active, active ? "#8fd5ff" : "#5fa7d8");
              }}
              onPointerOut={() => onHoverChange(null)}
              onClick={(event) => {
                event.stopPropagation();
                if (pendingPlanetClickRef.current !== null) {
                  window.clearTimeout(pendingPlanetClickRef.current);
                }
                pendingPlanetClickRef.current = window.setTimeout(() => {
                  onSelectPlanet(planet);
                  pendingPlanetClickRef.current = null;
                }, 220);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (pendingPlanetClickRef.current !== null) {
                  window.clearTimeout(pendingPlanetClickRef.current);
                  pendingPlanetClickRef.current = null;
                }
                onSelectPlanet(planet);
                const targetGroup = planetRefs.current[planet.id];
                if (!targetGroup) return;
                const worldTarget = new THREE.Vector3();
                targetGroup.getWorldPosition(worldTarget);
                onFlyToPlanet(worldTarget, radius);
              }}
            >
              <AnimatedPlanetSurface radius={radius} renderProps={visualModel.renderProps} />
            </group>
          </group>
        );
      })}
    </>
  );
}

function StageScene({
  systems,
  whiteDwarfs,
  showWhiteDwarfs,
  selectedSystem,
  selectedWhiteDwarf,
  selectedReferenceStar,
  selectedPlanet,
  selectedPlanetScience,
  selectionCommand,
  planetViewSyncRef,
  simulationDays,
  orbitSpeedMultiplier,
  zoomFactor,
  followLocked,
  freeRoam,
  onSelectSystem,
  onSelectPlanet,
  onSelectDeepSky,
  onSelectWhiteDwarf,
  onSelectReferenceStar,
  onHoverChange,
}: {
  systems: UniverseSystem[];
  whiteDwarfs: WhiteDwarfAnchor[];
  showWhiteDwarfs: boolean;
  selectedSystem: UniverseSystem | null;
  selectedWhiteDwarf: WhiteDwarfAnchor | null;
  selectedReferenceStar: ReferenceStar | null;
  selectedPlanet: UniversePlanet | null;
  selectedPlanetScience?: PlanetScienceBundle | null;
  selectionCommand: StageSelectionCommand | null;
  planetViewSyncRef?: PlanetViewSyncRef;
  simulationDays: number;
  orbitSpeedMultiplier: number;
  zoomFactor: number;
  followLocked: boolean;
  freeRoam: boolean;
  onSelectSystem: (system: UniverseSystem) => void;
  onSelectPlanet: (planet: UniversePlanet) => void;
  onSelectDeepSky: (entry: DeepSkyObject) => void;
  onSelectWhiteDwarf: (anchor: WhiteDwarfAnchor) => void;
  onSelectReferenceStar: (star: ReferenceStar) => void;
  onHoverChange: (hover: StageHover | null) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const flightRef = useRef<CameraFlight | null>(null);
  const sceneTimeRef = useRef(0);
  const pendingStarClickRef = useRef<number | null>(null);
  const lastStarClickRef = useRef<{ id: string; at: number } | null>(null);
  const pendingDeepSkyClickRef = useRef<number | null>(null);
  const lastDeepSkyClickRef = useRef<{ id: string; at: number } | null>(null);
  const pendingWhiteDwarfClickRef = useRef<number | null>(null);
  const lastWhiteDwarfClickRef = useRef<{ id: string; at: number } | null>(null);
  const pendingReferenceStarClickRef = useRef<number | null>(null);
  const lastReferenceStarClickRef = useRef<{ id: string; at: number } | null>(null);
  const introFlightDoneRef = useRef(false);
  const previousZoomFactorRef = useRef(zoomFactor);
  const markers = useMemo(() => {
    const preferredSystems = [
      ...systems.slice(0, 220),
      ...systems.filter((system) => system.id === selectedSystem?.id || system.localAnalysis?.studied || isBlueHostSystem(system)),
    ];
    const dedupedSystems = Array.from(
      preferredSystems.reduce((map, system) => {
        if (!map.has(system.id)) map.set(system.id, system);
        return map;
      }, new Map<string, UniverseSystem>()).values(),
    );
    return dedupedSystems.map((system) => ({
      system,
      display: logScaledVector(system.cartesianPc),
      style: stellarStyle(system),
    }));
  }, [systems, selectedSystem?.id]);
  const referenceMarkers = useMemo(() => {
    return REFERENCE_STAR_CATALOG.map((star) => ({
      star,
      display: logScaledVector(equatorialToCartesianPc(star.raDeg, star.decDeg, star.distancePc)),
      style: (() => {
        const style = stellarStyleFromData({
          seedKey: `reference-${star.name}`,
          spectralType: star.spectralType,
          effectiveTemperatureK: star.effectiveTemperatureK,
          luminositySolar: star.luminositySolar,
          radiusSolar: star.radiusSolar,
        });
        return {
          ...style,
          radiusScale: style.radiusScale * 1.22,
          glowScale: Math.min(style.glowScale * 0.92, 1.56),
          glowOpacity: clamp(style.glowOpacity * 0.78, 0.08, 0.18),
        };
      })(),
    }));
  }, []);
  const deepSkyObjects = useMemo(() => {
    return DEEP_SKY_CATALOG.map((entry) => ({
      entry,
      display: logScaledVector(equatorialToCartesianPc(entry.raDeg, entry.decDeg, entry.distancePc)),
      scale:
        extendedObjectDisplaySize(entry.distancePc, entry.sizePc)
        * (
          entry.kind === "galaxy"
            ? 1.7
            : entry.kind === "blackHole"
              ? 1.58
              : entry.kind === "quasar"
                ? 1.95
                : entry.kind === "pulsar"
                  ? 1.45
                  : 1
        ),
    }));
  }, []);
  const whiteDwarfMarkers = useMemo(() => {
    return whiteDwarfs.map((anchor) => ({
      anchor,
      display: logScaledVector(anchor.cartesianPc),
      style: whiteDwarfStyle(anchor),
    }));
  }, [whiteDwarfs]);
  const selectedReferenceMarker = useMemo(() => {
    if (!selectedReferenceStar) return null;
    const style = stellarStyleFromData({
      seedKey: `reference-${selectedReferenceStar.name}`,
      spectralType: selectedReferenceStar.spectralType,
      effectiveTemperatureK: selectedReferenceStar.effectiveTemperatureK,
      luminositySolar: selectedReferenceStar.luminositySolar,
      radiusSolar: selectedReferenceStar.radiusSolar,
    });
    return {
      star: selectedReferenceStar,
      display: logScaledVector(equatorialToCartesianPc(selectedReferenceStar.raDeg, selectedReferenceStar.decDeg, selectedReferenceStar.distancePc)),
      style: {
        ...style,
        radiusScale: style.radiusScale * 1.22,
        glowScale: Math.min(style.glowScale * 0.92, 1.56),
        glowOpacity: clamp(style.glowOpacity * 0.78, 0.08, 0.18),
      },
    };
  }, [selectedReferenceStar]);
  const selectedWhiteDwarfMarker = useMemo(
    () => (selectedWhiteDwarf ? whiteDwarfMarkers.find(({ anchor }) => anchor.id === selectedWhiteDwarf.id) ?? null : null),
    [selectedWhiteDwarf, whiteDwarfMarkers],
  );

  const selectedPosition = selectedSystem ? logScaledVector(selectedSystem.cartesianPc) : null;
  const isSunSelected = selectedSystem?.id === "sun";
  const selectedStarStyle = selectedSystem ? stellarStyle(selectedSystem) : null;
  const selectedHostRadius = selectedSystem ? selectedStarRadius(selectedSystem) : 0.3;

  useEffect(() => {
    return () => {
      if (pendingStarClickRef.current !== null) {
        window.clearTimeout(pendingStarClickRef.current);
      }
      if (pendingDeepSkyClickRef.current !== null) {
        window.clearTimeout(pendingDeepSkyClickRef.current);
      }
      if (pendingWhiteDwarfClickRef.current !== null) {
        window.clearTimeout(pendingWhiteDwarfClickRef.current);
      }
      if (pendingReferenceStarClickRef.current !== null) {
        window.clearTimeout(pendingReferenceStarClickRef.current);
      }
      onHoverChange(null);
    };
  }, [onHoverChange]);

  useEffect(() => {
    const ratio = previousZoomFactorRef.current / Math.max(zoomFactor, 0.05);
    previousZoomFactorRef.current = zoomFactor;
    if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.0001 || followLocked) return;

    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 0.0001) return;
    camera.position.copy(controls.target.clone().add(offset.multiplyScalar(ratio)));
    controls.update();
  }, [zoomFactor, followLocked]);

  function updateStarHover(event: ThreeEvent<PointerEvent>, system: UniverseSystem, accent: string) {
    const tags = systemInterestLabels(system);
    const magnitudeLine =
      system.stellar.photometry.vMag !== null || system.stellar.photometry.jMag !== null || system.stellar.photometry.kMag !== null
        ? `Mag V/J/K: ${formatNumber(system.stellar.photometry.vMag, 2)} / ${formatNumber(system.stellar.photometry.jMag, 2)} / ${formatNumber(system.stellar.photometry.kMag, 2)}`
        : null;
    onHoverChange({
      x: event.nativeEvent.offsetX,
      y: event.nativeEvent.offsetY,
      accent,
      title: system.name,
      lines: [
        ...(tags.length ? [`Tags: ${tags.join(" · ")}`] : []),
        `Star [Archive]: ${system.stellar.spectralType ?? "Unknown type"}${system.stellar.effectiveTemperatureK ? ` · ${formatNumber(system.stellar.effectiveTemperatureK, 0)} K` : ""}`,
        `Distance [Archive]: ${formatNumber(distanceLy(system.distancePc), 1)} ly · ${formatNumber(system.distancePc, 2)} pc`,
        system.stellar.radiusSolar ? `Radius [Archive]: ${formatNumber(system.stellar.radiusSolar, 2)} R☉` : "Radius [Archive]: unresolved",
        magnitudeLine ? `${magnitudeLine} [Archive]` : "Magnitude [Archive]: unresolved",
        `XYZ [Derived]: ${formatCartesian(system.cartesianPc)}`,
        ...(system.localAnalysis?.interestingReason ? [`Local analysis: ${system.localAnalysis.interestingReason}`] : []),
        ...(system.localAnalysis?.jwstInstrumentLabels.length
          ? [`JWST: ${system.localAnalysis.jwstInstrumentLabels.slice(0, 2).join(", ")}`]
          : []),
      ],
    });
  }

  function updateReferenceStarHover(event: ThreeEvent<PointerEvent>, star: ReferenceStar, accent: string) {
    const cartesianPc = equatorialToCartesianPc(star.raDeg, star.decDeg, star.distancePc);
    onHoverChange({
      x: event.nativeEvent.offsetX,
      y: event.nativeEvent.offsetY,
      accent,
      title: star.name,
      lines: [
        `Reference star · ${star.spectralType} · ${formatNumber(star.effectiveTemperatureK, 0)} K`,
        `Distance [Catalog]: ${formatNumber(distanceLy(star.distancePc), 1)} ly · ${formatNumber(star.distancePc, 2)} pc`,
        `Radius / Luminosity [Catalog]: ${formatNumber(star.radiusSolar, 2)} R☉ / ${formatNumber(star.luminositySolar, 2)} L☉`,
        `XYZ [Derived]: ${formatCartesian(cartesianPc)}`,
      ],
    });
  }

  function updateWhiteDwarfHover(event: ThreeEvent<PointerEvent>, anchor: WhiteDwarfAnchor, accent: string) {
    onHoverChange({
      x: event.nativeEvent.offsetX,
      y: event.nativeEvent.offsetY,
      accent,
      title: anchor.name,
      lines: [
        `White dwarf · ${anchor.spectralType ?? "type unresolved"}${anchor.effectiveTemperatureK ? ` · ${formatNumber(anchor.effectiveTemperatureK, 0)} K` : ""}`,
        `Distance [Catalog]: ${formatNumber(distanceLy(anchor.distancePc), 1)} ly · ${formatNumber(anchor.distancePc, 2)} pc`,
        anchor.massSolar ? `Mass [Catalog]: ${formatNumber(anchor.massSolar, 2)} M☉` : "Mass [Catalog]: unresolved",
        anchor.radiusSolar ? `Radius [Catalog]: ${formatNumber(anchor.radiusSolar, 4)} R☉` : "Radius [Catalog]: unresolved",
        anchor.gravitationalRedshiftKmS ? `v_GR [Catalog]: ${formatNumber(anchor.gravitationalRedshiftKmS, 1)} km/s` : "v_GR [Catalog]: unresolved",
      ],
    });
  }

  function setOrbitPivot(target: THREE.Vector3) {
    if (!controlsRef.current) return;
    controlsRef.current.target.copy(target);
    controlsRef.current.update();
  }

  function startFlightToSystem(target: THREE.Vector3, planetCount: number, duration = 1.35) {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = 6.2 + Math.min(5.5, planetCount * 0.35);
    const offset = new THREE.Vector3(distance * 0.35, distance * 0.18, distance);
    flightRef.current = {
      fromPosition: camera.position.clone(),
      toPosition: target.clone().add(offset),
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
      startedAt: sceneTimeRef.current,
      duration,
    };
  }

  function startFlightToPlanet(target: THREE.Vector3, radius: number) {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = 1.25 + Math.max(0.55, radius * 14);
    const offset = new THREE.Vector3(distance * 0.52, distance * 0.22, distance);
    flightRef.current = {
      fromPosition: camera.position.clone(),
      toPosition: target.clone().add(offset),
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
      startedAt: sceneTimeRef.current,
      duration: 1.05,
    };
  }

  function startFlightToDeepSky(target: THREE.Vector3, scale: number) {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = Math.max(8, scale * 1.4);
    const offset = new THREE.Vector3(distance * 0.28, distance * 0.16, distance);
    flightRef.current = {
      fromPosition: camera.position.clone(),
      toPosition: target.clone().add(offset),
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
      startedAt: sceneTimeRef.current,
      duration: 1.45,
    };
  }

  function startFlightToWhiteDwarf(target: THREE.Vector3) {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = 4.4;
    const offset = new THREE.Vector3(distance * 0.34, distance * 0.18, distance);
    flightRef.current = {
      fromPosition: camera.position.clone(),
      toPosition: target.clone().add(offset),
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
      startedAt: sceneTimeRef.current,
      duration: 1.2,
    };
  }

  useEffect(() => {
    if (!selectionCommand) return;

    if (selectionCommand.kind === "system") {
      const system = systems.find((entry) => entry.id === selectionCommand.key);
      if (!system) return;
      const target = logScaledVector(system.cartesianPc);
      const targetVector = new THREE.Vector3(target.x, target.y, target.z);
      if (!freeRoam) {
        setOrbitPivot(targetVector);
      }
      startFlightToSystem(targetVector, system.planets.length);
      return;
    }

    if (selectionCommand.kind === "deepSky") {
      const object = deepSkyObjects.find(({ entry }) => entry.name === selectionCommand.key);
      if (!object) return;
      const targetVector = new THREE.Vector3(object.display.x, object.display.y, object.display.z);
      if (!freeRoam) {
        setOrbitPivot(targetVector);
      }
      startFlightToDeepSky(targetVector, object.scale);
      return;
    }

    if (selectionCommand.kind === "whiteDwarf") {
      const object = whiteDwarfMarkers.find(({ anchor }) => anchor.id === selectionCommand.key);
      if (!object) return;
      const targetVector = new THREE.Vector3(object.display.x, object.display.y, object.display.z);
      if (!freeRoam) {
        setOrbitPivot(targetVector);
      }
      startFlightToWhiteDwarf(targetVector);
      return;
    }

    if (selectionCommand.kind === "referenceStar") {
      const object = referenceMarkers.find(({ star }) => star.name === selectionCommand.key);
      if (!object) return;
      const targetVector = new THREE.Vector3(object.display.x, object.display.y, object.display.z);
      if (!freeRoam) {
        setOrbitPivot(targetVector);
      }
      startFlightToSystem(targetVector, 0, 1.2);
    }
  }, [selectionCommand, systems, deepSkyObjects, whiteDwarfMarkers, referenceMarkers, freeRoam]);

  function handleStarClick(system: UniverseSystem, target: THREE.Vector3, now: number) {
    const last = lastStarClickRef.current;
    const isDouble = !!last && last.id === system.id && now - last.at < 280;

    if (pendingStarClickRef.current !== null) {
      window.clearTimeout(pendingStarClickRef.current);
      pendingStarClickRef.current = null;
    }

    if (isDouble) {
      lastStarClickRef.current = null;
      onSelectSystem(system);
      startFlightToSystem(target, system.planets.length);
      return;
    }

    lastStarClickRef.current = { id: system.id, at: now };
    pendingStarClickRef.current = window.setTimeout(() => {
      onSelectSystem(system);
      if (!freeRoam) {
        setOrbitPivot(target);
      }
      pendingStarClickRef.current = null;
      if (lastStarClickRef.current?.id === system.id) {
        lastStarClickRef.current = null;
      }
    }, 260);
  }

  function handleDeepSkyClick(entry: DeepSkyObject, target: THREE.Vector3, scale: number, now: number) {
    const last = lastDeepSkyClickRef.current;
    const isDouble = !!last && last.id === entry.name && now - last.at < 280;

    if (pendingDeepSkyClickRef.current !== null) {
      window.clearTimeout(pendingDeepSkyClickRef.current);
      pendingDeepSkyClickRef.current = null;
    }

    if (isDouble) {
      lastDeepSkyClickRef.current = null;
      onSelectDeepSky(entry);
      setOrbitPivot(target);
      startFlightToDeepSky(target, scale);
      return;
    }

    lastDeepSkyClickRef.current = { id: entry.name, at: now };
    pendingDeepSkyClickRef.current = window.setTimeout(() => {
      onSelectDeepSky(entry);
      if (!freeRoam) {
        setOrbitPivot(target);
      }
      pendingDeepSkyClickRef.current = null;
      if (lastDeepSkyClickRef.current?.id === entry.name) {
        lastDeepSkyClickRef.current = null;
      }
    }, 260);
  }

  function handleWhiteDwarfClick(anchor: WhiteDwarfAnchor, target: THREE.Vector3, now: number) {
    const last = lastWhiteDwarfClickRef.current;
    const isDouble = !!last && last.id === anchor.id && now - last.at < 280;

    if (pendingWhiteDwarfClickRef.current !== null) {
      window.clearTimeout(pendingWhiteDwarfClickRef.current);
      pendingWhiteDwarfClickRef.current = null;
    }

    if (isDouble) {
      lastWhiteDwarfClickRef.current = null;
      onSelectWhiteDwarf(anchor);
      setOrbitPivot(target);
      startFlightToWhiteDwarf(target);
      return;
    }

    lastWhiteDwarfClickRef.current = { id: anchor.id, at: now };
    pendingWhiteDwarfClickRef.current = window.setTimeout(() => {
      onSelectWhiteDwarf(anchor);
      if (!freeRoam) {
        setOrbitPivot(target);
      }
      pendingWhiteDwarfClickRef.current = null;
      if (lastWhiteDwarfClickRef.current?.id === anchor.id) {
        lastWhiteDwarfClickRef.current = null;
      }
    }, 260);
  }

  function handleReferenceStarClick(star: ReferenceStar, target: THREE.Vector3, now: number) {
    const last = lastReferenceStarClickRef.current;
    const isDouble = !!last && last.id === star.name && now - last.at < 280;

    if (pendingReferenceStarClickRef.current !== null) {
      window.clearTimeout(pendingReferenceStarClickRef.current);
      pendingReferenceStarClickRef.current = null;
    }

    if (isDouble) {
      lastReferenceStarClickRef.current = null;
      onSelectReferenceStar(star);
      startFlightToSystem(target, 0, 1.2);
      return;
    }

    lastReferenceStarClickRef.current = { id: star.name, at: now };
    pendingReferenceStarClickRef.current = window.setTimeout(() => {
      onSelectReferenceStar(star);
      if (!freeRoam) {
        setOrbitPivot(target);
      }
      pendingReferenceStarClickRef.current = null;
      if (lastReferenceStarClickRef.current?.id === star.name) {
        lastReferenceStarClickRef.current = null;
      }
    }, 260);
  }

  function activeSystemLightDistance(system: UniverseSystem) {
    const maxOrbit = system.planets.slice(0, 10).reduce((currentMax, planet, index) => {
      return Math.max(currentMax, systemOrbitRadius(index, planet.semiMajorAxisAu));
    }, 2.4);
    return Math.max(12, maxOrbit * 3.2);
  }

  useFrame(({ camera, clock }) => {
    cameraRef.current = camera as THREE.PerspectiveCamera;
    sceneTimeRef.current = clock.elapsedTime;
    const controls = controlsRef.current;
    if (!introFlightDoneRef.current && controls && selectedSystem && selectedPosition) {
      introFlightDoneRef.current = true;
      const farDistance = DISPLAY_LOG_SCALE * 8.8;
      const introOffset = new THREE.Vector3(farDistance * 0.16, farDistance * 0.09, farDistance);
      const introTarget = new THREE.Vector3(selectedPosition.x, selectedPosition.y, selectedPosition.z);
      controls.target.copy(introTarget);
      camera.position.copy(introTarget.clone().add(introOffset));
      controls.update();
      startFlightToSystem(introTarget, selectedSystem.planets.length, 3.19);
    }
    const flight = flightRef.current;
    if (!controls || !flight) return;

    const elapsed = clock.elapsedTime - flight.startedAt;
    const t = clamp(elapsed / flight.duration, 0, 1);
    const eased = easeInOutCubic(t);
    camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
    controls.update();

    if (t >= 1) {
      flightRef.current = null;
    }
  });

  return (
    <>
      <color attach="background" args={["#04101f"]} />
      <fog attach="fog" args={["#04101f", DISPLAY_LOG_SCALE * 0.8, DISPLAY_LOG_SCALE * 3.1]} />
      <ambientLight intensity={0.78} color="#9bb7de" />
      <hemisphereLight intensity={0.72} color="#bfd7ff" groundColor="#18314b" />
      <pointLight position={[0, 0, 0]} intensity={3.6} color="#ffd5a6" />
      <pointLight position={[0, 12, 18]} intensity={1.8} color="#9fdcff" />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        enablePan
        panSpeed={0.9}
        enableZoom
        zoomSpeed={1.1}
        minDistance={0.18}
        maxDistance={DISPLAY_LOG_SCALE * 22}
        screenSpacePanning
      />
      <Stars radius={DISPLAY_LOG_SCALE * 1.7} depth={90} count={4200} factor={2.4} saturation={0} fade speed={0.35} />

      {!isSunSelected ? (
        <group>
          <mesh>
            <sphereGeometry args={[0.22, 32, 32]} />
            <meshBasicMaterial color="#ffd36e" />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.52, 32, 32]} />
            <meshBasicMaterial color="#ffd36e" transparent opacity={0.08} depthWrite={false} />
          </mesh>
        </group>
      ) : null}

      {deepSkyObjects.map(({ entry, display, scale }) => (
        <group
          key={entry.name}
          position={[display.x, display.y, display.z]}
          onClick={(event) => {
            event.stopPropagation();
            handleDeepSkyClick(entry, new THREE.Vector3(display.x, display.y, display.z), scale, event.timeStamp);
          }}
        >
          <DeepSkyAnchor entry={entry} scale={scale} onHoverChange={onHoverChange} />
          {entry.kind === "galaxy" || entry.kind === "pulsar" || entry.kind === "blackHole" || entry.kind === "quasar" ? (
            <SystemInterestTag
              label={
                entry.kind === "galaxy"
                  ? "galaxy"
                  : entry.kind === "pulsar"
                    ? "pulsar"
                    : entry.kind === "blackHole"
                      ? "black hole"
                      : "quasar"
              }
              accent={entry.kind === "galaxy" ? entry.accent : entry.tint}
              offset={
                entry.kind === "galaxy"
                  ? scale * 0.34
                  : entry.kind === "quasar"
                    ? scale * 0.36
                    : scale * 0.28
              }
            />
          ) : null}
        </group>
      ))}

      {showWhiteDwarfs
        ? whiteDwarfMarkers
            .filter(({ anchor }) => anchor.id !== selectedWhiteDwarf?.id)
            .map(({ anchor, display, style }) => (
            <group
              key={anchor.id}
              position={[display.x, display.y, display.z]}
              onPointerOver={(event) => {
                event.stopPropagation();
                updateWhiteDwarfHover(event, anchor, style.core);
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
                updateWhiteDwarfHover(event, anchor, style.core);
              }}
              onPointerOut={() => onHoverChange(null)}
              onClick={(event) => {
                event.stopPropagation();
                handleWhiteDwarfClick(anchor, new THREE.Vector3(display.x, display.y, display.z), event.timeStamp);
              }}
            >
              <DistantStarMarker style={style} radius={systemRadius(anchor.distancePc) * 0.82} />
              <SystemInterestTag label="white dwarf" accent={style.core} offset={0.42} />
            </group>
          ))
        : null}

      {referenceMarkers
        .filter(({ star }) => star.name !== selectedReferenceStar?.name)
        .map(({ star, display, style }) => (
        <group
          key={star.name}
          position={[display.x, display.y, display.z]}
          onPointerOver={(event) => {
            event.stopPropagation();
            updateReferenceStarHover(event, star, style.core);
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
            updateReferenceStarHover(event, star, style.core);
          }}
          onPointerOut={() => onHoverChange(null)}
          onClick={(event) => {
            event.stopPropagation();
            handleReferenceStarClick(star, new THREE.Vector3(display.x, display.y, display.z), event.timeStamp);
          }}
        >
          <DistantStarMarker style={style} radius={systemRadius(star.distancePc) * style.radiusScale * 1.16} />
        </group>
      ))}

      {markers
        .filter(({ system }) => system.id !== selectedSystem?.id)
        .map(({ system, display, style }) => {
          const radius = systemRadius(system.distancePc) * style.radiusScale * (system.localAnalysis?.interesting ? 1.14 : 1);
          const tagLabel = systemInterestLabel(system);
          return (
            <group
              key={system.id}
              position={[display.x, display.y, display.z]}
              onPointerOver={(event) => {
                event.stopPropagation();
                updateStarHover(event, system, style.core);
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
                updateStarHover(event, system, style.core);
              }}
              onPointerOut={() => onHoverChange(null)}
              onClick={(event) => {
                event.stopPropagation();
                handleStarClick(system, new THREE.Vector3(display.x, display.y, display.z), event.timeStamp);
              }}
            >
              <DistantStarMarker style={style} radius={radius} />
              {tagLabel ? <SystemInterestTag label={tagLabel} accent={style.core} offset={radius * 3.4} /> : null}
            </group>
          );
        })}

      {selectedSystem && selectedPosition ? (
        <group position={[selectedPosition.x, selectedPosition.y, selectedPosition.z]}>
          <pointLight
            position={[0, 0, 0]}
            intensity={7.4 + Math.min(9, (stellarLuminosity(selectedSystem) ?? 1) * 1.6)}
            distance={activeSystemLightDistance(selectedSystem)}
            decay={0.92}
            color={stellarColor(selectedSystem.stellar.effectiveTemperatureK, selectedSystem.stellar.spectralType)}
          />
          <pointLight
            position={[0, 0, 0]}
            intensity={3.1}
            distance={activeSystemLightDistance(selectedSystem) * 1.45}
            decay={1.22}
            color={stellarColor(selectedSystem.stellar.effectiveTemperatureK, selectedSystem.stellar.spectralType)}
          />
          {selectedStarStyle ? (
            <group
              onPointerOver={(event) => {
                event.stopPropagation();
                updateStarHover(event, selectedSystem, selectedStarStyle.core);
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
                updateStarHover(event, selectedSystem, selectedStarStyle.core);
              }}
              onPointerOut={() => onHoverChange(null)}
              onClick={(event) => {
                event.stopPropagation();
                handleStarClick(selectedSystem, new THREE.Vector3(selectedPosition.x, selectedPosition.y, selectedPosition.z), event.timeStamp);
              }}
            >
              <mesh>
                <sphereGeometry args={[selectedHostRadius * 2.2, 24, 24]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <SelectedStarBody style={selectedStarStyle} radius={selectedHostRadius} />
              {systemInterestLabel(selectedSystem) ? (
                <SystemInterestTag label={systemInterestLabel(selectedSystem)} accent={selectedStarStyle.core} offset={selectedHostRadius * 4.1} />
              ) : null}
            </group>
          ) : null}
          <ActiveSystemPlanets
            system={selectedSystem}
            selectedPlanet={selectedPlanet}
            selectedPlanetScience={selectedPlanetScience}
            onSelectPlanet={onSelectPlanet}
            onHoverChange={onHoverChange}
            onFlyToPlanet={startFlightToPlanet}
            planetViewSyncRef={planetViewSyncRef}
            simulationDays={simulationDays}
            orbitSpeedMultiplier={orbitSpeedMultiplier}
            zoomFactor={zoomFactor}
            followLocked={followLocked}
            controlsRef={controlsRef}
          />
        </group>
      ) : null}

      {selectedReferenceMarker ? (
        <group position={[selectedReferenceMarker.display.x, selectedReferenceMarker.display.y, selectedReferenceMarker.display.z]}>
          <group
            onPointerOver={(event) => {
              event.stopPropagation();
              updateReferenceStarHover(event, selectedReferenceMarker.star, selectedReferenceMarker.style.core);
            }}
            onPointerMove={(event) => {
              event.stopPropagation();
              updateReferenceStarHover(event, selectedReferenceMarker.star, selectedReferenceMarker.style.core);
            }}
            onPointerOut={() => onHoverChange(null)}
            onClick={(event) => {
              event.stopPropagation();
              handleReferenceStarClick(
                selectedReferenceMarker.star,
                new THREE.Vector3(
                  selectedReferenceMarker.display.x,
                  selectedReferenceMarker.display.y,
                  selectedReferenceMarker.display.z,
                ),
                event.timeStamp,
              );
            }}
          >
            <mesh>
              <sphereGeometry args={[systemRadius(selectedReferenceMarker.star.distancePc) * selectedReferenceMarker.style.radiusScale * 2.5, 24, 24]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <SelectedStarBody
              style={selectedReferenceMarker.style}
              radius={systemRadius(selectedReferenceMarker.star.distancePc) * selectedReferenceMarker.style.radiusScale * 1.18}
            />
          </group>
        </group>
      ) : null}

      {selectedWhiteDwarfMarker ? (
        <group position={[selectedWhiteDwarfMarker.display.x, selectedWhiteDwarfMarker.display.y, selectedWhiteDwarfMarker.display.z]}>
          <group
            onPointerOver={(event) => {
              event.stopPropagation();
              updateWhiteDwarfHover(event, selectedWhiteDwarfMarker.anchor, selectedWhiteDwarfMarker.style.core);
            }}
            onPointerMove={(event) => {
              event.stopPropagation();
              updateWhiteDwarfHover(event, selectedWhiteDwarfMarker.anchor, selectedWhiteDwarfMarker.style.core);
            }}
            onPointerOut={() => onHoverChange(null)}
            onClick={(event) => {
              event.stopPropagation();
              handleWhiteDwarfClick(
                selectedWhiteDwarfMarker.anchor,
                new THREE.Vector3(
                  selectedWhiteDwarfMarker.display.x,
                  selectedWhiteDwarfMarker.display.y,
                  selectedWhiteDwarfMarker.display.z,
                ),
                event.timeStamp,
              );
            }}
          >
            <mesh>
              <sphereGeometry args={[systemRadius(selectedWhiteDwarfMarker.anchor.distancePc) * 2.2, 24, 24]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <SelectedStarBody
              style={selectedWhiteDwarfMarker.style}
              radius={systemRadius(selectedWhiteDwarfMarker.anchor.distancePc) * 0.92}
            />
          </group>
        </group>
      ) : null}
    </>
  );
}

function VisualFocus({
  system,
  planet,
  science,
  showMagnetosphere,
  onToggleMagnetosphere,
  planetViewSyncRef,
}: {
  system: UniverseSystem;
  planet: UniversePlanet | null;
  science?: PlanetScienceBundle | null;
  showMagnetosphere: boolean;
  onToggleMagnetosphere: () => void;
  planetViewSyncRef?: PlanetViewSyncRef;
}) {
  const palette = paletteForSelection(system, planet, science);
  const visualModel = planet ? planetVisualModel(system, planet, science) : null;
  const synopsis = buildSynopsis(system, planet, science);
  const [visualZoom, setVisualZoom] = useState(1);

  return (
    <FocusFrame
      eyebrow={planet ? "Planet Synopsis" : "Star Synopsis"}
      synopsis={synopsis}
      controls={planet ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[0.62rem] uppercase tracking-[0.18em] text-slate-200">
            <button
              type="button"
              onClick={() => setVisualZoom((value) => clamp(value - 0.15, 0.7, 2.8))}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-100 transition hover:bg-white/[0.08]"
            >
              -
            </button>
            <span>{visualZoom.toFixed(2)}x</span>
            <button
              type="button"
              onClick={() => setVisualZoom((value) => clamp(value + 0.15, 0.7, 2.8))}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-100 transition hover:bg-white/[0.08]"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={onToggleMagnetosphere}
            className={`rounded-full border px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.2em] transition ${showMagnetosphere ? "border-cyan-300/34 bg-cyan-300/12 text-cyan-50" : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"}`}
          >
            {showMagnetosphere ? "Hide Mag Field" : "Show Mag Field"}
          </button>
        </div>
      ) : null}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 26% 22%, ${hsla(palette.star, 0.28)}, transparent 0 18%, ${hsla(palette.accent, 0.16)} 34%, transparent 62%), linear-gradient(180deg, rgba(3,8,20,0.08), rgba(2,6,17,0.78))`,
        }}
      />
      {planet ? (
        <div className="relative min-h-[18rem] overflow-hidden rounded-[1.5rem] border border-white/8 bg-[radial-gradient(circle_at_32%_30%,rgba(255,255,255,0.08),transparent_0_18%,rgba(255,170,120,0.04)_34%,transparent_56%),linear-gradient(180deg,rgba(7,16,36,0.82),rgba(2,8,18,0.96))]">
          <div
            className="absolute left-[8%] top-[8%] rounded-full blur-3xl"
            style={{
              width: "12rem",
              height: "12rem",
              background: hsla(palette.star, 0.34),
            }}
          />
          {(() => {
            const renderProps = visualModel!.renderProps;
            return (
              <>
                <div className="absolute inset-x-[18%] top-[58%] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  onWheel={(event) => {
                    event.preventDefault();
                    setVisualZoom((value) => clamp(value + (event.deltaY < 0 ? 0.12 : -0.12), 0.7, 2.8));
                  }}
                >
                  <div
                    className="w-full max-w-[25rem] origin-center transition-transform duration-200"
                    style={{ transform: `scale(${visualZoom * 0.9})` }}
                  >
                    <PlanetGlobe
                      {...renderProps}
                      liveViewRef={planetViewSyncRef}
                      showMagnetosphere={showMagnetosphere}
                      className="!min-h-[24rem]"
                    />
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-5 flex justify-center">
                  <div className="flex gap-2 text-[0.65rem] uppercase tracking-[0.24em] text-slate-200/62">
                    <span>{planetClass(planet)}</span>
                    <span>·</span>
                    <span>{temperatureClass(planet.equilibriumK)}</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <StarOverviewVisual system={system} />
      )}
    </FocusFrame>
  );
}

export function UniverseStage({ snapshot }: { snapshot: UniverseSnapshot; introArmed?: boolean }) {
  const defaultSystem = useMemo(() => {
    return snapshot.systems.find((system) => system.id === "sun") ?? snapshot.systems[0] ?? null;
  }, [snapshot.systems]);
  const defaultPlanet = useMemo(() => {
    if (!defaultSystem) return null;
    return defaultSystem.planets.find((planet) => planet.id === "earth") ?? defaultSystem.planets[0] ?? null;
  }, [defaultSystem]);
  const [query, setQuery] = useState("");
  const [chartPreset, setChartPreset] = useState<ChartPreset>("all");
  const [spectralFilter, setSpectralFilter] = useState("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedStageFilters>(DEFAULT_ADVANCED_STAGE_FILTERS);
  const [simulationDays] = useState(0);
  const [orbitSpeedMultiplier, setOrbitSpeedMultiplier] = useState(1);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [followLocked, setFollowLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsNavOpen, setFsNavOpen] = useState(true);
  const [fsInfoOpen, setFsInfoOpen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);
  const [freeRoam, setFreeRoam] = useState(false);
  const [showWhiteDwarfs, setShowWhiteDwarfs] = useState(false);
  const [showMagnetosphere, setShowMagnetosphere] = useState(false);
  const [focusKind, setFocusKind] = useState<FocusKind>(defaultPlanet ? "planet" : "system");
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(defaultSystem?.id ?? null);
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(defaultPlanet?.id ?? null);
  const [selectedDeepSkyName, setSelectedDeepSkyName] = useState<string | null>(null);
  const [selectedWhiteDwarfId, setSelectedWhiteDwarfId] = useState<string | null>(null);
  const [selectedReferenceStarName, setSelectedReferenceStarName] = useState<string | null>(null);
  const [selectionCommand, setSelectionCommand] = useState<StageSelectionCommand | null>(null);
  const [planetScience, setPlanetScience] = useState<PlanetScienceBundle | null>(null);
  const [planetScienceResolvedKey, setPlanetScienceResolvedKey] = useState<string | null>(null);
  const [stageHover, setStageHover] = useState<StageHover | null>(null);
  const planetViewSyncRef = useRef<PlanetGlobeLiveView | null>(null);
  const guidedTargets = useMemo(() => buildGuidedTargets(snapshot), [snapshot]);

  const filteredSystems = useMemo(() => {
    const search = query.trim().toLowerCase();
    return snapshot.systems.filter((system) => {
      const matchesSearch =
        !search ||
        system.name.toLowerCase().includes(search) ||
        system.planets.some((planet) => planet.name.toLowerCase().includes(search));
      const matchesPreset = systemMatchesChartPreset(system, chartPreset);
      const matchesType = spectralFilter === "all" || spectralBucket(system.stellar.spectralType) === spectralFilter;
      const matchesAdvanced = systemMatchesAdvancedFilters(system, advancedFilters);
      return matchesSearch && matchesPreset && matchesType && matchesAdvanced;
    });
  }, [advancedFilters, chartPreset, query, spectralFilter, snapshot.systems]);

  const selectedSystem = useMemo(() => {
    if (focusKind === "deepSky" || focusKind === "whiteDwarf" || focusKind === "referenceStar") {
      return null;
    }
    if (!filteredSystems.length) {
      return null;
    }
    if (!selectedSystemId) return filteredSystems[0] ?? null;
    return filteredSystems.find((system) => system.id === selectedSystemId) ?? filteredSystems[0] ?? null;
  }, [filteredSystems, selectedSystemId, focusKind]);

  const selectedPlanet = useMemo(() => {
    if (!selectedSystem || focusKind !== "planet") return null;
    if (!selectedPlanetId) return null;
    return selectedSystem.planets.find((planet) => planet.id === selectedPlanetId) ?? null;
  }, [focusKind, selectedPlanetId, selectedSystem]);
  const canFollowSelectedPlanet = !!selectedPlanet;
  const stageFollowLocked = followLocked && canFollowSelectedPlanet;

  useEffect(() => {
    if (canFollowSelectedPlanet || !followLocked) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setFollowLocked(false);
    });
    return () => {
      cancelled = true;
    };
  }, [canFollowSelectedPlanet, followLocked]);

  const selectedPlanetScience = useMemo(() => {
    if (!planetScience || !selectedPlanet) return null;
    return scienceKey(planetScience.planetName) === scienceKey(selectedPlanet.name) ? planetScience : null;
  }, [planetScience, selectedPlanet]);
  const selectedDeepSky = useMemo(
    () => (selectedDeepSkyName ? DEEP_SKY_CATALOG.find((entry) => entry.name === selectedDeepSkyName) ?? null : null),
    [selectedDeepSkyName],
  );
  const selectedWhiteDwarf = useMemo(
    () => (selectedWhiteDwarfId ? snapshot.whiteDwarfs.anchors.find((anchor) => anchor.id === selectedWhiteDwarfId) ?? null : null),
    [selectedWhiteDwarfId, snapshot.whiteDwarfs.anchors],
  );
  const selectedReferenceStar = useMemo(
    () => (selectedReferenceStarName ? REFERENCE_STAR_CATALOG.find((star) => star.name === selectedReferenceStarName) ?? null : null),
    [selectedReferenceStarName],
  );
  const objectNavigatorOptions = useMemo(() => ({
    systems: filteredSystems.map((system) => ({ value: `system:${system.id}`, label: system.name })),
    deepSky: DEEP_SKY_CATALOG.map((entry) => ({ value: `deepSky:${entry.name}`, label: `${entry.name} · ${deepSkyKindLabel(entry.kind)}` })),
    whiteDwarfs: snapshot.whiteDwarfs.anchors.map((anchor) => ({ value: `whiteDwarf:${anchor.id}`, label: `${anchor.name} · white dwarf` })),
    referenceStars: REFERENCE_STAR_CATALOG.map((star) => ({ value: `referenceStar:${star.name}`, label: `${star.name} · ${star.spectralType}` })),
  }), [filteredSystems, snapshot.whiteDwarfs.anchors]);
  const navigatorValue =
    focusKind === "deepSky" && selectedDeepSky
      ? `deepSky:${selectedDeepSky.name}`
      : focusKind === "whiteDwarf" && selectedWhiteDwarf
        ? `whiteDwarf:${selectedWhiteDwarf.id}`
        : focusKind === "referenceStar" && selectedReferenceStar
          ? `referenceStar:${selectedReferenceStar.name}`
          : selectedSystem
            ? `system:${selectedSystem.id}`
            : objectNavigatorOptions.systems[0]?.value ?? "";

  useEffect(() => {
    planetViewSyncRef.current = null;
  }, [selectedSystem?.id, selectedPlanet?.id, focusKind, selectedDeepSkyName, selectedWhiteDwarfId, selectedReferenceStarName]);
  const selectedPlanetKey = selectedPlanet ? scienceKey(selectedPlanet.name) : null;
  const planetScienceLoading = !!selectedPlanetKey && planetScienceResolvedKey !== selectedPlanetKey;

  useEffect(() => {
    const targetPlanetName = selectedPlanet?.name;
    if (!targetPlanetName) return;
    const targetKey = scienceKey(targetPlanetName);
    let cancelled = false;

    if (selectedSystem?.id === "sun" && targetKey !== "earth") {
      queueMicrotask(() => {
        if (cancelled) return;
        setPlanetScience(null);
        setPlanetScienceResolvedKey(targetKey);
      });
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/science/planet?name=${encodeURIComponent(targetPlanetName)}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as PlanetScienceBundle;
      })
      .then((bundle) => {
        if (cancelled) return;
        setPlanetScience(bundle);
        setPlanetScienceResolvedKey(targetKey);
      })
      .catch(() => {
        if (cancelled) return;
        setPlanetScience(null);
        setPlanetScienceResolvedKey(targetKey);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPlanet?.name, selectedSystem?.id]);

  const activeFocusKind: FocusKind | null = selectedDeepSky
    ? "deepSky"
    : selectedWhiteDwarf
      ? "whiteDwarf"
      : selectedReferenceStar
        ? "referenceStar"
        : selectedSystem
          ? (selectedPlanet ? "planet" : "system")
          : null;

  const observedMetrics = activeFocusKind === "deepSky" && selectedDeepSky
    ? buildDeepSkyObservedMetrics(selectedDeepSky)
    : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf
      ? buildWhiteDwarfObservedMetrics(selectedWhiteDwarf)
      : activeFocusKind === "referenceStar" && selectedReferenceStar
        ? buildReferenceStarObservedMetrics(selectedReferenceStar)
        : selectedSystem
          ? buildObservedMetrics(selectedSystem, selectedPlanet, selectedPlanetScience)
          : [];
  const derivedMetrics = activeFocusKind === "deepSky" && selectedDeepSky
    ? buildDeepSkyDerivedMetrics(selectedDeepSky)
    : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf
      ? buildWhiteDwarfDerivedMetrics(selectedWhiteDwarf)
      : activeFocusKind === "referenceStar" && selectedReferenceStar
        ? buildReferenceStarDerivedMetrics(selectedReferenceStar)
        : selectedSystem
          ? buildDerivedMetrics(selectedSystem, selectedPlanet, selectedPlanetScience)
          : [];
  const uncertaintyMetrics = activeFocusKind === "deepSky" && selectedDeepSky
    ? buildDeepSkyUncertaintyMetrics(selectedDeepSky)
    : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf
      ? buildWhiteDwarfUncertaintyMetrics()
      : activeFocusKind === "referenceStar" && selectedReferenceStar
        ? buildReferenceStarUncertaintyMetrics()
        : selectedSystem
          ? buildUncertaintyMetrics(selectedSystem, selectedPlanet, selectedPlanetScience)
          : [];
  const chartRows = activeFocusKind === "deepSky" && selectedDeepSky
    ? buildDeepSkyChartRows(selectedDeepSky)
    : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf
      ? buildWhiteDwarfChartRows(selectedWhiteDwarf)
      : activeFocusKind === "referenceStar" && selectedReferenceStar
        ? buildReferenceStarChartRows(selectedReferenceStar)
        : selectedSystem
          ? buildChartRows(selectedSystem, selectedPlanet, selectedPlanetScience)
          : [];
  const analysis = activeFocusKind === "deepSky" && selectedDeepSky
    ? buildDeepSkyAnalysis(selectedDeepSky)
    : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf
      ? buildWhiteDwarfAnalysis(selectedWhiteDwarf)
      : activeFocusKind === "referenceStar" && selectedReferenceStar
        ? buildReferenceStarAnalysis(selectedReferenceStar)
        : selectedSystem
          ? buildAnalysis(selectedSystem, selectedPlanet, selectedPlanetScience)
          : "No target in the current filtered universe slice.";
  const sources = activeFocusKind === "deepSky" && selectedDeepSky
    ? deepSkySources(selectedDeepSky)
    : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf
      ? [...selectedWhiteDwarf.provenance, ...snapshot.whiteDwarfs.sources]
      : activeFocusKind === "referenceStar" && selectedReferenceStar
        ? referenceStarSources(selectedReferenceStar)
        : selectedSystem
          ? dedupeSources(selectedSystem, selectedPlanet, selectedPlanetScience)
          : [];
  const activeTitle = activeFocusKind === "deepSky" && selectedDeepSky
    ? selectedDeepSky.name
    : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf
      ? selectedWhiteDwarf.name
      : activeFocusKind === "referenceStar" && selectedReferenceStar
        ? selectedReferenceStar.name
        : selectedPlanet?.name ?? selectedSystem?.name ?? "No selection";
  const activeSynopsis = activeFocusKind === "deepSky" && selectedDeepSky
    ? buildDeepSkySynopsis(selectedDeepSky)
    : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf
      ? buildWhiteDwarfSynopsis(selectedWhiteDwarf)
      : activeFocusKind === "referenceStar" && selectedReferenceStar
        ? buildReferenceStarSynopsis(selectedReferenceStar)
        : selectedSystem
          ? buildSynopsis(selectedSystem, selectedPlanet, selectedPlanetScience)
          : "The current filter set returned no systems.";
  const activeBasis = activeFocusKind === "deepSky"
    ? "Catalog · Scene"
    : activeFocusKind === "whiteDwarf"
      ? "Catalog · Local"
      : activeFocusKind === "referenceStar"
        ? "Catalog"
        : selectedSystem
          ? compactSourceBadges(selectedSystem, selectedPlanet, selectedPlanetScience)
          : "None";
  const activeSourceNote = activeFocusKind === "planet" && selectedSystem && selectedPlanet
    ? compactSourceNote(selectedSystem, selectedPlanet, selectedPlanetScience)
    : activeFocusKind === "system"
      ? "Host-star/system overview derived from archive fields."
      : activeFocusKind === "deepSky"
        ? "Deep-sky object class and placement from the local scene catalog."
        : activeFocusKind === "whiteDwarf"
          ? "White-dwarf detail from the repaired local degenerate-star layer."
          : activeFocusKind === "referenceStar"
            ? "Reference-star detail from the local bright-star anchor layer."
            : "";
  const activeStatus = activeFocusKind === "planet"
    ? (planetScienceLoading ? "Pulling official internet enrichment..." : selectedSystem ? localAnalysisStatus(selectedSystem, selectedPlanet, selectedPlanetScience) : "Archive snapshot only")
    : activeFocusKind === "system"
      ? "Host-star overview"
      : activeFocusKind === "deepSky"
        ? "Deep-sky catalog focus"
        : activeFocusKind === "whiteDwarf"
          ? "Degenerate-star layer focus"
          : activeFocusKind === "referenceStar"
            ? "Reference-star focus"
            : "";
  const activeObservationPlan = activeFocusKind === "deepSky" && selectedDeepSky
    ? `Deep-sky planning path: ${selectedDeepSky.name} is currently a catalog-and-art anchor, not a JWST exoplanet target card. Use this panel for spatial context, class, and scale rather than exoplanet transit planning.`
    : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf
      ? `White-dwarf planning path: ${selectedWhiteDwarf.name} belongs to the degenerate-star lab layer. The relevant next step is mass-radius / gravitational-redshift analysis, not the exoplanet transit planner.`
      : activeFocusKind === "referenceStar" && selectedReferenceStar
        ? `Reference-star planning path: ${selectedReferenceStar.name} is a stellar calibration anchor used to keep field color, scale, and temperature morphology grounded. It is not currently part of the JWST exoplanet follow-up queue.`
      : selectedSystem
          ? buildObservationPlan(selectedSystem, selectedPlanet, selectedPlanetScience)
          : "No target selected.";
  const observedTitle = observedSectionTitle(activeFocusKind);
  const derivedTitle = derivedSectionTitle(activeFocusKind);
  const uncertaintyTitle = uncertaintySectionTitle(activeFocusKind);
  const planningTitle = planningSectionTitle(activeFocusKind);
  const chartTitle = chartsSectionTitle(activeFocusKind);
  const analysisTitle = analysisSectionTitle(activeFocusKind);
  const analysisSubtitle = analysisSectionSubtitle(activeFocusKind);
  const exportBaseName = `${sanitizeFilenamePart(activeTitle)}-${sanitizeFilenamePart(focusObjectNoun(activeFocusKind))}`;
  const exportJson = JSON.stringify({
    title: activeTitle,
    focusKind: activeFocusKind,
    synopsis: activeSynopsis,
    basis: activeBasis,
    status: activeStatus,
    sourceNote: activeSourceNote,
    observationPlan: activeObservationPlan,
    observedMetrics,
    derivedMetrics,
    uncertaintyMetrics,
    chartRows,
    sources,
    analysis,
  }, null, 2);
  const exportTxt = [
    `TITLE: ${activeTitle}`,
    `FOCUS: ${focusObjectNoun(activeFocusKind)}`,
    `STATUS: ${activeStatus || "Unspecified"}`,
    `BASIS: ${activeBasis || "Unspecified"}`,
    activeSourceNote ? `SOURCE NOTE: ${activeSourceNote}` : null,
    "",
    "SYNOPSIS",
    activeSynopsis,
    "",
    observedTitle.toUpperCase(),
    ...observedMetrics.map((metric) => `- ${metric.label}: ${metric.value} | ${metric.note}`),
    "",
    derivedTitle.toUpperCase(),
    ...derivedMetrics.map((metric) => `- ${metric.label}: ${metric.value} | ${metric.note}`),
    "",
    uncertaintyTitle.toUpperCase(),
    ...uncertaintyMetrics.map((metric) => `- ${metric.label}: ${metric.value} | ${metric.note}`),
    "",
    planningTitle.toUpperCase(),
    activeObservationPlan,
    "",
    chartTitle.toUpperCase(),
    ...chartRows.map((row) => `- ${row.label}: ${row.note}`),
    "",
    "PROVENANCE",
    ...sources.map((source) => `- ${source.name} | ${source.kind} | ${source.url}`),
    "",
    analysisTitle.toUpperCase(),
    analysis,
  ].filter(Boolean).join("\n");
  const exportCsvRows = [
    ["section", "kind", "label", "value", "note", "provenance", "equation"],
    ...metricRowsToCsv("observed", observedMetrics),
    ...metricRowsToCsv("derived", derivedMetrics),
    ...metricRowsToCsv("uncertainty", uncertaintyMetrics),
    ["planning", activeFocusKind ?? "", planningTitle, activeObservationPlan, "", "", ""],
    ...chartRowsToCsv(chartRows),
    ...sources.map((source) => ["source", source.kind, source.name, source.url, source.cache, source.accessedAt, ""]),
  ];
  const exportCsv = exportCsvRows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, "\"\"")}"`).join(","))
    .join("\n");
  const contextPanelTitle = activeFocusKind === "deepSky"
    ? "Object context"
    : activeFocusKind === "whiteDwarf"
      ? "White dwarf context"
      : activeFocusKind === "referenceStar"
        ? "Star context"
        : "Planets in focus";
  const orbitSpeedLabel = `${orbitSpeedMultiplier.toFixed(1)}x`;
  const activeChartPreset = CHART_PRESETS.find((preset) => preset.id === chartPreset);

  function jumpHome() {
    setQuery("");
    setChartPreset("all");
    setSpectralFilter("all");
    setAdvancedFiltersOpen(false);
    setAdvancedFilters(DEFAULT_ADVANCED_STAGE_FILTERS);
    setFreeRoam(false);
    setFollowLocked(false);
    setShowWhiteDwarfs(false);
    setZoomFactor(1);
    setFocusKind("planet");
    setSelectedSystemId("sun");
    setSelectedPlanetId("earth");
    setSelectedDeepSkyName(null);
    setSelectedWhiteDwarfId(null);
    setSelectedReferenceStarName(null);
  }

  function selectGuidedTarget(target: GuidedTarget) {
    setQuery(target.query);
    setChartPreset("all");
    setSpectralFilter("all");
    setAdvancedFiltersOpen(false);
    setAdvancedFilters(DEFAULT_ADVANCED_STAGE_FILTERS);
    setFreeRoam(false);
    setFollowLocked(false);
    setZoomFactor(1);
    setSelectedWhiteDwarfId(null);
    setSelectedReferenceStarName(null);

    if (target.kind === "planet") {
      setFocusKind("planet");
      setSelectedSystemId(target.systemId);
      setSelectedPlanetId(target.planetId);
      setSelectedDeepSkyName(null);
      setSelectionCommand((current) => ({ kind: "system", key: target.systemId, nonce: (current?.nonce ?? 0) + 1 }));
      return;
    }

    setFocusKind("deepSky");
    setSelectedDeepSkyName(target.name);
    setSelectedSystemId(null);
    setSelectedPlanetId(null);
    setSelectionCommand((current) => ({ kind: "deepSky", key: target.name, nonce: (current?.nonce ?? 0) + 1 }));
  }

  function applyChartPreset(preset: ChartPreset) {
    if (preset === "all") {
      jumpHome();
      return;
    }

    setChartPreset(preset);
    setQuery("");
    setSpectralFilter("all");
    setAdvancedFiltersOpen(false);
    setAdvancedFilters(DEFAULT_ADVANCED_STAGE_FILTERS);
    setFreeRoam(false);
    setFollowLocked(false);
    setZoomFactor(1);
    setSelectedDeepSkyName(null);
    setSelectedWhiteDwarfId(null);
    setSelectedReferenceStarName(null);

    const first = firstPlanetForChartPreset(snapshot.systems, preset);
    if (first) {
      setFocusKind("planet");
      setSelectedSystemId(first.system.id);
      setSelectedPlanetId(first.planet.id);
      setSelectionCommand((current) => ({ kind: "system", key: first.system.id, nonce: (current?.nonce ?? 0) + 1 }));
      return;
    }

    setFocusKind("system");
    setSelectedSystemId(defaultSystem?.id ?? snapshot.systems[0]?.id ?? null);
    setSelectedPlanetId(null);
  }

  return (
    <section
      id="science-deck"
      className={isFullscreen ? "fixed inset-0 z-[70] overflow-hidden bg-[#020610]" : "scroll-mt-28 space-y-6"}
    >
      <div className={isFullscreen ? "relative h-full" : "grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_30rem] xl:items-start"}>
        <div className={isFullscreen ? "h-full" : "space-y-6"}>
          <div
            className={
              isFullscreen
                ? "relative flex h-full flex-col overflow-hidden bg-[#020610]"
                : "overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,16,34,0.82),rgba(3,9,22,0.62))] shadow-[0_30px_120px_rgba(2,8,24,0.42)] backdrop-blur-xl"
            }
          >
            <div className={`flex-col gap-4 border-b border-white/8 px-5 py-5 lg:flex-row lg:items-end lg:justify-between ${isFullscreen ? "hidden" : "flex"}`}>
              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.28em] text-sky-100/52">3D Star Plotter</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Star chart plotter</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300/72">
                  The chart preserves catalog bearing and distance to each host-star center. Stars keep science-informed colors, while point sizes, planets, and deep-sky art are display-scaled so the plot remains readable and clickable.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.68rem] uppercase tracking-[0.24em] text-slate-200/70">
                {filteredSystems.length} systems in view{chartPreset !== "all" && activeChartPreset ? ` · ${activeChartPreset.label}` : ""} · {snapshot.whiteDwarfs.anchors.length} white dwarfs available
              </div>
            </div>

            <div
              className={
                isFullscreen
                  ? `absolute inset-y-0 left-0 z-30 w-[24rem] max-w-[88vw] overflow-y-auto border-r border-white/10 bg-[#030a18]/94 pt-16 backdrop-blur-xl transition-transform duration-300 ${fsNavOpen ? "translate-x-0" : "-translate-x-full"}`
                  : undefined
              }
            >
            {guidedTargets.length ? (
              <div className="border-b border-white/8 px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[0.66rem] uppercase tracking-[0.24em] text-sky-100/48">Plot these first</div>
                    <p className="mt-1 text-sm leading-6 text-slate-300/72">
                      These fixes are present in the current snapshot, so every button plots a real object instead of an empty search.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {guidedTargets.map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => selectGuidedTarget(target)}
                        className="group max-w-[15rem] rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left transition hover:border-sky-300/28 hover:bg-sky-300/10"
                        title={target.note}
                      >
                        <div className="text-[0.58rem] uppercase tracking-[0.18em] text-sky-100/48 group-hover:text-sky-100/72">{target.eyebrow}</div>
                        <div className="mt-1 text-sm font-medium text-white">{target.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="border-b border-white/8 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.24em] text-sky-100/48">Plot a route view</div>
                  <p className="mt-1 text-sm leading-6 text-slate-300/72">
                    Filter the chart to the kinds of worlds people usually want to sail toward: temperate candidates or nearby gas giants.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CHART_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyChartPreset(preset.id)}
                      title={preset.note}
                      className={`group max-w-[15rem] rounded-2xl border px-3 py-2 text-left transition ${
                        chartPreset === preset.id
                          ? "border-cyan-300/34 bg-cyan-300/12 text-cyan-50"
                          : "border-white/10 bg-white/[0.04] text-white hover:border-sky-300/28 hover:bg-sky-300/10"
                      }`}
                    >
                      <div className={`text-[0.58rem] uppercase tracking-[0.18em] ${chartPreset === preset.id ? "text-cyan-100/74" : "text-sky-100/48 group-hover:text-sky-100/72"}`}>
                        {preset.eyebrow}
                      </div>
                      <div className="mt-1 text-sm font-medium">{preset.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 border-b border-white/8 px-5 py-4 md:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_16rem_10rem_auto]">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.24em] text-slate-300/58">
                  <Search className="h-3.5 w-3.5" /> Search chart object
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. Earth, Proxima, TRAPPIST-1, L 98-59"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-slate-950/58"
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.24em] text-slate-300/58">
                  <Crosshair className="h-3.5 w-3.5" /> Chart fix
                </span>
                <select
                  value={navigatorValue}
                  onChange={(event) => {
                    const [kind, rawKey] = event.target.value.split(":");
                    const key = rawKey ?? "";
                    if (!key) return;
                    setFreeRoam(false);
                    setFollowLocked(false);
                    setSelectedPlanetId(null);
                    if (kind === "system") {
                      setFocusKind("system");
                      setSelectedSystemId(key);
                      setSelectedDeepSkyName(null);
                      setSelectedWhiteDwarfId(null);
                      setSelectedReferenceStarName(null);
                      setSelectionCommand({ kind: "system", key, nonce: Date.now() });
                      return;
                    }
                    if (kind === "deepSky") {
                      setFocusKind("deepSky");
                      setSelectedDeepSkyName(key);
                      setSelectedSystemId(null);
                      setSelectedWhiteDwarfId(null);
                      setSelectedReferenceStarName(null);
                      setSelectionCommand({ kind: "deepSky", key, nonce: Date.now() });
                      return;
                    }
                    if (kind === "whiteDwarf") {
                      setShowWhiteDwarfs(true);
                      setFocusKind("whiteDwarf");
                      setSelectedWhiteDwarfId(key);
                      setSelectedDeepSkyName(null);
                      setSelectedSystemId(null);
                      setSelectedReferenceStarName(null);
                      setSelectionCommand({ kind: "whiteDwarf", key, nonce: Date.now() });
                      return;
                    }
                    if (kind === "referenceStar") {
                      setFocusKind("referenceStar");
                      setSelectedReferenceStarName(key);
                      setSelectedDeepSkyName(null);
                      setSelectedWhiteDwarfId(null);
                      setSelectedSystemId(null);
                      setSelectionCommand({ kind: "referenceStar", key, nonce: Date.now() });
                    }
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/30 focus:bg-slate-950/58"
                >
                  <optgroup label="Host systems">
                    {objectNavigatorOptions.systems.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Deep sky">
                    {objectNavigatorOptions.deepSky.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Reference stars">
                    {objectNavigatorOptions.referenceStars.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="White dwarfs">
                    {objectNavigatorOptions.whiteDwarfs.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.24em] text-slate-300/58">
                  <Sparkles className="h-3.5 w-3.5" /> Host type
                </span>
                <select
                  value={spectralFilter}
                  onChange={(event) => setSpectralFilter(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/30 focus:bg-slate-950/58"
                >
                  <option value="all">All</option>
                  <option value="F">F</option>
                  <option value="G">G</option>
                  <option value="K">K</option>
                  <option value="M">M</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <div className="relative flex items-end xl:min-w-[8rem]">
                {advancedFiltersOpen ? (
                  <div className="absolute bottom-[calc(100%+0.75rem)] right-0 z-30 w-[22rem] rounded-[1.35rem] border border-white/12 bg-slate-950/90 p-4 shadow-[0_18px_48px_rgba(2,8,24,0.55)] backdrop-blur-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[0.62rem] uppercase tracking-[0.24em] text-sky-100/50">Advanced Filters</div>
                        <div className="mt-1 text-sm text-slate-200/74">Wide-field JWST triage against archive and local science fields.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAdvancedFilters(DEFAULT_ADVANCED_STAGE_FILTERS);
                          setAdvancedFiltersOpen(false);
                        }}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.18em] text-slate-200 transition hover:bg-white/[0.08]"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 sm:col-span-2">
                        <span className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-300/56">Uncertainty mode</span>
                        <select
                          value={advancedFilters.uncertaintyMode}
                          onChange={(event) => {
                            const next = event.target.value === "propagated" ? "propagated" : "median";
                            setAdvancedFilters((current) => ({
                              ...current,
                              uncertaintyMode: next,
                            }));
                          }}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/56 px-3 py-2 text-sm text-white outline-none transition focus:border-sky-300/30 focus:bg-slate-950/72"
                        >
                          <option value="median">Median values only</option>
                          <option value="propagated">Use propagated intervals</option>
                        </select>
                        <div className="text-xs leading-relaxed text-slate-400/82">
                          {advancedFilters.uncertaintyMode === "propagated"
                            ? "Range filters now use overlap against the propagated interval, so a planet stays in view when its uncertainty band crosses the selected window."
                            : "Range filters use single median values only, which is stricter but ignores propagated uncertainty."}
                        </div>
                      </label>
                      {[
                        ["Min Flux", "minFlux", advancedFilters.minFlux],
                        ["Max Flux", "maxFlux", advancedFilters.maxFlux],
                        ["Min Temp", "minTemp", advancedFilters.minTemp],
                        ["Max Temp", "maxTemp", advancedFilters.maxTemp],
                        ["Min Gravity", "minGravity", advancedFilters.minGravity],
                        ["Max Gravity", "maxGravity", advancedFilters.maxGravity],
                        ["Min Radius", "minRadius", advancedFilters.minRadius],
                        ["Max Radius", "maxRadius", advancedFilters.maxRadius],
                      ].map(([label, key, value]) => (
                        <label key={String(key)} className="space-y-1.5">
                          <span className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-300/56">{label}</span>
                          <input
                            type="number"
                            step="0.1"
                            value={Number(value)}
                            onChange={(event) => {
                              const next = Number(event.target.value || 0);
                              setAdvancedFilters((current) => ({
                                ...current,
                                [key]: next,
                              }));
                            }}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/56 px-3 py-2 text-sm text-white outline-none transition focus:border-sky-300/30 focus:bg-slate-950/72"
                          />
                        </label>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-2">
                      {[
                        ["Require H2O", "requireWater"],
                        ["Require JWST context", "requireJwst"],
                        ["Studied systems only", "requireStudied"],
                        ["Interesting systems only", "requireInteresting"],
                      ].map(([label, key]) => (
                        <label key={String(key)} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                          <span className="text-sm text-slate-200/82">{label}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(advancedFilters[key as keyof AdvancedStageFilters])}
                            onChange={(event) => {
                              setAdvancedFilters((current) => ({
                                ...current,
                                [key]: event.target.checked,
                              }));
                            }}
                            className="h-4 w-4 rounded border-white/20 bg-slate-950/60 accent-cyan-300"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex w-full flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWhiteDwarfs((value) => !value)}
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      showWhiteDwarfs
                        ? "border-indigo-300/34 bg-indigo-300/12 text-indigo-50"
                        : "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                    }`}
                  >
                    {showWhiteDwarfs ? "Hide White Dwarfs" : "Show White Dwarfs"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancedFiltersOpen((value) => !value)}
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      advancedFiltersOpen
                        ? "border-cyan-300/34 bg-cyan-300/12 text-cyan-50"
                        : "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                    }`}
                  >
                    Advanced Filters
                  </button>
                </div>
              </div>
            </div>

            </div>

            <div
              className={`relative w-full overflow-hidden ${isFullscreen ? "min-h-0 flex-1" : "h-[620px]"}`}
              onPointerLeave={() => setStageHover(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setFreeRoam(true);
                setFollowLocked(false);
              }}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(129,226,255,0.10),transparent_0_20%,rgba(255,159,111,0.06)_34%,transparent_62%)]" />
              <Canvas
                camera={{ position: [0, DISPLAY_LOG_SCALE * 0.8, DISPLAY_LOG_SCALE * 8.8], fov: 48 }}
                gl={{ alpha: true, antialias: true }}
                onPointerMissed={() => setStageHover(null)}
                onCreated={({ gl }) => {
                  gl.toneMapping = THREE.ACESFilmicToneMapping;
                  gl.toneMappingExposure = 1.22;
                }}
              >
                <StageScene
                  systems={filteredSystems.length ? filteredSystems : snapshot.systems}
                  whiteDwarfs={snapshot.whiteDwarfs.anchors}
                  showWhiteDwarfs={showWhiteDwarfs}
                  selectedSystem={selectedSystem}
                  selectedWhiteDwarf={selectedWhiteDwarf}
                  selectedReferenceStar={selectedReferenceStar}
                  selectedPlanet={selectedPlanet}
                  selectedPlanetScience={selectedPlanetScience}
                  selectionCommand={selectionCommand}
                  planetViewSyncRef={planetViewSyncRef}
                  simulationDays={simulationDays}
                  orbitSpeedMultiplier={orbitSpeedMultiplier}
                  zoomFactor={zoomFactor}
                  followLocked={stageFollowLocked}
                  freeRoam={freeRoam}
                  onSelectSystem={(system) => {
                    setFocusKind("system");
                    setSelectedSystemId(system.id);
                    setSelectedPlanetId(null);
                    setSelectedDeepSkyName(null);
                    setSelectedWhiteDwarfId(null);
                    setSelectedReferenceStarName(null);
                    setFollowLocked(false);
                  }}
                  onSelectPlanet={(planet) => {
                    setFocusKind("planet");
                    setSelectedPlanetId(planet.id);
                    setSelectedDeepSkyName(null);
                    setSelectedWhiteDwarfId(null);
                    setSelectedReferenceStarName(null);
                  }}
                  onSelectDeepSky={(entry) => {
                    setFocusKind("deepSky");
                    setSelectedDeepSkyName(entry.name);
                    setSelectedWhiteDwarfId(null);
                    setSelectedReferenceStarName(null);
                    setSelectedPlanetId(null);
                    setFollowLocked(false);
                  }}
                  onSelectWhiteDwarf={(anchor) => {
                    setFocusKind("whiteDwarf");
                    setSelectedWhiteDwarfId(anchor.id);
                    setSelectedDeepSkyName(null);
                    setSelectedReferenceStarName(null);
                    setSelectedPlanetId(null);
                    setFollowLocked(false);
                  }}
                  onSelectReferenceStar={(star) => {
                    setFocusKind("referenceStar");
                    setSelectedReferenceStarName(star.name);
                    setSelectedDeepSkyName(null);
                    setSelectedWhiteDwarfId(null);
                    setSelectedPlanetId(null);
                    setFollowLocked(false);
                  }}
                  onHoverChange={setStageHover}
                />
              </Canvas>
              {stageHover ? (
                <div
                  className="pointer-events-none absolute z-20 max-w-[18rem] rounded-[1.1rem] border border-white/12 bg-slate-950/84 px-4 py-3 shadow-[0_18px_48px_rgba(2,8,24,0.55)] backdrop-blur-md"
                  style={{
                    left: `min(calc(100% - 18.5rem), ${Math.max(12, stageHover.x + 16)}px)`,
                    top: `${Math.max(12, stageHover.y - 18)}px`,
                    boxShadow: `0 18px 48px rgba(2,8,24,0.55), 0 0 0 1px ${hexToRgba(stageHover.accent, 0.18)}`,
                  }}
                >
                  <div className="text-[0.62rem] uppercase tracking-[0.24em]" style={{ color: stageHover.accent }}>
                    Stage Identifier
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{stageHover.title}</div>
                  <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-200/78">
                    {stageHover.lines.map((line) => (
                      <div key={`${stageHover.title}-${line}`}>{line}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/10 bg-slate-950/48 px-4 py-2 font-mono text-[0.68rem] uppercase tracking-[0.24em] text-slate-200/66 backdrop-blur-md">
                {freeRoam
                  ? "Free cam · drag, pan, zoom anywhere · double-click star/planet to fly"
                  : "Drag to orbit · wheel to zoom · right-click for free cam · click to set orbit point · double-click star/planet to fly"}
              </div>
              {isFullscreen ? (
                <>
                  <button
                    type="button"
                    onClick={() => setFsNavOpen((value) => !value)}
                    title={fsNavOpen ? "Hide plotter controls" : "Show plotter controls"}
                    className="absolute left-3 top-3 z-40 flex items-center gap-2 rounded-full border border-white/12 bg-slate-950/72 px-3 py-2 text-[0.6rem] uppercase tracking-[0.18em] text-slate-100 backdrop-blur-md transition hover:bg-white/[0.1]"
                  >
                    {fsNavOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                    Controls
                  </button>
                  <button
                    type="button"
                    onClick={() => setFsInfoOpen((value) => !value)}
                    title={fsInfoOpen ? "Hide information" : "Show information"}
                    className="absolute right-3 top-3 z-40 flex items-center gap-2 rounded-full border border-white/12 bg-slate-950/72 px-3 py-2 text-[0.6rem] uppercase tracking-[0.18em] text-slate-100 backdrop-blur-md transition hover:bg-white/[0.1]"
                  >
                    Info
                    {fsInfoOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                  </button>
                </>
              ) : null}
              <div className="absolute bottom-4 right-4 z-20 flex w-[5.5rem] flex-col items-center gap-2 rounded-[1.05rem] border border-white/10 bg-slate-950/58 px-2 py-2 shadow-[0_18px_48px_rgba(2,8,24,0.48)] backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setIsFullscreen((value) => !value)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[0.54rem] uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/[0.1]"
                >
                  {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                  {isFullscreen ? "Exit" : "Full"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (freeRoam) {
                      setFreeRoam(false);
                    }
                    setFollowLocked((value) => !value);
                  }}
                  disabled={!canFollowSelectedPlanet}
                  className={`w-full rounded-full border px-2 py-1.5 text-[0.54rem] uppercase tracking-[0.18em] transition ${
                    canFollowSelectedPlanet
                      ? (stageFollowLocked ? "border-sky-300/34 bg-sky-300/12 text-sky-50" : "border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.1]")
                      : "cursor-not-allowed border-white/8 bg-white/[0.02] text-slate-500"
                  }`}
                >
                  {stageFollowLocked ? "Unlock" : "Follow"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFreeRoam((value) => {
                      const next = !value;
                      if (next) {
                        setFollowLocked(false);
                      }
                      return next;
                    });
                  }}
                  className={`w-full rounded-full border px-2 py-1.5 text-[0.54rem] uppercase tracking-[0.18em] transition ${
                    freeRoam
                      ? "border-cyan-300/36 bg-cyan-300/14 text-cyan-50"
                      : "border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.1]"
                  }`}
                >
                  {freeRoam ? "Free Cam On" : "Free Cam"}
                </button>
                <div className="text-[0.54rem] uppercase tracking-[0.2em] text-slate-300/62">Zoom</div>
                <div className="text-[0.68rem] font-medium text-white">{zoomFactor.toFixed(2)}x</div>
                <input
                  type="range"
                  min={0.35}
                  max={2.4}
                  step={0.01}
                  value={zoomFactor}
                  onChange={(event) => setZoomFactor(Number(event.target.value))}
                  aria-label="Stage zoom"
                  className="mx-auto h-16 w-3 cursor-pointer appearance-none rounded-full bg-white/8 accent-cyan-300 [writing-mode:vertical-lr]"
                  style={{ direction: "rtl" }}
                />
                <div className="text-[0.54rem] uppercase tracking-[0.2em] text-slate-300/62">Orbit</div>
                <div className="text-[0.68rem] font-medium text-white">{orbitSpeedLabel}</div>
                <input
                  type="range"
                  min={0.1}
                  max={6}
                  step={0.1}
                  value={orbitSpeedMultiplier}
                  onChange={(event) => setOrbitSpeedMultiplier(Number(event.target.value))}
                  aria-label="Orbit speed"
                  className="mx-auto h-20 w-3 cursor-pointer appearance-none rounded-full bg-white/8 accent-sky-300 [writing-mode:vertical-lr]"
                  style={{ direction: "rtl" }}
                />
                <button
                  type="button"
                  onClick={jumpHome}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[0.54rem] uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/[0.1]"
                >
                  <House className="h-3 w-3" />
                  Home
                </button>
              </div>
            </div>

            <div className={`space-y-4 border-t border-white/8 px-5 py-5 ${isFullscreen ? "hidden" : ""}`}>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/30 p-4">
                  <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">Chart Fix Report</div>
                  <h3 className="mt-2 text-xl font-semibold text-white">{activeTitle}</h3>
                  {activeStatus ? (
                    <div className="mt-2 text-[0.66rem] uppercase tracking-[0.22em] text-sky-100/48">
                      {activeStatus}
                    </div>
                  ) : null}
                  {activeBasis ? (
                    <div className="mt-2 text-xs leading-5 text-slate-400/78">
                      Basis: {activeBasis}
                      {activeSourceNote ? ` · ${activeSourceNote}` : ""}
                    </div>
                  ) : null}
                  <p className="mt-2 text-sm leading-6 text-slate-300/74">
                    {activeSynopsis}
                  </p>
                  {activeFocusKind === "planet" || activeFocusKind === "system" ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">XYZ from Sun</div>
                        <div className="mt-1 text-sm text-white">
                          {selectedSystem ? `${formatSigned(selectedSystem.cartesianPc.x, 2)}, ${formatSigned(selectedSystem.cartesianPc.y, 2)}, ${formatSigned(selectedSystem.cartesianPc.z, 2)} pc` : "Unresolved"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Host star</div>
                        <div className="mt-1 text-sm text-white">{selectedSystem?.name ?? "Unresolved"} · {selectedSystem?.stellar.spectralType ?? "Unknown"}</div>
                        <div className="mt-1 text-xs text-slate-300/68">
                          {selectedSystem?.stellar.radiusSolar
                            ? `R ${formatNumber(selectedSystem.stellar.radiusSolar, 2)} R☉`
                            : "R unresolved"}
                          {selectedSystem && (selectedSystem.stellar.photometry.jMag !== null || selectedSystem.stellar.photometry.kMag !== null)
                            ? ` · J/K ${formatNumber(selectedSystem.stellar.photometry.jMag, 2)} / ${formatNumber(selectedSystem.stellar.photometry.kMag, 2)}`
                            : ""}
                        </div>
                        <div className="mt-1 text-[0.68rem] uppercase tracking-[0.16em] text-slate-400/60">Source: Archive host row</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Active target</div>
                        <div className="mt-1 text-sm text-white">{activeFocusKind === "planet" ? "Planet detail" : "System overview"}</div>
                        {selectedPlanet ? (
                          <div className="mt-1 text-xs text-slate-300/68">
                            {compactPlanetFluxTemp(selectedSystem!, selectedPlanet, selectedPlanetScience) || compactPlanetMassRadius(selectedPlanet, selectedPlanetScience) || "Science summary unresolved"}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-slate-300/68">
                            {selectedSystem ? `${selectedSystem.planetCount} planets · ${selectedSystem.stellar.effectiveTemperatureK ? `${formatNumber(selectedSystem.stellar.effectiveTemperatureK, 0)} K host` : "host temperature unresolved"}` : "System summary unresolved"}
                          </div>
                        )}
                        <div className="mt-1 text-[0.68rem] uppercase tracking-[0.16em] text-slate-400/60">
                          Source: {activeBasis}
                        </div>
                        {mergedLocalAnalysis(selectedSystem!, selectedPlanet, selectedPlanetScience)?.interestingReason ? (
                          <div className="mt-1 text-xs text-sky-100/62">{mergedLocalAnalysis(selectedSystem!, selectedPlanet, selectedPlanetScience)?.interestingReason}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : activeFocusKind === "deepSky" && selectedDeepSky ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">XYZ from Sun</div>
                        <div className="mt-1 text-sm text-white">{formatCartesian(equatorialToCartesianPc(selectedDeepSky.raDeg, selectedDeepSky.decDeg, selectedDeepSky.distancePc))}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Object class</div>
                        <div className="mt-1 text-sm text-white">{deepSkyKindLabel(selectedDeepSky.kind)}</div>
                        <div className="mt-1 text-xs text-slate-300/68">{formatNumber(distanceLy(selectedDeepSky.distancePc), 0)} ly · {formatNumber(selectedDeepSky.sizePc * 3.26156, 1)} ly size proxy</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Active target</div>
                        <div className="mt-1 text-sm text-white">{selectedDeepSky.kind === "pulsar" ? "Timing target" : "Scene anchor"}</div>
                        <div className="mt-1 text-xs text-slate-300/68">
                          {selectedDeepSky.pulsePeriodSeconds ? `${formatNumber(selectedDeepSky.pulsePeriodSeconds * 1000, 2)} ms pulse` : `${formatNumber(deepSkyAngularSizeArcmin(selectedDeepSky), 1)} arcmin apparent size`}
                        </div>
                      </div>
                    </div>
                  ) : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">XYZ from Sun</div>
                        <div className="mt-1 text-sm text-white">{formatCartesian(selectedWhiteDwarf.cartesianPc)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">White dwarf</div>
                        <div className="mt-1 text-sm text-white">{selectedWhiteDwarf.spectralType ?? "Unknown"} · {selectedWhiteDwarf.effectiveTemperatureK ? `${formatNumber(selectedWhiteDwarf.effectiveTemperatureK, 0)} K` : "Teff unresolved"}</div>
                        <div className="mt-1 text-xs text-slate-300/68">{selectedWhiteDwarf.massSolar ? `${formatNumber(selectedWhiteDwarf.massSolar, 2)} M☉` : "mass unresolved"} · {selectedWhiteDwarf.radiusSolar ? `${formatNumber(selectedWhiteDwarf.radiusSolar, 4)} R☉` : "radius unresolved"}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Active target</div>
                        <div className="mt-1 text-sm text-white">Degenerate-star lab</div>
                        <div className="mt-1 text-xs text-slate-300/68">{selectedWhiteDwarf.gravitationalRedshiftKmS ? `${formatNumber(selectedWhiteDwarf.gravitationalRedshiftKmS, 1)} km/s v_GR proxy` : "v_GR unresolved"}</div>
                      </div>
                    </div>
                  ) : activeFocusKind === "referenceStar" && selectedReferenceStar ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">XYZ from Sun</div>
                        <div className="mt-1 text-sm text-white">{formatCartesian(equatorialToCartesianPc(selectedReferenceStar.raDeg, selectedReferenceStar.decDeg, selectedReferenceStar.distancePc))}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Reference star</div>
                        <div className="mt-1 text-sm text-white">{selectedReferenceStar.spectralType} · {formatNumber(selectedReferenceStar.effectiveTemperatureK, 0)} K</div>
                        <div className="mt-1 text-xs text-slate-300/68">{formatNumber(selectedReferenceStar.radiusSolar, 2)} R☉ · {formatNumber(selectedReferenceStar.luminositySolar, 2)} L☉</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Active target</div>
                        <div className="mt-1 text-sm text-white">Field-star anchor</div>
                        <div className="mt-1 text-xs text-slate-300/68">{formatNumber(distanceLy(selectedReferenceStar.distancePc), 1)} ly from the Sun</div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/30 p-4">
                  <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">{contextPanelTitle}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeFocusKind === "planet" || activeFocusKind === "system" ? (
                      selectedSystem?.planets.length ? (
                      selectedSystem.planets.map((planet) => (
                        <button
                          key={planet.id}
                          type="button"
                          onClick={() => {
                            setFocusKind("planet");
                            setSelectedPlanetId(planet.id);
                          }}
                          className={`rounded-2xl border px-3 py-2 text-left transition ${selectedPlanet?.id === planet.id ? "border-sky-300/34 bg-sky-300/12 text-sky-50" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/18 hover:bg-white/[0.06]"}`}
                        >
                          <div className="text-xs uppercase tracking-[0.18em]">{planet.name}</div>
                          <div className="mt-1 text-[0.68rem] leading-4 text-slate-300/70">
                            {compactPlanetFluxTemp(selectedSystem!, planet, selectedPlanet?.id === planet.id ? selectedPlanetScience : null)
                              || compactPlanetMassRadius(planet, selectedPlanet?.id === planet.id ? selectedPlanetScience : null)
                              || "Science summary unresolved"}
                          </div>
                          <div className="mt-1 text-[0.6rem] uppercase tracking-[0.16em] text-slate-400/58">
                            {compactSourceBadges(selectedSystem!, planet, selectedPlanet?.id === planet.id ? selectedPlanetScience : null)}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-slate-400">No planets in the current filtered selection.</div>
                    )) : activeFocusKind === "deepSky" && selectedDeepSky ? (
                      <>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-slate-300">
                          <div className="text-xs uppercase tracking-[0.18em]">Coordinates</div>
                          <div className="mt-1 text-[0.68rem] leading-4 text-slate-300/70">{formatNumber(selectedDeepSky.raDeg, 2)}° / {formatSigned(selectedDeepSky.decDeg, 2)}°</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-slate-300">
                          <div className="text-xs uppercase tracking-[0.18em]">Scene basis</div>
                          <div className="mt-1 text-[0.68rem] leading-4 text-slate-300/70">Display-compressed distance · catalog direction retained</div>
                        </div>
                      </>
                    ) : activeFocusKind === "whiteDwarf" && selectedWhiteDwarf ? (
                      <>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-slate-300">
                          <div className="text-xs uppercase tracking-[0.18em]">Tags</div>
                          <div className="mt-1 text-[0.68rem] leading-4 text-slate-300/70">{selectedWhiteDwarf.tags.join(" · ") || "none"}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-slate-300">
                          <div className="text-xs uppercase tracking-[0.18em]">Distance</div>
                          <div className="mt-1 text-[0.68rem] leading-4 text-slate-300/70">{formatNumber(distanceLy(selectedWhiteDwarf.distancePc), 1)} ly</div>
                        </div>
                      </>
                    ) : activeFocusKind === "referenceStar" && selectedReferenceStar ? (
                      <>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-slate-300">
                          <div className="text-xs uppercase tracking-[0.18em]">Distance</div>
                          <div className="mt-1 text-[0.68rem] leading-4 text-slate-300/70">{formatNumber(distanceLy(selectedReferenceStar.distancePc), 1)} ly</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-slate-300">
                          <div className="text-xs uppercase tracking-[0.18em]">Morphology anchor</div>
                          <div className="mt-1 text-[0.68rem] leading-4 text-slate-300/70">{spectralBucket(selectedReferenceStar.spectralType)}-class color/size reference</div>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-400">No active object in focus.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.7rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">{analysisTitle}</div>
                    <h3 className="mt-2 text-xl font-semibold text-white">{analysisSubtitle}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => downloadTextFile(`${exportBaseName}.txt`, exportTxt)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/[0.1]"
                    >
                      TXT
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTextFile(`${exportBaseName}.json`, exportJson, "application/json;charset=utf-8")}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/[0.1]"
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTextFile(`${exportBaseName}.csv`, exportCsv, "text/csv;charset=utf-8")}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/[0.1]"
                    >
                      CSV
                    </button>
                  </div>
                </div>
                <pre className="mt-5 whitespace-pre-wrap break-words rounded-[1.5rem] border border-white/8 bg-slate-950/42 p-5 font-mono text-[0.84rem] leading-7 text-slate-200/82">{analysis}</pre>
              </div>
            </div>
          </div>
        </div>

        <aside
          className={
            isFullscreen
              ? `absolute inset-y-0 right-0 z-30 w-[26rem] max-w-[92vw] space-y-4 overflow-y-auto border-l border-white/10 bg-[#030a18]/94 p-4 pt-16 backdrop-blur-xl transition-transform duration-300 ${fsInfoOpen ? "translate-x-0" : "translate-x-full"}`
              : "space-y-4"
          }
        >
          {selectedDeepSky ? (
            <DeepSkyVisualFocus entry={selectedDeepSky} />
          ) : selectedWhiteDwarf ? (
            <WhiteDwarfVisualFocus anchor={selectedWhiteDwarf} />
          ) : selectedReferenceStar ? (
            <ReferenceStarVisualFocus star={selectedReferenceStar} />
          ) : selectedSystem ? (
            <VisualFocus
              key={`${selectedSystem.id}:${selectedPlanet?.id ?? "system"}`}
              system={selectedSystem}
              planet={selectedPlanet}
              science={selectedPlanetScience}
              showMagnetosphere={showMagnetosphere}
              onToggleMagnetosphere={() => setShowMagnetosphere((value) => !value)}
              planetViewSyncRef={planetViewSyncRef}
            />
          ) : null}

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">
              <Database className="h-3.5 w-3.5" /> {observedTitle}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {observedMetrics.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">
              <Orbit className="h-3.5 w-3.5" /> {derivedTitle}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {derivedMetrics.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">{uncertaintyTitle}</div>
            <div className="mt-4 grid gap-3">
              {uncertaintyMetrics.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">{planningTitle}</div>
            <p className="mt-3 text-sm leading-7 text-slate-200/82">{activeObservationPlan}</p>
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">Provenance & Citations</div>
            {sources.length ? (
              <div className="mt-4 space-y-3">
                {sources.map((source) => (
                  <a
                    key={`${source.url}-${source.name}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-[1.2rem] border border-white/10 bg-slate-950/30 p-4 transition hover:border-sky-300/24 hover:bg-slate-950/46"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-white">{source.name}</span>
                      <span className={`rounded-full border px-2 py-1 text-[0.64rem] uppercase tracking-[0.18em] ${source.cache === "hit" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50" : "border-amber-300/20 bg-amber-300/10 text-amber-50"}`}>
                        {source.cache}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-300/70">{source.kind} · fetched <time dateTime={source.accessedAt} suppressHydrationWarning>{new Date(source.accessedAt).toLocaleString()}</time></p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-7 text-slate-300/72">No external provenance records are attached to this object layer yet.</p>
            )}
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">
              <ChartColumn className="h-3.5 w-3.5" /> {chartTitle}
            </div>
            <div className="mt-4 space-y-4">
              {chartRows.map((row) => (
                <div key={row.label} className="rounded-[1.2rem] border border-white/8 bg-slate-950/26 p-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="text-sm font-medium text-white">{row.label}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.note}</div>
                  </div>
                  <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-white/[0.05]">
                    {row.intervalLow !== null && row.intervalLow !== undefined && row.intervalHigh !== null && row.intervalHigh !== undefined ? (
                      <div
                        className="absolute inset-y-0 rounded-full border border-white/16"
                        style={{
                          left: `${metricPosition(row.intervalLow, row.max)}%`,
                          width: `${Math.max(1, metricPosition(row.intervalHigh, row.max) - metricPosition(row.intervalLow, row.max))}%`,
                          background: `linear-gradient(90deg, hsla(${row.hue}, 90%, 60%, 0.15), hsla(${row.hue}, 95%, 70%, 0.3))`,
                          boxShadow: `0 0 10px hsla(${row.hue}, 95%, 70%, 0.16)`,
                        }}
                      />
                    ) : null}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${metricPercentage(row.value, row.max)}%`,
                        background: `linear-gradient(90deg, hsla(${row.hue}, 90%, 55%, 0.35), hsla(${row.hue}, 95%, 66%, 0.92))`,
                      }}
                    />
                    <div
                      className="absolute inset-y-[-1px] w-[2px] rounded-full bg-white/90"
                      style={{ left: `calc(${metricPosition(row.value, row.max)}% - 1px)` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {((activeFocusKind === "planet" || activeFocusKind === "system") && selectedSystem?.planets.length) ? (
              <div className="mt-5 rounded-[1.2rem] border border-white/8 bg-slate-950/26 p-4">
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">System orbit ladder</div>
                <div className="mt-4 space-y-3">
                  {selectedSystem.planets.slice(0, 6).map((planet) => (
                    <div key={`${planet.id}-orbit`}>
                      <div className="flex items-end justify-between gap-3 text-sm">
                        <span className="text-white">{planet.name}</span>
                        <span className="text-slate-400">{planet.semiMajorAxisAu ? `${formatNumber(planet.semiMajorAxisAu, 3)} AU` : "pending"}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400/35 to-sky-200"
                          style={{ width: `${metricPercentage(planet.semiMajorAxisAu ?? 0.03, 3)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
