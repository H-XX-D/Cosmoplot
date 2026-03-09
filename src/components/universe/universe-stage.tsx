"use client";

import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import {
  ChartColumn,
  Crosshair,
  Database,
  House,
  Orbit,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DISPLAY_LOG_SCALE, equatorialToCartesianPc, logScaledVector } from "@/lib/science/coordinates";
import {
  PlanetGlobe,
  materializePlanetReference,
  renderPlanetSurface,
  resolvePlanetCalibrationAsset,
  type PlanetGlobeProps,
  type PlanetRegime,
} from "@/components/ui/planet-globe";
import { clamp, hsla, lerp } from "@/lib/utils";
import type { PlanetScienceBundle, UniversePlanet, UniverseSnapshot, UniverseSystem, WhiteDwarfAnchor } from "@/lib/science/types";

type MetricKind = "observed" | "inferred" | "derived" | "source";

type Metric = {
  label: string;
  value: string;
  note: string;
  kind: MetricKind;
};

type ChartRow = {
  label: string;
  value: number;
  max: number;
  note: string;
  hue: number;
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

type DeepSkyKind = "emission" | "dark" | "molecular" | "planetary" | "supernova";

type DeepSkyObject = {
  name: string;
  kind: DeepSkyKind;
  raDeg: number;
  decDeg: number;
  distancePc: number;
  sizePc: number;
  tint: string;
  accent: string;
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
};

type StageHover = {
  x: number;
  y: number;
  accent: string;
  title: string;
  lines: string[];
};

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
};

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

const STAR_FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;

  uniform float uTime;
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
    mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = rot * p * 1.95;
      amplitude *= 0.52;
    }
    return value;
  }

  vec3 blendMultiply(vec3 base, vec3 blend) {
    return base * blend;
  }

  vec3 blendColorDodge(vec3 base, vec3 blend) {
    return min(base / max(vec3(0.001), vec3(1.0) - blend), vec3(1.4));
  }

  vec3 blendColorBurn(vec3 base, vec3 blend) {
    return max(vec3(0.0), vec3(1.0) - ((vec3(1.0) - base) / max(vec3(0.001), blend)));
  }

  vec3 blendSubtract(vec3 base, vec3 blend) {
    return max(base - blend, vec3(0.0));
  }

  void main() {
    vec2 centeredUv = vUv - 0.5;
    float radius = length(centeredUv) * 2.0;
    vec2 flow = vec2(
      fbm(vUv * 31.0 + vec2(uTime * 0.15, -uTime * 0.1)),
      fbm(vUv * 46.0 + vec2(-uTime * 0.08, uTime * 0.11))
    );
    float convection = fbm(vUv * 24.0 + flow * 1.6 + vec2(uTime * 0.09, -uTime * 0.05));
    float granulation = fbm(vUv * 88.0 + flow * 3.4 + uTime * 0.26);
    float mottling = fbm(vUv * 39.0 - flow * 2.4 - uTime * 0.09);
    float subGranulation = fbm(vUv * 142.0 + flow * 4.8 + vec2(uTime * 0.31, -uTime * 0.2));
    float plasmaVeins = fbm(vUv * 182.0 + flow * 5.9 - vec2(uTime * 0.21, uTime * 0.13));
    float emberCells = fbm(vUv * 226.0 + flow * 7.4 + vec2(uTime * 0.36, uTime * 0.16));
    float ridgeField = pow(abs(fbm(vUv * 104.0 - flow * 3.8 + vec2(uTime * 0.14, -uTime * 0.09)) - 0.5) * 2.0, 1.34);
    float faculae = smoothstep(0.52, 0.86, fbm(vUv * 64.0 + flow * 2.7 + vec2(uTime * 0.11, -uTime * 0.06)));
    float spotField = fbm(vUv * 18.0 - uTime * 0.05 + flow * 1.1);
    float spotMask = smoothstep(0.62, 0.92, spotField);
    spotMask *= smoothstep(1.02, 0.28, radius);
    float spotClusters = smoothstep(0.58, 0.9, fbm(vUv * 33.0 + flow * 1.9 + vec2(uTime * 0.04, -uTime * 0.03)));
    float spotPits = smoothstep(0.72, 0.96, fbm(vUv * 118.0 + flow * 2.6));
    float hotVein = fbm(vUv * 116.0 + flow * 4.1 + vec2(uTime * 0.22, -uTime * 0.17));
    float shadowWeb = fbm(vUv * 60.0 - flow * 3.0 - vec2(uTime * 0.1, uTime * 0.05));
    float orangeCells = smoothstep(0.46, 0.9, fbm(vUv * 76.0 + flow * 3.6 + vec2(uTime * 0.18, -uTime * 0.12)));
    float spotRidges = smoothstep(0.54, 0.88, fbm(vUv * 94.0 - flow * 2.2 + vec2(-uTime * 0.08, uTime * 0.04)));
    float charWeb = smoothstep(0.56, 0.92, fbm(vUv * 154.0 - flow * 6.4 - vec2(uTime * 0.16, -uTime * 0.11)));
    float orangeArcs = smoothstep(0.52, 0.9, fbm(vUv * 128.0 + flow * 4.6 + vec2(uTime * 0.2, uTime * 0.08)));
    float blackPits = smoothstep(0.72, 0.98, fbm(vUv * 212.0 - flow * 7.0 + vec2(-uTime * 0.18, uTime * 0.12)));

    float facing = clamp(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    float limb = pow(1.0 - facing, 1.62);
    float centerHotspot = pow(max(0.0, 1.0 - radius), 4.4);
    float faculaMask = faculae * (0.28 + limb * 0.92);
    float umbra = spotMask * (0.6 + spotPits * 0.42 + spotRidges * 0.14);
    float penumbra = spotClusters * 0.24 + umbra * 0.28;
    vec3 hotCore = mix(uCoreColor, vec3(1.0, 0.985, 0.9), 0.7);
    vec3 warmCore = mix(uCoreColor, vec3(1.0, 0.86, 0.5), 0.48);
    vec3 flareCore = mix(uCoreColor, vec3(1.0, 0.94, 0.74), 0.62);
    vec3 orangeBurn = mix(uRimColor, vec3(1.0, 0.56, 0.22), 0.72);
    vec3 emberOrange = mix(vec3(1.0, 0.66, 0.26), vec3(0.95, 0.42, 0.12), ridgeField * 0.5);

    vec3 color = mix(uCoreColor, uRimColor, clamp(limb * 0.94 + (1.0 - convection) * 0.1, 0.0, 1.0));
    color *= 0.82 + convection * 0.16 + granulation * 0.28 + subGranulation * 0.26 + emberCells * 0.2;
    color *= 1.0 - umbra * (0.66 + mottling * 0.4) - penumbra * 0.22;
    color = mix(color, blendMultiply(color, vec3(0.8, 0.68, 0.54) - shadowWeb * 0.22 - ridgeField * 0.08), 0.58);
    color = mix(color, blendSubtract(color, vec3(shadowWeb * 0.18 + charWeb * 0.22 + blackPits * 0.2)), 0.46);
    color = mix(color, blendColorBurn(color, vec3(0.8 - shadowWeb * 0.38 - spotClusters * 0.18 - spotPits * 0.1 - blackPits * 0.12)), 0.54 + umbra * 0.3);
    color = mix(color, blendColorDodge(color, vec3(hotVein * 0.5 + plasmaVeins * 0.42 + granulation * 0.24 + emberCells * 0.28)), 0.66);
    color = mix(color, blendColorBurn(color, vec3(0.88 - shadowWeb * 0.16 - ridgeField * 0.08 - charWeb * 0.06)), 0.22 + mottling * 0.14);
    color = mix(color, blendColorDodge(color, vec3(subGranulation * 0.34 + hotVein * 0.26 + ridgeField * 0.14 + faculaMask * 0.34)), 0.46 + granulation * 0.12);
    color = mix(color, blendColorBurn(color, orangeBurn), orangeCells * 0.12 + orangeArcs * 0.08 + ridgeField * 0.08);
    color = mix(color, blendColorDodge(color, emberOrange), orangeCells * 0.34 + orangeArcs * 0.18 + faculaMask * 0.18 + emberCells * 0.12);
    color = mix(color, blendColorDodge(color, hotCore), 0.58 * centerHotspot);
    color = mix(color, blendColorDodge(color, warmCore), 0.34 * centerHotspot + 0.16 * hotVein + faculaMask * 0.16);
    color = mix(color, blendColorDodge(color, flareCore), faculaMask * 0.34 + plasmaVeins * 0.12);
    color = mix(color, blendColorBurn(color, vec3(0.78 - limb * 0.26 - shadowWeb * 0.12)), 0.34 + limb * 0.26);
    color *= 1.16 + ridgeField * 0.16 + faculaMask * 0.12;
    color += hotCore * centerHotspot * 0.2 + warmCore * faculaMask * 0.14 + flareCore * plasmaVeins * 0.08 + emberOrange * orangeCells * 0.12;

    float glow = pow(max(0.0, 1.0 - abs(vUv.y - 0.5) * 4.8), 3.0) * 0.04 * (0.55 + 0.45 * sin(uTime * 1.8));
    gl_FragColor = vec4(color + glow, 1.0);
  }
`;

const DISTANT_STAR_FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;

  uniform float uTime;
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
    float granulation = noise(vUv * 18.0 + vec2(uTime * 0.08, -uTime * 0.05));
    float pits = smoothstep(0.58, 0.88, noise(vUv * 12.0 + vec2(7.2 + uTime * 0.03, -uTime * 0.02)));
    float sparkle = noise(vUv * 34.0 + vec2(13.4 - uTime * 0.09, uTime * 0.05));
    float ember = smoothstep(0.5, 0.9, noise(vUv * 26.0 + vec2(17.6 + uTime * 0.06, -uTime * 0.03)));
    float shadow = smoothstep(0.54, 0.9, noise(vUv * 44.0 + vec2(9.8 - uTime * 0.04, uTime * 0.02)));
    float orangeVeins = smoothstep(0.52, 0.92, noise(vUv * 58.0 + vec2(4.6 + uTime * 0.05, uTime * 0.03)));
    float facing = clamp(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    float limb = pow(1.0 - facing, 1.5);
    float coreHotspot = pow(max(0.0, 1.0 - distance(vUv, vec2(0.5)) * 2.0), 4.2);
    vec3 emberTone = mix(vec3(1.0, 0.66, 0.24), vec3(0.94, 0.4, 0.12), pits * 0.4);
    vec3 burnTone = mix(uRimColor, vec3(1.0, 0.5, 0.18), 0.38);
    float pulse = 0.92 + 0.08 * sin(uTime * 2.2 + vUv.x * 18.0 + vUv.y * 11.0);

    vec3 color = mix(uCoreColor, uRimColor, clamp(limb * 0.96 + (1.0 - granulation) * 0.08, 0.0, 1.0));
    color *= 0.8 + granulation * 0.2;
    color = mix(color, blendMultiply(color, vec3(0.74, 0.58, 0.42)), 0.38);
    color = mix(color, blendSubtract(color, vec3(pits * 0.16 + shadow * 0.12)), 0.36);
    color = mix(color, blendColorBurn(color, burnTone), ember * 0.1 + pits * 0.08);
    color = mix(color, blendColorDodge(color, vec3(0.34 + granulation * 0.38 + pits * 0.24)), 0.82);
    color = mix(color, blendColorDodge(color, vec3(0.22 + (1.0 - limb) * 0.22 + sparkle * 0.12)), 0.44);
    color = mix(color, blendColorDodge(color, emberTone), ember * 0.32 + orangeVeins * 0.12);
    color *= 1.0 - pits * 0.24;
    color = mix(color, blendColorDodge(color, vec3(coreHotspot * 0.46 + sparkle * 0.12)), 0.64);
    color += uCoreColor * coreHotspot * 0.28;
    color *= (1.08 - limb * 0.03) * pulse;

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
    float shell = smoothstep(0.18, 0.96, radius) * (1.0 - smoothstep(0.84, 1.2, radius));
    float alpha = fresnel * (0.22 + flicker * 0.14 + plume * 0.1) + rayField * 0.24 * shell;
    vec3 coronaColor = mix(uColor, vec3(1.0, 0.84, 0.58), 0.28 + rayField * 0.22);
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

  if (entry.kind === "dark" || entry.kind === "molecular") {
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
  luminositySolar,
  radiusSolar,
}: {
  seedKey: string;
  spectralType: string | null;
  luminositySolar: number | null;
  radiusSolar: number | null;
}): StarRenderStyle {
  const bucket = spectralBucket(spectralType);
  const luminosity = clamp(Math.log10(1 + Math.max(luminositySolar ?? 0.1, 0.1)), 0, 1.5);
  const radius = Math.max(radiusSolar ?? 1, 0.25);
  const variation = hashUnit(seedKey);

  const paletteByBucket: Record<string, Pick<StarRenderStyle, "core" | "rim" | "corona" | "halo">> = {
    O: { core: "#eef7ff", rim: "#5f99ff", corona: "#8fc0ff", halo: "#edf7ff" },
    B: { core: "#f5fbff", rim: "#7eaeff", corona: "#b4d4ff", halo: "#f4f9ff" },
    A: { core: "#f7fbff", rim: "#a9cbff", corona: "#d8e9ff", halo: "#fbfdff" },
    F: { core: "#fff8e9", rim: "#f2dfbf", corona: "#fff3d8", halo: "#fff7e8" },
    G: { core: "#fff4cf", rim: "#ffc879", corona: "#ffe0a8", halo: "#fff0c8" },
    K: { core: "#ffe5c6", rim: "#ffab67", corona: "#ffd0a2", halo: "#ffe7ca" },
    M: { core: "#ffd2bd", rim: "#ff7655", corona: "#ffad85", halo: "#ffd6c4" },
    Other: { core: "#fff0c6", rim: "#ffbb76", corona: "#ffdaab", halo: "#fff0cf" },
    Unspecified: { core: "#fff0c6", rim: "#ffbb76", corona: "#ffdaab", halo: "#fff0cf" },
  };

  const palette = paletteByBucket[bucket] ?? paletteByBucket.Other;
  const hotStarBoost = bucket === "O" || bucket === "B" || bucket === "A";
  const sizeLift = clamp(0.92 + luminosity * 0.18 + Math.sqrt(radius) * 0.08 + variation * 0.06, 0.86, 1.42);

  return {
    ...palette,
    radiusScale: sizeLift,
    glowScale: clamp(1.55 + luminosity * 0.38 + variation * 0.16 + (hotStarBoost ? 0.18 : 0), 1.45, 2.3),
    glowOpacity: clamp(0.1 + luminosity * 0.09 + variation * 0.04 + (hotStarBoost ? 0.05 : 0), 0.1, 0.32),
  };
}

function stellarStyle(system: UniverseSystem): StarRenderStyle {
  return stellarStyleFromData({
    seedKey: system.id,
    spectralType: system.stellar.spectralType,
    luminositySolar: stellarLuminosity(system),
    radiusSolar: system.stellar.radiusSolar,
  });
}

function whiteDwarfStyle(anchor: WhiteDwarfAnchor): StarRenderStyle {
  const base = stellarStyleFromData({
    seedKey: anchor.id,
    spectralType: anchor.spectralType ?? "A",
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
    glowOpacity: 0.16,
  };
}

function stellarColor(teff: number | null, spectralType: string | null = null) {
  const bucket = spectralBucket(spectralType);
  if (bucket === "O") return "#6ea9ff";
  if (bucket === "B") return "#a9cbff";
  if (bucket === "A") return "#f7fbff";
  if (bucket === "F") return "#fff2d2";
  if (bucket === "G") return "#ffd88f";
  if (bucket === "K") return "#ffb16f";
  if (bucket === "M") return "#ff845e";
  if (!teff) return "#ffd18a";
  if (teff >= 9000) return "#a8c2ff";
  if (teff >= 7500) return "#d7e3ff";
  if (teff >= 6000) return "#ffe9bc";
  if (teff >= 5000) return "#ffc88f";
  return "#ff946f";
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
  return clamp(0.3 + Math.sqrt(radius) * 0.05 + luminosity * 0.04, 0.3, 0.46);
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

function formatSigned(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unknown";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
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

function systemMatchesAdvancedFilters(system: UniverseSystem, filters: AdvancedStageFilters) {
  const studied = Boolean(system.localAnalysis?.studied || system.planets.some((planet) => planet.localAnalysis?.studied));
  const interesting = Boolean(system.localAnalysis?.interesting || system.planets.some((planet) => planet.localAnalysis?.interesting));

  if (filters.requireStudied && !studied) return false;
  if (filters.requireInteresting && !interesting) return false;
  if (filters.requireWater && !system.planets.some((planet) => hasWaterEvidence(planet))) return false;
  if (filters.requireJwst && !system.planets.some((planet) => hasJwstEvidence(planet, system))) return false;

  return system.planets.some((planet) => {
    const flux = insolationEarth(system, planet);
    const gravity = surfaceGravityMs2(planet);
    return (
      matchesNumericRange(flux, filters.minFlux, filters.maxFlux, DEFAULT_ADVANCED_STAGE_FILTERS.minFlux, DEFAULT_ADVANCED_STAGE_FILTERS.maxFlux) &&
      matchesNumericRange(planet.equilibriumK, filters.minTemp, filters.maxTemp, DEFAULT_ADVANCED_STAGE_FILTERS.minTemp, DEFAULT_ADVANCED_STAGE_FILTERS.maxTemp) &&
      matchesNumericRange(gravity, filters.minGravity, filters.maxGravity, DEFAULT_ADVANCED_STAGE_FILTERS.minGravity, DEFAULT_ADVANCED_STAGE_FILTERS.maxGravity) &&
      matchesNumericRange(planet.radiusEarth, filters.minRadius, filters.maxRadius, DEFAULT_ADVANCED_STAGE_FILTERS.minRadius, DEFAULT_ADVANCED_STAGE_FILTERS.maxRadius)
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
  const signal = science?.propagation.oneScaleHeightSignalPpm.median ?? null;
  const cloudFraction = science?.atmosphere.cloudCoverFraction ?? null;
  const dayside = science?.temperatures.daysideK ?? planet.equilibriumK ?? null;

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
      mode: signal !== null && signal > 60 ? "NIRSpec G395H BOTS" : "NIRSpec Prism BOTS",
      readiness:
        jMag === null
          ? "caution"
          : jMag < 7
            ? "caution"
            : "ready",
      rationale:
        signal !== null && signal > 60
          ? `Propagated one-scale-height signal near ${formatNumber(signal, 0)} ppm supports higher-resolution 2.9-5.2 um follow-up if brightness checks pass.`
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
  const magnetic = science?.magnetosphere.surfaceFieldMicroTesla;
  const protection = science?.magnetosphere.protection;
  const dayside = science?.temperatures.daysideK;
  const chemistry = chemistrySummary(science);
  const coverage = wavelengthCoverageText(science);
  const jwstObservationCount = science?.spectrum.jwstObservations.length ?? 0;
  const jwstProductCount = science?.spectrum.jwstProducts.length ?? 0;
  const cloudFraction = science?.atmosphere.cloudCoverFraction;
  return `${planet.name} is modeled here as a ${planetClass(planet)} in the ${system.name} system. Official archive radius and mass place it in a ${density ? `${formatNumber(density, 2)} g/cm³ bulk-density` : "density-unresolved"} regime, while the host star and semi-major axis imply ${insolation ? `${formatNumber(insolation, 2)} S⊕ incident flux` : "an unresolved irradiation field"}. The current temperature regime is ${temperatureClass(planet.equilibriumK)}${dayside ? ` with a dayside estimate near ${formatNumber(dayside, 0)} K` : ""}${orbitVelocity ? ` and an orbital velocity near ${formatNumber(orbitVelocity, 1)} km/s` : ""}${magnetic ? `; the current magnetic proxy is ${formatNumber(magnetic, 1)} microT with ${protection} shielding.` : ""}${science ? ` JWST/MAST currently contributes ${jwstObservationCount} observation${jwstObservationCount === 1 ? "" : "s"} and ${jwstProductCount} product${jwstProductCount === 1 ? "" : "s"}${coverage ? ` across ${coverage}` : ""}. ${chemistry ? `Atmosphere evidence presently favors ${chemistry}. ` : ""}${science.atmosphere.cloudInterpretation}${cloudFraction !== null && cloudFraction !== undefined ? ` Cloud proxy: ${formatNumber(cloudFraction * 100, 0)}%.` : ""}` : ""}${local?.habitability ? ` Local analysis assessment: ${local.habitability}.` : local?.interestingReason ? ` Local analysis flag: ${local.interestingReason}.` : ""}`;
}

function buildObservedMetrics(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null): Metric[] {
  const local = mergedLocalAnalysis(system, planet, science);
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
          }]
        : []),
    ];
  }

  return [
    ...shared,
    {
      label: "Planet Radius",
      value: planet.radiusEarth ? `${formatNumber(planet.radiusEarth, 2)} R⊕` : "Unknown",
      note: "Observed planetary radius from the archive row.",
      kind: "observed",
    },
    {
      label: "Planet Mass",
      value: planet.massEarth ? `${formatNumber(planet.massEarth, 2)} M⊕` : "Unknown",
      note: "Observed planetary mass from the archive row.",
      kind: "observed",
    },
    {
      label: "Equilibrium Temp",
      value: planet.equilibriumK ? `${formatNumber(planet.equilibriumK, 0)} K` : "Unknown",
      note: "Loaded archive equilibrium-temperature field.",
      kind: "observed",
    },
    {
      label: "Eccentricity",
      value: planet.eccentricity !== null && planet.eccentricity !== undefined ? formatNumber(planet.eccentricity, 3) : "Unknown",
      note: "Archive orbital eccentricity where reported.",
      kind: "observed",
    },
    {
      label: "Semi-major Axis",
      value: planet.semiMajorAxisAu ? `${formatNumber(planet.semiMajorAxisAu, 3)} AU` : "Unknown",
      note: "Observed orbital scale for the current catalog entry.",
      kind: "observed",
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
    },
    ...(local
      ? [{
          label: "Legacy Habitability",
          value: local.habitability ?? "No habitability note",
          note: "Pulled from the original EXOPLANET_ANALYSES bundle and kept separate from the official catalog row.",
          kind: "source" as const,
        }]
      : []),
  ];
}

function buildDerivedMetrics(system: UniverseSystem, planet: UniversePlanet | null, science?: PlanetScienceBundle | null): Metric[] {
  const xyz = system.cartesianPc;
  const hz = habitableZoneAu(system);
  const lum = stellarLuminosity(system);
  const local = mergedLocalAnalysis(system, planet, science);

  if (!planet) {
    return [
      {
        label: "Sun-centered XYZ",
        value: `${formatSigned(xyz.x, 2)}, ${formatSigned(xyz.y, 2)}, ${formatSigned(xyz.z, 2)} pc`,
        note: "Derived from RA, Dec, and distance in the current equatorial frame.",
        kind: "derived",
      },
      {
        label: "Luminosity Proxy",
        value: lum ? `${formatNumber(lum, 2)} L☉` : "Insufficient host data",
        note: "Stefan-Boltzmann scaling from host radius and effective temperature.",
        kind: "derived",
      },
      {
        label: "Habitable Zone",
        value: hz ? `${formatNumber(hz.inner, 2)} - ${formatNumber(hz.outer, 2)} AU` : "Insufficient host data",
        note: "Simple luminosity-scaled approximation for a first-pass system context.",
        kind: "inferred",
      },
      {
        label: "System Architecture",
        value: systemCompactness(system) ? `${formatNumber(systemCompactness(system), 2)} AU mean orbit` : "Sparse orbital data",
        note: "Mean orbital scale for planets with reported semi-major axis.",
        kind: "inferred",
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
      note: "Earth-scaled density estimate from observed mass and radius.",
      kind: "derived",
    },
    {
      label: "Incident Flux",
      value: insolation ? `${formatNumber(insolation, 2)} S⊕` : "Insufficient orbit/host data",
      note: science?.radiation.fluxEarthMultiple !== null && science?.radiation.fluxEarthMultiple !== undefined
        ? `Official internet-backed flux layer: ${formatNumber(science?.radiation.fluxWm2, 0)} W/m².`
        : "Luminosity proxy divided by orbital distance squared.",
      kind: "derived",
    },
    {
      label: "Orbital Velocity",
      value: speed ? `${formatNumber(speed, 1)} km/s` : "Insufficient orbit/host data",
      note: "Keplerian first-order estimate from stellar mass and semi-major axis.",
      kind: "derived",
    },
    {
      label: "Regime",
      value: `${planetClass(planet)} | ${temperatureClass(planet.equilibriumK)}`,
      note: `${hzText}.`,
      kind: "inferred",
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
    },
  ];

  if (science) {
    metrics.push({
      label: "JWST Coverage",
      value: wavelengthCoverageText(science) ?? "Metadata only",
      note: `${science.spectrum.jwstObservations.length} observation(s), ${science.spectrum.jwstProducts.length} product(s), ${science.spectrum.curatedTransmissionFiles.length} curated transmission file(s), ${science.spectrum.numericSeries.length} parsed numeric spectrum series.`,
      kind: "observed",
    });
    metrics.push({
      label: "Atmosphere Evidence",
      value: chemistrySummary(science) ?? "No molecule tags yet",
      note: science.atmosphere.cloudInterpretation,
      kind: "inferred",
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
      },
      {
        label: "Teq / Orbit",
        value: `${formatNumber(science.uncertainty.equilibriumK.plus, 0)} K / ${formatNumber(science.uncertainty.semiMajorAxisAu.plus, 3)} AU`,
        note: `Official uncertainty widths now feed a ${science.propagation.sampleCount}-sample Monte Carlo pass (${science.propagation.inputMode}).`,
        kind: "source",
      },
      {
        label: "Stellar inputs",
        value: `${formatNumber(science.uncertainty.stellarTemperatureK.plus, 0)} K / ${formatNumber(science.uncertainty.stellarRadiusSolar.plus, 3)} R☉`,
        note: "Host-star uncertainty carried from archive/exo.MAST into the selected-planet bundle.",
        kind: "source",
      },
      {
        label: "Density / Gravity",
        value: `${formatNumber(science.propagation.densityGcc.median, 2)} g/cc / ${formatNumber(science.propagation.surfaceGravityMs2.median, 1)} m/s²`,
        note: `${formatNumber(science.propagation.densityGcc.low, 2)}-${formatNumber(science.propagation.densityGcc.high, 2)} g/cc and ${formatNumber(science.propagation.surfaceGravityMs2.low, 1)}-${formatNumber(science.propagation.surfaceGravityMs2.high, 1)} m/s² across the propagated interval.`,
        kind: "derived",
      },
      {
        label: "Flux / Scale Height",
        value: `${formatNumber(science.propagation.fluxEarthMultiple.median, 2)} S⊕ / ${formatNumber(science.propagation.scaleHeightKm.median, 0)} km`,
        note: `${formatNumber(science.propagation.fluxEarthMultiple.low, 2)}-${formatNumber(science.propagation.fluxEarthMultiple.high, 2)} S⊕ flux and ${formatNumber(science.propagation.oneScaleHeightSignalPpm.median, 0)} ppm one-scale-height signal.`,
        kind: "derived",
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

  const insolation = science?.radiation.fluxEarthMultiple ?? insolationEarth(system, planet);
  const thermal = temperatureClass(planet.equilibriumK);
  const brightness = science?.stellar.photometry.jMag ?? system.stellar.photometry.jMag;
  const kBrightness = science?.stellar.photometry.kMag ?? system.stellar.photometry.kMag;
  const spectra = science?.spectrum.fileCount ?? 0;
  const coverage = wavelengthCoverageText(science);
  const modes = jwstModeSummary(science);
  const signal = science?.propagation.oneScaleHeightSignalPpm.median;
  const recommendations = buildPlannerRecommendations(system, planet, science).map(plannerRecommendationText).join(" | ");
  return `Next observation priority: constrain atmosphere and orbit jointly. ${planet.name} currently reads as a ${thermal} target with ${insolation ? `${formatNumber(insolation, 2)} S⊕ insolation` : "unresolved insolation"}, ${brightness !== null && brightness !== undefined ? `J=${formatNumber(brightness, 2)} mag` : "unresolved J-band brightness"}, and ${kBrightness !== null && kBrightness !== undefined ? `K=${formatNumber(kBrightness, 2)} mag` : "unresolved K-band brightness"}. ${spectra ? `The joined JWST inventory already contains ${science?.spectrum.jwstObservations.length ?? 0} observation(s), ${science?.spectrum.jwstProducts.length ?? 0} product(s), ${science?.spectrum.numericSeries.length ?? 0} parsed numeric spectrum series, and ${spectra} linked spectral asset(s)` : "No exo.MAST / MAST spectral assets were returned in this pass."}${coverage ? ` spanning ${coverage}` : ""}${modes.length ? ` via ${modes.join(", ")}` : ""}. ${signal !== null ? `Propagated one-scale-height signal is ${formatNumber(signal, 0)} ppm.` : "Scale-height signal remains unresolved."} Planner recommendations: ${recommendations}. ETC/APT visibility and saturation screening are still required before any of these modes should be treated as executable observation setups.`;
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
    const localLines = [
      `TARGET: ${planet.name}`,
      `HOST SYSTEM: ${system.name}`,
      `LOCAL ANALYSIS SOURCE: ${science.localAnalysis.sourceLabel}${science.localAnalysis.registryVersion ? ` (${science.localAnalysis.registryVersion})` : ""}`,
      ...(science.localAnalysis.habitability ? [`LOCAL HABITABILITY FLAG: ${science.localAnalysis.habitability}`] : []),
      ...(science.localAnalysis.interestingReason ? [`LOCAL INTERESTING FLAG: ${science.localAnalysis.interestingReason}`] : []),
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
    `- Distance [O]: ${formatNumber(system.distancePc, 2)} pc (${formatNumber(distanceLy(system.distancePc), 2)} ly).`,
    `- Right Ascension / Declination [O]: ${formatNumber(system.raDeg, 3)}° / ${formatSigned(system.decDeg, 3)}°.`,
    `- Host effective temperature [O]: ${system.stellar.effectiveTemperatureK ? `${formatNumber(system.stellar.effectiveTemperatureK, 0)} K` : "not present in the current row set"}.`,
    `- Host radius / mass [O]: ${system.stellar.radiusSolar ? `${formatNumber(system.stellar.radiusSolar, 2)} R☉` : "unknown"} / ${system.stellar.massSolar ? `${formatNumber(system.stellar.massSolar, 2)} M☉` : "unknown"}.`,
    `- Spectral type [O]: ${system.stellar.spectralType ?? "not specified"}.`,
    `- Host photometry [O]: V=${formatNumber(system.stellar.photometry.vMag, 2)} mag, J=${formatNumber(system.stellar.photometry.jMag, 2)} mag, K=${formatNumber(system.stellar.photometry.kMag, 2)} mag.`,
    ...(planet
      ? [
          `- Planet radius [O]: ${planet.radiusEarth ? `${formatNumber(planet.radiusEarth, 2)} R⊕` : "not present"}.`,
          `- Planet mass [O]: ${planet.massEarth ? `${formatNumber(planet.massEarth, 2)} M⊕` : "not present"}.`,
          `- Equilibrium temperature [O]: ${planet.equilibriumK ? `${formatNumber(planet.equilibriumK, 0)} K` : "not present"}.`,
          `- Semi-major axis / orbital period [O]: ${planet.semiMajorAxisAu ? `${formatNumber(planet.semiMajorAxisAu, 3)} AU` : "not present"} / ${planet.orbitalPeriodDays ? `${formatNumber(planet.orbitalPeriodDays, 2)} d` : "not present"}.`,
          `- Eccentricity / inclination [O]: ${planet.eccentricity !== null && planet.eccentricity !== undefined ? formatNumber(planet.eccentricity, 3) : "not present"} / ${planet.inclinationDeg !== null && planet.inclinationDeg !== undefined ? `${formatNumber(planet.inclinationDeg, 2)}°` : "not present"}.`,
        ]
      : [`- Planet count [O]: ${system.planetCount}.`]),
    "",
    "DERIVED AND INFERRED CONTEXT [D/I]",
    `- Sun-centered XYZ [D]: (${formatSigned(xyz.x, 3)}, ${formatSigned(xyz.y, 3)}, ${formatSigned(xyz.z, 3)}) pc.`,
    `- Host luminosity proxy [D]: ${lum ? `${formatNumber(lum, 3)} L☉` : "insufficient stellar radius / temperature"}.`,
    `- First-pass habitable-zone estimate [I]: ${hz ? `${formatNumber(hz.inner, 2)} to ${formatNumber(hz.outer, 2)} AU` : "not computable from loaded fields"}.`,
    ...(planet
      ? [
          `- Planet class [I]: ${planetClass(planet)}.`,
          `- Thermal regime [I]: ${temperatureClass(planet.equilibriumK)}.`,
          `- Bulk density [D]: ${density ? `${formatNumber(density, 2)} g/cm³` : "requires both mass and radius"}.`,
          `- Incident flux [D]: ${flux ? `${formatNumber(flux, 2)} S⊕` : "requires host luminosity and semi-major axis"}.`,
          `- Orbital velocity [D]: ${speed ? `${formatNumber(speed, 2)} km/s` : "requires host mass and semi-major axis"}.`,
          ...(science
            ? [
                `- Dayside / nightside [I]: ${science.temperatures.daysideK ? `${formatNumber(science.temperatures.daysideK, 0)} K` : "unresolved"} / ${science.temperatures.nightsideK ? `${formatNumber(science.temperatures.nightsideK, 0)} K` : "unresolved"}.`,
                `- Magnetic field / magnetopause [I]: ${science.magnetosphere.surfaceFieldMicroTesla ? `${formatNumber(science.magnetosphere.surfaceFieldMicroTesla, 1)} microT` : "unresolved"} / ${science.magnetosphere.magnetopauseRadii ? `${formatNumber(science.magnetosphere.magnetopauseRadii, 1)} Rp` : "unresolved"}.`,
                `- Shielding class [I]: ${science.magnetosphere.protection}.`,
                `- JWST observations / products [O]: ${science.spectrum.jwstObservations.length} / ${science.spectrum.jwstProducts.length}.`,
                `- Spectral assets / parsed series [O]: ${science.spectrum.fileCount} / ${science.spectrum.numericSeries.length}.`,
                `- Wavelength coverage [O]: ${coverage ?? "not yet constrained from the returned assets"}.`,
                `- Atmosphere evidence [I]: ${chemistry ?? "No molecule tags yet"}.`,
                `- Cloud / haze interpretation [I]: ${science.atmosphere.cloudInterpretation}`,
                `- Propagated density / gravity [D]: ${formatNumber(science.propagation.densityGcc.median, 2)} g/cm³ / ${formatNumber(science.propagation.surfaceGravityMs2.median, 1)} m/s² from ${science.propagation.sampleCount} Monte Carlo samples (${science.propagation.inputMode}).`,
              ]
            : []),
        ]
      : [`- System compactness [I]: ${systemCompactness(system) ? `${formatNumber(systemCompactness(system), 3)} AU mean orbit` : "insufficient semi-major-axis coverage"}.`]),
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

  return [
    { label: "Radius", value: Math.min(planet.radiusEarth ?? 0, 8), max: 8, note: planet.radiusEarth ? `${formatNumber(planet.radiusEarth, 2)} R⊕` : "pending", hue: 192 },
    { label: "Mass", value: Math.min(planet.massEarth ?? 0, 25), max: 25, note: planet.massEarth ? `${formatNumber(planet.massEarth, 2)} M⊕` : "pending", hue: 24 },
    { label: "Temp", value: Math.min((science?.temperatures.daysideK ?? planet.equilibriumK) ?? 0, 1600), max: 1600, note: science?.temperatures.daysideK ? `${formatNumber(science.temperatures.daysideK, 0)} K day` : planet.equilibriumK ? `${formatNumber(planet.equilibriumK, 0)} K` : "pending", hue: 334 },
    { label: "Flux", value: Math.min((science?.radiation.fluxEarthMultiple ?? planet.insolationEarth) ?? 0, 12), max: 12, note: science?.radiation.fluxEarthMultiple ? `${formatNumber(science.radiation.fluxEarthMultiple, 2)} S⊕` : planet.insolationEarth ? `${formatNumber(planet.insolationEarth, 2)} S⊕` : "pending", hue: 214 },
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

function hashFraction(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function initialOrbitPhase(planet: UniversePlanet, index: number) {
  return hashFraction(`${planet.id}:${index}:phase`) * Math.PI * 2;
}

function orbitInclination(planet: UniversePlanet, index: number) {
  return (hashFraction(`${planet.id}:${index}:inc`) - 0.5) * 0.38;
}

function orbitAngleForPlanet(planet: UniversePlanet, index: number, timeDays: number) {
  const period = Math.max(planet.orbitalPeriodDays ?? 80 + index * 25, 0.4);
  return initialOrbitPhase(planet, index) + (timeDays / period) * Math.PI * 2;
}

function activeSystemLocalPosition(planet: UniversePlanet, index: number, timeDays: number) {
  const orbitRadius = systemOrbitRadius(index, planet.semiMajorAxisAu);
  const angle = orbitAngleForPlanet(planet, index, timeDays);
  const tilt = orbitInclination(planet, index);
  return new THREE.Vector3(
    Math.cos(angle) * orbitRadius,
    Math.sin(angle * 1.35 + tilt) * orbitRadius * 0.08,
    Math.sin(angle) * orbitRadius,
  );
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

function planetVisualModel(system: UniverseSystem, planet: UniversePlanet, science?: PlanetScienceBundle | null) {
  const palette = paletteForSelection(system, planet, science);
  const appearance = previewAppearance(system, planet, science);
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
      magneticFieldMicroTesla: science?.magnetosphere.surfaceFieldMicroTesla ?? null,
      magnetopauseRadii: science?.magnetosphere.magnetopauseRadii ?? null,
      radiationFluxEarth: science?.radiation.fluxEarthMultiple ?? null,
      magneticProtection: science?.magnetosphere.protection ?? null,
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
      uCoreColor: { value: coreColor },
      uRimColor: { value: rimColor },
    }),
    [coreColor, rimColor],
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
        <shaderMaterial ref={starMaterialRef} vertexShader={STAR_VERTEX_SHADER} fragmentShader={STAR_FRAGMENT_SHADER} uniforms={starUniforms} />
      </mesh>
      <mesh scale={1.18}>
        <sphereGeometry args={[radius, 136, 136]} />
        <meshBasicMaterial
          color={coreColor}
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={1.24}>
        <sphereGeometry args={[radius, 132, 132]} />
        <shaderMaterial
          ref={coronaMaterialRef}
          vertexShader={STAR_VERTEX_SHADER}
          fragmentShader={CORONA_FRAGMENT_SHADER}
          uniforms={coronaUniforms}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
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
      uCoreColor: { value: coreColor },
      uRimColor: { value: rimColor },
    }),
    [coreColor, rimColor],
  );

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
    if (starMeshRef.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 1.4 + radius * 12) * 0.012;
      starMeshRef.current.scale.setScalar(pulse);
    }
    if (haloMaterialRef.current) {
      haloMaterialRef.current.opacity = style.glowOpacity * (0.88 + Math.sin(clock.elapsedTime * 1.8 + radius * 10) * 0.12);
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
      <mesh scale={style.glowScale}>
        <sphereGeometry args={[radius, 12, 12]} />
        <meshBasicMaterial
          ref={haloMaterialRef}
          color={haloColor}
          transparent
          opacity={style.glowOpacity}
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
  const primaryOpacity = entry.kind === "dark" ? 0.92 : entry.kind === "molecular" ? 0.84 : 1.18;
  const hazeOpacity = entry.kind === "dark" ? 0.34 : entry.kind === "molecular" ? 0.28 : 0.4;
  const hazeScale = entry.kind === "dark" || entry.kind === "molecular" ? 2.1 : 2.7;
  const bloomOpacity = entry.kind === "dark" ? 0.12 : entry.kind === "molecular" ? 0.16 : 0.24;
  const bloomScale = entry.kind === "dark" || entry.kind === "molecular" ? 2.7 : 3.3;
  const cartesianPc = useMemo(() => equatorialToCartesianPc(entry.raDeg, entry.decDeg, entry.distancePc), [entry]);

  useEffect(() => {
    return () => {
      onHoverChange(null);
    };
  }, [onHoverChange]);

  function showHover(event: ThreeEvent<PointerEvent>) {
    onHoverChange({
      x: event.nativeEvent.offsetX,
      y: event.nativeEvent.offsetY,
      accent: entry.tint,
      title: entry.name,
      lines: [
        deepSkyKindLabel(entry.kind),
        `${formatNumber(distanceLy(entry.distancePc), 1)} ly · ${formatNumber(entry.distancePc, 0)} pc`,
        `XYZ: ${formatCartesian(cartesianPc, 0)}`,
      ],
    });
  }

  return (
    <group>
      <sprite
        scale={[scale, scale, 1]}
        onPointerOver={showHover}
        onPointerMove={showHover}
        onPointerOut={() => onHoverChange(null)}
      >
        <spriteMaterial
          attach="material"
          map={texture}
          color="#ffffff"
          transparent
          depthWrite={false}
          depthTest
          blending={entry.kind === "dark" || entry.kind === "molecular" ? THREE.NormalBlending : THREE.AdditiveBlending}
          opacity={primaryOpacity}
        />
      </sprite>
      <sprite scale={[scale * hazeScale, scale * hazeScale, 1]} raycast={() => null}>
        <spriteMaterial
          attach="material"
          map={texture}
          color={entry.kind === "dark" || entry.kind === "molecular" ? entry.tint : "#ffffff"}
          transparent
          depthWrite={false}
          depthTest
          blending={entry.kind === "dark" || entry.kind === "molecular" ? THREE.NormalBlending : THREE.AdditiveBlending}
          opacity={hazeOpacity}
        />
      </sprite>
      <sprite scale={[scale * bloomScale, scale * bloomScale, 1]} raycast={() => null}>
        <spriteMaterial
          attach="material"
          map={texture}
          color={entry.kind === "dark" || entry.kind === "molecular" ? entry.accent : entry.tint}
          transparent
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          opacity={bloomOpacity}
        />
      </sprite>
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
    if (meshRef.current && !renderProps.tidalLock) {
      meshRef.current.rotation.y = (clock.elapsedTime / Math.max(renderProps.rotationSeconds ?? 30, 1)) * Math.PI * 2;
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
  onFlyToPlanet,
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
  onFlyToPlanet: (target: THREE.Vector3, radius: number) => void;
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

  useEffect(() => {
    return () => {
      if (pendingPlanetClickRef.current !== null) {
        window.clearTimeout(pendingPlanetClickRef.current);
      }
    };
  }, []);

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

  return (
    <>
      {system.planets.slice(0, 10).map((planet, index) => {
        const orbitRadius = systemOrbitRadius(index, planet.semiMajorAxisAu);
        const active = selectedPlanet?.id === planet.id;
        const visualModel = planetVisualModel(system, planet, active ? selectedPlanetScience : null);
        const radius = planetRadius(planet.radiusEarth);

        return (
          <group key={planet.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[orbitRadius - 0.004, orbitRadius + 0.004, 120]} />
              <meshBasicMaterial color={active ? "#8fd5ff" : "#365978"} transparent opacity={active ? 0.92 : 0.5} side={THREE.DoubleSide} />
            </mesh>
            <group
              ref={(node) => {
                planetRefs.current[planet.id] = node;
              }}
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
  selectedPlanet,
  selectedPlanetScience,
  simulationDays,
  orbitSpeedMultiplier,
  zoomFactor,
  followLocked,
  freeRoam,
  onSelectSystem,
  onSelectPlanet,
  onHoverChange,
}: {
  systems: UniverseSystem[];
  whiteDwarfs: WhiteDwarfAnchor[];
  showWhiteDwarfs: boolean;
  selectedSystem: UniverseSystem | null;
  selectedPlanet: UniversePlanet | null;
  selectedPlanetScience?: PlanetScienceBundle | null;
  simulationDays: number;
  orbitSpeedMultiplier: number;
  zoomFactor: number;
  followLocked: boolean;
  freeRoam: boolean;
  onSelectSystem: (system: UniverseSystem) => void;
  onSelectPlanet: (planet: UniversePlanet) => void;
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
          luminositySolar: star.luminositySolar,
          radiusSolar: star.radiusSolar,
        });
        return {
          ...style,
          radiusScale: style.radiusScale * 1.22,
          glowScale: style.glowScale * 1.08,
          glowOpacity: clamp(style.glowOpacity * 1.45, 0.16, 0.34),
        };
      })(),
    }));
  }, []);
  const deepSkyObjects = useMemo(() => {
    return DEEP_SKY_CATALOG.map((entry) => ({
      entry,
      display: logScaledVector(equatorialToCartesianPc(entry.raDeg, entry.decDeg, entry.distancePc)),
      scale: extendedObjectDisplaySize(entry.distancePc, entry.sizePc),
    }));
  }, []);
  const whiteDwarfMarkers = useMemo(() => {
    return whiteDwarfs.map((anchor) => ({
      anchor,
      display: logScaledVector(anchor.cartesianPc),
      style: whiteDwarfStyle(anchor),
    }));
  }, [whiteDwarfs]);

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
    onHoverChange({
      x: event.nativeEvent.offsetX,
      y: event.nativeEvent.offsetY,
      accent,
      title: system.name,
      lines: [
        ...(tags.length ? [`Tags: ${tags.join(" · ")}`] : []),
        `${system.stellar.spectralType ?? "Unknown type"}${system.stellar.effectiveTemperatureK ? ` · ${formatNumber(system.stellar.effectiveTemperatureK, 0)} K` : ""}`,
        `${formatNumber(distanceLy(system.distancePc), 1)} ly · ${formatNumber(system.distancePc, 2)} pc`,
        `XYZ: ${formatCartesian(system.cartesianPc)}`,
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
        `${formatNumber(distanceLy(star.distancePc), 1)} ly · ${formatNumber(star.distancePc, 2)} pc`,
        `XYZ: ${formatCartesian(cartesianPc)}`,
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
        `${formatNumber(distanceLy(anchor.distancePc), 1)} ly · ${formatNumber(anchor.distancePc, 2)} pc`,
        anchor.massSolar ? `Mass: ${formatNumber(anchor.massSolar, 2)} M☉` : "Mass: unresolved",
        anchor.radiusSolar ? `Radius: ${formatNumber(anchor.radiusSolar, 4)} R☉` : "Radius: unresolved",
        anchor.gravitationalRedshiftKmS ? `v_GR: ${formatNumber(anchor.gravitationalRedshiftKmS, 1)} km/s` : "v_GR unresolved",
      ],
    });
  }

  function setOrbitPivot(target: THREE.Vector3) {
    if (!controlsRef.current) return;
    controlsRef.current.target.copy(target);
    controlsRef.current.update();
  }

  function startFlightToSystem(target: THREE.Vector3, planetCount: number) {
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
      duration: 1.35,
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
      setOrbitPivot(target);
      startFlightToDeepSky(target, scale);
      return;
    }

    lastDeepSkyClickRef.current = { id: entry.name, at: now };
    pendingDeepSkyClickRef.current = window.setTimeout(() => {
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
      setOrbitPivot(target);
      startFlightToWhiteDwarf(target);
      return;
    }

    lastWhiteDwarfClickRef.current = { id: anchor.id, at: now };
    pendingWhiteDwarfClickRef.current = window.setTimeout(() => {
      if (!freeRoam) {
        setOrbitPivot(target);
      }
      pendingWhiteDwarfClickRef.current = null;
      if (lastWhiteDwarfClickRef.current?.id === anchor.id) {
        lastWhiteDwarfClickRef.current = null;
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
        </group>
      ))}

      {showWhiteDwarfs
        ? whiteDwarfMarkers.map(({ anchor, display, style }) => (
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

      {referenceMarkers.map(({ star, display, style }) => (
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
            onFlyToPlanet={startFlightToPlanet}
            simulationDays={simulationDays}
            orbitSpeedMultiplier={orbitSpeedMultiplier}
            zoomFactor={zoomFactor}
            followLocked={followLocked}
            controlsRef={controlsRef}
          />
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
}: {
  system: UniverseSystem;
  planet: UniversePlanet | null;
  science?: PlanetScienceBundle | null;
  showMagnetosphere: boolean;
  onToggleMagnetosphere: () => void;
}) {
  const palette = paletteForSelection(system, planet, science);
  const orbits = system.planets.slice(0, 4);
  const visualModel = planet ? planetVisualModel(system, planet, science) : null;
  const synopsis = buildSynopsis(system, planet, science);
  const [visualZoom, setVisualZoom] = useState(1);

  return (
    <div className="relative isolate overflow-hidden rounded-[1.85rem] border border-white/10 bg-[linear-gradient(180deg,rgba(5,12,26,0.84),rgba(3,8,19,0.72))] p-5 shadow-[0_28px_80px_rgba(2,8,24,0.45)]">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 26% 22%, ${hsla(palette.star, 0.28)}, transparent 0 18%, ${hsla(palette.accent, 0.16)} 34%, transparent 62%), linear-gradient(180deg, rgba(3,8,20,0.08), rgba(2,6,17,0.78))`,
        }}
      />
      <div className="absolute inset-x-[16%] top-[5%] h-16 rounded-full bg-sky-300/8 blur-3xl" />
      <div className="relative z-10 mb-4 rounded-[1.35rem] border border-white/8 bg-slate-950/28 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[0.66rem] uppercase tracking-[0.24em] text-sky-100/48">Planet Synopsis</div>
          {planet ? (
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
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-200/82">{synopsis}</p>
      </div>
      <div className="relative min-h-[18rem] overflow-hidden rounded-[1.5rem] border border-white/8 bg-[radial-gradient(circle_at_32%_30%,rgba(255,255,255,0.08),transparent_0_18%,rgba(255,170,120,0.04)_34%,transparent_56%),linear-gradient(180deg,rgba(7,16,36,0.82),rgba(2,8,18,0.96))]">
        <div
          className="absolute left-[8%] top-[8%] rounded-full blur-3xl"
          style={{
            width: "12rem",
            height: "12rem",
            background: hsla(palette.star, 0.34),
          }}
        />

        {planet ? (
          <>
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
                      <PlanetGlobe {...renderProps} showMagnetosphere={showMagnetosphere} className="!min-h-[24rem]" />
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
          </>
        ) : (
          <>
            {orbits.map((entry, index) => (
              <div
                key={entry.id}
                className="absolute rounded-full border border-white/10"
                style={{
                  inset: `${24 + index * 10}% ${18 + index * 8}%`,
                }}
              />
            ))}
            {orbits.map((entry, index) => {
              const size = entry.radiusEarth && entry.radiusEarth > 3 ? 18 : 12;
              return (
                <div
                  key={`${entry.id}-planet`}
                  className="absolute rounded-full"
                  style={{
                    left: `${52 + index * 8}%`,
                    top: `${27 + index * 9}%`,
                    width: `${size}px`,
                    height: `${size}px`,
                    background: index % 2 === 0 ? "rgba(114,226,255,0.92)" : "rgba(255,177,105,0.92)",
                    boxShadow: "0 0 20px rgba(114,226,255,0.22)",
                  }}
                />
              );
            })}
            <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/8 bg-slate-950/28 px-3 py-2 text-xs text-slate-200/70">
              System focus mode: planets orbit the selected host while science cards below update from the same archive object.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function UniverseStage({ snapshot }: { snapshot: UniverseSnapshot }) {
  const defaultSystem = useMemo(() => {
    return snapshot.systems.find((system) => system.id === "sun") ?? snapshot.systems[0] ?? null;
  }, [snapshot.systems]);
  const defaultPlanet = useMemo(() => {
    if (!defaultSystem) return null;
    return defaultSystem.planets.find((planet) => planet.id === "earth") ?? defaultSystem.planets[0] ?? null;
  }, [defaultSystem]);
  const [query, setQuery] = useState("");
  const [spectralFilter, setSpectralFilter] = useState("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedStageFilters>(DEFAULT_ADVANCED_STAGE_FILTERS);
  const [simulationDays, setSimulationDays] = useState(0);
  const [orbitSpeedMultiplier, setOrbitSpeedMultiplier] = useState(1);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [followLocked, setFollowLocked] = useState(false);
  const [freeRoam, setFreeRoam] = useState(false);
  const [showWhiteDwarfs, setShowWhiteDwarfs] = useState(false);
  const [showMagnetosphere, setShowMagnetosphere] = useState(false);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(defaultSystem?.id ?? null);
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(defaultPlanet?.id ?? null);
  const [planetScience, setPlanetScience] = useState<PlanetScienceBundle | null>(null);
  const [planetScienceResolvedKey, setPlanetScienceResolvedKey] = useState<string | null>(null);
  const [stageHover, setStageHover] = useState<StageHover | null>(null);

  const filteredSystems = useMemo(() => {
    const search = query.trim().toLowerCase();
    return snapshot.systems.filter((system) => {
      const matchesSearch =
        !search ||
        system.name.toLowerCase().includes(search) ||
        system.planets.some((planet) => planet.name.toLowerCase().includes(search));
      const matchesType = spectralFilter === "all" || spectralBucket(system.stellar.spectralType) === spectralFilter;
      const matchesAdvanced = systemMatchesAdvancedFilters(system, advancedFilters);
      return matchesSearch && matchesType && matchesAdvanced;
    });
  }, [advancedFilters, query, spectralFilter, snapshot.systems]);

  const selectedSystem = useMemo(() => {
    if (!filteredSystems.length) {
      return null;
    }
    if (!selectedSystemId) return filteredSystems[0] ?? null;
    return filteredSystems.find((system) => system.id === selectedSystemId) ?? filteredSystems[0] ?? null;
  }, [filteredSystems, selectedSystemId]);

  const selectedPlanet = useMemo(() => {
    if (!selectedSystem) return null;
    if (!selectedPlanetId) return selectedSystem.planets[0] ?? null;
    return selectedSystem.planets.find((planet) => planet.id === selectedPlanetId) ?? selectedSystem.planets[0] ?? null;
  }, [selectedPlanetId, selectedSystem]);

  const selectedPlanetScience = useMemo(() => {
    if (!planetScience || !selectedPlanet) return null;
    return scienceKey(planetScience.planetName) === scienceKey(selectedPlanet.name) ? planetScience : null;
  }, [planetScience, selectedPlanet]);
  const selectedPlanetKey = selectedPlanet ? scienceKey(selectedPlanet.name) : null;
  const planetScienceLoading = !!selectedPlanetKey && planetScienceResolvedKey !== selectedPlanetKey;

  useEffect(() => {
    const targetPlanetName = selectedPlanet?.name;
    if (!targetPlanetName) return;
    const targetKey = scienceKey(targetPlanetName);

    let cancelled = false;
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
  }, [selectedPlanet?.name]);

  const observedMetrics = selectedSystem ? buildObservedMetrics(selectedSystem, selectedPlanet, selectedPlanetScience) : [];
  const derivedMetrics = selectedSystem ? buildDerivedMetrics(selectedSystem, selectedPlanet, selectedPlanetScience) : [];
  const uncertaintyMetrics = selectedSystem ? buildUncertaintyMetrics(selectedSystem, selectedPlanet, selectedPlanetScience) : [];
  const chartRows = selectedSystem ? buildChartRows(selectedSystem, selectedPlanet, selectedPlanetScience) : [];
  const analysis = selectedSystem ? buildAnalysis(selectedSystem, selectedPlanet, selectedPlanetScience) : "No target in the current filtered universe slice.";
  const sources = selectedSystem ? dedupeSources(selectedSystem, selectedPlanet, selectedPlanetScience) : [];
  const orbitSpeedLabel = `${orbitSpeedMultiplier.toFixed(1)}x`;

  function jumpHome() {
    setQuery("");
    setSpectralFilter("all");
    setAdvancedFiltersOpen(false);
    setAdvancedFilters(DEFAULT_ADVANCED_STAGE_FILTERS);
    setFreeRoam(false);
    setFollowLocked(false);
    setShowWhiteDwarfs(false);
    setZoomFactor(1);
    setSelectedSystemId("sun");
    setSelectedPlanetId("earth");
  }

  return (
    <section id="science-deck" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_30rem] xl:items-start">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,16,34,0.82),rgba(3,9,22,0.62))] shadow-[0_30px_120px_rgba(2,8,24,0.42)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.28em] text-sky-100/52">3D Universe Navigator</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Science coordinates first, renderer second</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300/72">
                  The left stage preserves the previous site organization: star selection, planet selection, coordinate readout, and a full text analysis under the map.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.68rem] uppercase tracking-[0.24em] text-slate-200/70">
                {filteredSystems.length} systems in view · {snapshot.whiteDwarfs.anchors.length} white dwarfs available
              </div>
            </div>

            <div className="grid gap-3 border-b border-white/8 px-5 py-4 md:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_13rem_10rem_10rem_auto]">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.24em] text-slate-300/58">
                  <Search className="h-3.5 w-3.5" /> Search planet / star
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. K2-18, Proxima b, TRAPPIST-1"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-slate-950/58"
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.24em] text-slate-300/58">
                  <Crosshair className="h-3.5 w-3.5" /> Star system
                </span>
                <select
                  value={selectedSystem?.id ?? ""}
                  onChange={(event) => setSelectedSystemId(event.target.value || null)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/30 focus:bg-slate-950/58"
                >
                  {filteredSystems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name}
                    </option>
                  ))}
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

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.24em] text-slate-300/58">
                  <Orbit className="h-3.5 w-3.5" /> Sim time (days)
                </span>
                <input
                  type="number"
                  value={simulationDays}
                  onChange={(event) => setSimulationDays(Number(event.target.value || 0))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-slate-950/58"
                />
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
                  <button
                    type="button"
                    onClick={() => {
                      if (freeRoam) {
                        setFreeRoam(false);
                      }
                      setFollowLocked((value) => !value);
                    }}
                    disabled={!selectedPlanet}
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-medium transition ${selectedPlanet ? (followLocked ? "border-sky-300/34 bg-sky-300/12 text-sky-50" : "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]") : "cursor-not-allowed border-white/8 bg-white/[0.02] text-slate-500"}`}
                  >
                    {followLocked ? "Unlock Follow" : "Lock Follow"}
                  </button>
                </div>
              </div>
            </div>

            <div
              className="relative h-[620px] w-full overflow-hidden"
              onPointerLeave={() => setStageHover(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setFreeRoam(true);
                setFollowLocked(false);
              }}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(129,226,255,0.10),transparent_0_20%,rgba(255,159,111,0.06)_34%,transparent_62%)]" />
              <Canvas
                camera={{ position: [0, 10, 46], fov: 48 }}
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
                  selectedPlanet={selectedPlanet}
                  selectedPlanetScience={selectedPlanetScience}
                  simulationDays={simulationDays}
                  orbitSpeedMultiplier={orbitSpeedMultiplier}
                  zoomFactor={zoomFactor}
                  followLocked={followLocked}
                  freeRoam={freeRoam}
                  onSelectSystem={(system) => {
                    setSelectedSystemId(system.id);
                    setSelectedPlanetId(system.planets[0]?.id ?? null);
                    setFollowLocked(false);
                  }}
                  onSelectPlanet={(planet) => setSelectedPlanetId(planet.id)}
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
              <div className="absolute bottom-4 right-4 z-20 flex flex-col items-center gap-3 rounded-[1.35rem] border border-white/10 bg-slate-950/58 px-3 py-4 shadow-[0_18px_48px_rgba(2,8,24,0.48)] backdrop-blur-md">
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
                  className={`w-full rounded-full border px-3 py-2 text-[0.62rem] uppercase tracking-[0.18em] transition ${
                    freeRoam
                      ? "border-cyan-300/36 bg-cyan-300/14 text-cyan-50"
                      : "border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.1]"
                  }`}
                >
                  {freeRoam ? "Free Cam On" : "Free Cam"}
                </button>
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-300/62">Zoom</div>
                <div className="text-xs font-medium text-white">{zoomFactor.toFixed(2)}x</div>
                <input
                  type="range"
                  min={0.35}
                  max={2.4}
                  step={0.01}
                  value={zoomFactor}
                  onChange={(event) => setZoomFactor(Number(event.target.value))}
                  aria-label="Stage zoom"
                  className="h-32 w-4 cursor-pointer appearance-none rounded-full bg-white/8 accent-cyan-300 [writing-mode:vertical-lr]"
                  style={{ direction: "rtl" }}
                />
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-300/62">Orbit speed</div>
                <div className="text-xs font-medium text-white">{orbitSpeedLabel}</div>
                <input
                  type="range"
                  min={0.1}
                  max={6}
                  step={0.1}
                  value={orbitSpeedMultiplier}
                  onChange={(event) => setOrbitSpeedMultiplier(Number(event.target.value))}
                  aria-label="Orbit speed"
                  className="h-40 w-4 cursor-pointer appearance-none rounded-full bg-white/8 accent-sky-300 [writing-mode:vertical-lr]"
                  style={{ direction: "rtl" }}
                />
                <button
                  type="button"
                  onClick={jumpHome}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/[0.1]"
                >
                  <House className="h-3.5 w-3.5" />
                  Home
                </button>
              </div>
            </div>

            <div className="space-y-4 border-t border-white/8 px-5 py-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/30 p-4">
                  <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">Selection Report</div>
                  <h3 className="mt-2 text-xl font-semibold text-white">{selectedPlanet?.name ?? selectedSystem?.name ?? "No selection"}</h3>
                  {selectedPlanet ? (
                    <div className="mt-2 text-[0.66rem] uppercase tracking-[0.22em] text-sky-100/48">
                      {planetScienceLoading ? "Pulling official internet enrichment..." : selectedSystem ? localAnalysisStatus(selectedSystem, selectedPlanet, selectedPlanetScience) : "Archive snapshot only"}
                    </div>
                  ) : null}
                  <p className="mt-2 text-sm leading-6 text-slate-300/74">
                    {selectedSystem ? buildSynopsis(selectedSystem, selectedPlanet, selectedPlanetScience) : "The current filter set returned no systems."}
                  </p>
                  {selectedSystem ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">XYZ from Sun</div>
                        <div className="mt-1 text-sm text-white">
                          {formatSigned(selectedSystem.cartesianPc.x, 2)}, {formatSigned(selectedSystem.cartesianPc.y, 2)}, {formatSigned(selectedSystem.cartesianPc.z, 2)} pc
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Host star</div>
                        <div className="mt-1 text-sm text-white">{selectedSystem.name} · {selectedSystem.stellar.spectralType ?? "Unknown"}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Active target</div>
                        <div className="mt-1 text-sm text-white">{selectedPlanet ? "Planet detail" : "System overview"}</div>
                        {mergedLocalAnalysis(selectedSystem, selectedPlanet, selectedPlanetScience)?.interestingReason ? (
                          <div className="mt-1 text-xs text-sky-100/62">{mergedLocalAnalysis(selectedSystem, selectedPlanet, selectedPlanetScience)?.interestingReason}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/30 p-4">
                  <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">Planets in focus</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedSystem?.planets.length ? (
                      selectedSystem.planets.map((planet) => (
                        <button
                          key={planet.id}
                          type="button"
                          onClick={() => setSelectedPlanetId(planet.id)}
                          className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.18em] transition ${selectedPlanet?.id === planet.id ? "border-sky-300/34 bg-sky-300/12 text-sky-50" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/18 hover:bg-white/[0.06]"}`}
                        >
                          {planet.name}
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-slate-400">No planets in the current filtered selection.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.7rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">Full Maximal Analysis</div>
                    <h3 className="mt-2 text-xl font-semibold text-white">Science-side narrative retained under the map</h3>
                  </div>
                  <div className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">Download hooks attach here in the next pass</div>
                </div>
                <pre className="mt-5 whitespace-pre-wrap break-words rounded-[1.5rem] border border-white/8 bg-slate-950/42 p-5 font-mono text-[0.84rem] leading-7 text-slate-200/82">{analysis}</pre>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          {selectedSystem ? (
            <VisualFocus
              key={`${selectedSystem.id}:${selectedPlanet?.id ?? "system"}`}
              system={selectedSystem}
              planet={selectedPlanet}
              science={selectedPlanetScience}
              showMagnetosphere={showMagnetosphere}
              onToggleMagnetosphere={() => setShowMagnetosphere((value) => !value)}
            />
          ) : null}

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">
              <Database className="h-3.5 w-3.5" /> Observed Inputs
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {observedMetrics.map((metric) => (
                <article key={metric.label} className={`rounded-[1.2rem] border p-3 ${toneClasses(metric.kind)}`}>
                  <div className="text-[0.64rem] uppercase tracking-[0.22em] opacity-70">{metric.label}</div>
                  <div className="mt-2 text-base font-semibold">{metric.value}</div>
                  <p className="mt-2 text-xs leading-5 opacity-80">{metric.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">
              <Orbit className="h-3.5 w-3.5" /> Inferred / Model-Derived
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {derivedMetrics.map((metric) => (
                <article key={metric.label} className={`rounded-[1.2rem] border p-3 ${toneClasses(metric.kind)}`}>
                  <div className="text-[0.64rem] uppercase tracking-[0.22em] opacity-70">{metric.label}</div>
                  <div className="mt-2 text-base font-semibold">{metric.value}</div>
                  <p className="mt-2 text-xs leading-5 opacity-80">{metric.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">Formal Uncertainty Propagation</div>
            <div className="mt-4 grid gap-3">
              {uncertaintyMetrics.map((metric) => (
                <article key={metric.label} className={`rounded-[1.2rem] border p-3 ${toneClasses(metric.kind)}`}>
                  <div className="text-[0.64rem] uppercase tracking-[0.22em] opacity-70">{metric.label}</div>
                  <div className="mt-2 text-base font-semibold">{metric.value}</div>
                  <p className="mt-2 text-xs leading-5 opacity-80">{metric.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">Observation Planning Output</div>
            <p className="mt-3 text-sm leading-7 text-slate-200/82">{selectedSystem ? buildObservationPlan(selectedSystem, selectedPlanet, selectedPlanetScience) : "No target selected."}</p>
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">Provenance & Citations</div>
            <div className="mt-4 space-y-3">
              {sources.map((source) => (
                <a
                  key={source.url}
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
                  <p className="mt-2 text-xs leading-5 text-slate-300/70">{source.kind} · fetched {new Date(source.accessedAt).toLocaleString()}</p>
                </a>
              ))}
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.26em] text-sky-100/48">
              <ChartColumn className="h-3.5 w-3.5" /> Science Chart Stack
            </div>
            <div className="mt-4 space-y-4">
              {chartRows.map((row) => (
                <div key={row.label} className="rounded-[1.2rem] border border-white/8 bg-slate-950/26 p-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="text-sm font-medium text-white">{row.label}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.note}</div>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${metricPercentage(row.value, row.max)}%`,
                        background: `linear-gradient(90deg, hsla(${row.hue}, 90%, 55%, 0.35), hsla(${row.hue}, 95%, 66%, 0.92))`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {selectedSystem?.planets.length ? (
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
