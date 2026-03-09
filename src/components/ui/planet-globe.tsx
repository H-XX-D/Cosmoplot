"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { clamp, cn, hsla, lerp } from "@/lib/utils";

export type HslColor = {
  h: number;
  s: number;
  l: number;
};

export type PlanetRegime =
  | "airless"
  | "rocky"
  | "temperate"
  | "desert"
  | "venusian"
  | "lava"
  | "hycean"
  | "sub-neptune"
  | "gas-giant"
  | "hot-jupiter"
  | "saturnian"
  | "ice-giant";

export type PlanetGlobeProps = {
  className?: string;
  seedKey: string;
  planetColor: HslColor;
  starColor: HslColor;
  accentColor: HslColor;
  regime: PlanetRegime;
  densityGcc?: number | null;
  equilibriumK?: number | null;
  cloudCover?: number;
  bandCount?: number;
  stormCount?: number;
  rotationSeconds?: number;
  tidalLock?: boolean;
  insolationEarth?: number | null;
  daysideK?: number | null;
  nightsideK?: number | null;
  moleculeTags?: string[];
  showMagnetosphere?: boolean;
  magneticFieldMicroTesla?: number | null;
  magnetopauseRadii?: number | null;
  radiationFluxEarth?: number | null;
  magneticProtection?: string | null;
  viewLongitude?: number;
  viewLatitude?: number;
  lightDirectionX?: number;
  lightDirectionY?: number;
  lightDirectionZ?: number;
};

export const EARTH_REFERENCE_SRC = "/assets/reference/earth-globe.jpeg";
const SOLAR_ANALOG_SRC = {
  mercury: "/assets/solar-analogs/mercury.jpg",
  venus: "/assets/solar-analogs/venus.png",
  mars: "/assets/solar-analogs/mars.png",
  jupiter: "/assets/solar-analogs/jupiter.png",
  saturn: "/assets/solar-analogs/saturn.png",
  neptune: "/assets/solar-analogs/neptune.png",
  uranus: "/assets/solar-analogs/uranus.png",
} as const;

const DIRECT_REFERENCE_PLANETS = new Set([
  "earth",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
]);

type ReferenceAsset = {
  src: string;
  mode: "map" | "disc";
};

type ChemistryProfile = {
  bandBase: HslColor;
  bandAccent: HslColor;
  stormColor: HslColor;
  bandContrast: number;
  bandVolume: number;
};

const DISC_WRAP_CACHE = new Map<string, HTMLCanvasElement>();
const TERRAIN_TEXTURE_CACHE = new Map<string, HTMLCanvasElement>();
const GAS_TEXTURE_CACHE = new Map<string, HTMLCanvasElement>();
const CLOUDWORLD_TEXTURE_CACHE = new Map<string, HTMLCanvasElement>();
const REFERENCE_ANALYSIS_CACHE = new Map<string, { avg: HslColor; accent: HslColor }>();
const AIRLESS_TEXTURE_CACHE = new Map<string, HTMLCanvasElement>();
const SURFACE_SCRATCH_CACHE = new Map<number, HTMLCanvasElement>();

export function shouldUseEarthReference(seedKey: string) {
  return seedKey.trim().toLowerCase() === "earth";
}

export function isDirectDisplayReferencePlanet(seedKey: string) {
  return DIRECT_REFERENCE_PLANETS.has(seedKey.trim().toLowerCase());
}

function isGasRegime(regime: PlanetRegime) {
  return regime === "gas-giant"
    || regime === "hot-jupiter"
    || regime === "saturnian"
    || regime === "ice-giant"
    || regime === "sub-neptune";
}

function isRockyRegime(regime: PlanetRegime) {
  return regime === "airless"
    || regime === "rocky"
    || regime === "temperate"
    || regime === "desert"
    || regime === "venusian"
    || regime === "lava";
}

export function resolvePlanetReferenceAsset(
  props: Pick<PlanetGlobeProps, "seedKey" | "regime" | "equilibriumK" | "densityGcc">,
): ReferenceAsset | null {
  const id = props.seedKey.trim().toLowerCase();
  if (shouldUseEarthReference(id)) {
    return { src: EARTH_REFERENCE_SRC, mode: "map" };
  }

  if (id === "mercury") return { src: SOLAR_ANALOG_SRC.mercury, mode: "disc" };
  if (id === "venus") return { src: SOLAR_ANALOG_SRC.venus, mode: "disc" };
  if (id === "mars") return { src: SOLAR_ANALOG_SRC.mars, mode: "disc" };
  if (id === "jupiter") return { src: SOLAR_ANALOG_SRC.jupiter, mode: "disc" };
  if (id === "saturn") return { src: SOLAR_ANALOG_SRC.saturn, mode: "disc" };
  if (id === "uranus") return { src: SOLAR_ANALOG_SRC.uranus, mode: "disc" };
  if (id === "neptune") return { src: SOLAR_ANALOG_SRC.neptune, mode: "disc" };
  return null;
}

export function resolvePlanetCalibrationAsset(
  props: Pick<PlanetGlobeProps, "seedKey" | "regime" | "equilibriumK" | "densityGcc">,
): ReferenceAsset | null {
  const direct = resolvePlanetReferenceAsset(props);
  if (direct) return direct;

  switch (props.regime) {
    case "airless":
      return { src: SOLAR_ANALOG_SRC.mercury, mode: "disc" };
    case "venusian":
      return { src: SOLAR_ANALOG_SRC.venus, mode: "disc" };
    case "temperate":
    case "hycean":
      return { src: EARTH_REFERENCE_SRC, mode: "map" };
    case "desert":
      return { src: SOLAR_ANALOG_SRC.mars, mode: "disc" };
    case "lava":
      return { src: SOLAR_ANALOG_SRC.mercury, mode: "disc" };
    case "gas-giant":
    case "hot-jupiter":
      return { src: SOLAR_ANALOG_SRC.jupiter, mode: "disc" };
    case "saturnian":
      return { src: SOLAR_ANALOG_SRC.saturn, mode: "disc" };
    case "ice-giant":
      return { src: props.equilibriumK && props.equilibriumK < 90 ? SOLAR_ANALOG_SRC.uranus : SOLAR_ANALOG_SRC.neptune, mode: "disc" };
    case "sub-neptune":
      return { src: props.equilibriumK && props.equilibriumK < 180 ? SOLAR_ANALOG_SRC.uranus : SOLAR_ANALOG_SRC.neptune, mode: "disc" };
    default:
      return null;
  }
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function mixColor(a: HslColor, b: HslColor, t: number): HslColor {
  const hueDelta = ((((b.h - a.h) % 360) + 540) % 360) - 180;
  return {
    h: (a.h + hueDelta * t + 360) % 360,
    s: lerp(a.s, b.s, t),
    l: lerp(a.l, b.l, t),
  };
}

function hslToRgb(color: HslColor) {
  const h = ((color.h % 360) + 360) % 360 / 360;
  const s = clamp(color.s / 100, 0, 1);
  const l = clamp(color.l / 100, 0, 1);

  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v] as const;
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToChannel = (t: number) => {
    let temp = t;
    if (temp < 0) temp += 1;
    if (temp > 1) temp -= 1;
    if (temp < 1 / 6) return p + (q - p) * 6 * temp;
    if (temp < 1 / 2) return q;
    if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
    return p;
  };

  return [
    Math.round(hueToChannel(h + 1 / 3) * 255),
    Math.round(hueToChannel(h) * 255),
    Math.round(hueToChannel(h - 1 / 3) * 255),
  ] as const;
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;

  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }

  h /= 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function mixRgb(base: readonly number[], overlay: readonly number[], alpha: number) {
  const t = clamp(alpha, 0, 1);
  return [
    lerp(base[0], overlay[0], t),
    lerp(base[1], overlay[1], t),
    lerp(base[2], overlay[2], t),
  ] as const;
}

function analyzeReferenceImage(image: CanvasImageSource) {
  const cacheKey =
    "src" in image && typeof image.src === "string"
      ? image.src
      : `${imageDimensions(image).width}x${imageDimensions(image).height}`;
  const cached = REFERENCE_ANALYSIS_CACHE.get(cacheKey);
  if (cached) return cached;

  const { width, height } = imageDimensions(image);
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 96;
  sampleCanvas.height = 96;
  const ctx = sampleCanvas.getContext("2d");
  if (!ctx) {
    const fallback = { avg: { h: 0, s: 0, l: 50 }, accent: { h: 0, s: 0, l: 65 } };
    REFERENCE_ANALYSIS_CACHE.set(cacheKey, fallback);
    return fallback;
  }

  ctx.drawImage(image, 0, 0, width, height, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const data = ctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
  let count = 0;
  let rTotal = 0;
  let gTotal = 0;
  let bTotal = 0;
  let brightR = 0;
  let brightG = 0;
  let brightB = 0;
  let brightCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 12) continue;
    if (r < 12 && g < 12 && b < 12) continue;
    count += 1;
    rTotal += r;
    gTotal += g;
    bTotal += b;
    const brightness = (r + g + b) / 3;
    if (brightness > 132) {
      brightCount += 1;
      brightR += r;
      brightG += g;
      brightB += b;
    }
  }

  const avg = count > 0 ? rgbToHsl(rTotal / count, gTotal / count, bTotal / count) : { h: 0, s: 0, l: 50 };
  const accent =
    brightCount > 0
      ? rgbToHsl(brightR / brightCount, brightG / brightCount, brightB / brightCount)
      : { h: avg.h, s: avg.s, l: clamp(avg.l + 10, 0, 100) };
  const result = { avg, accent };
  REFERENCE_ANALYSIS_CACHE.set(cacheKey, result);
  return result;
}

function seeded(seed: number, offset: number) {
  const raw = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453123;
  return raw - Math.floor(raw);
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function imageDimensions(image: CanvasImageSource | null) {
  if (!image) return { width: 1, height: 1 };
  if ("naturalWidth" in image) {
    return { width: image.naturalWidth || 1, height: image.naturalHeight || 1 };
  }
  if ("videoWidth" in image) {
    return { width: image.videoWidth || 1, height: image.videoHeight || 1 };
  }
  const widthValue = "width" in image ? image.width : 1;
  const heightValue = "height" in image ? image.height : 1;
  return { width: Number(widthValue) || 1, height: Number(heightValue) || 1 };
}

function getSurfaceScratchCanvas(size: number) {
  const cached = SURFACE_SCRATCH_CACHE.get(size);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  SURFACE_SCRATCH_CACHE.set(size, canvas);
  return canvas;
}

function surfaceGradeFilter(props: PlanetGlobeProps) {
  const directReference = isDirectDisplayReferencePlanet(props.seedKey);
  if (props.regime === "hot-jupiter") return "saturate(185%) contrast(126%) brightness(108%)";
  if (props.regime === "gas-giant") return "saturate(176%) contrast(122%) brightness(106%)";
  if (props.regime === "saturnian") return "saturate(158%) contrast(118%) brightness(107%)";
  if (props.regime === "ice-giant") return "saturate(182%) contrast(122%) brightness(107%)";
  if (props.regime === "sub-neptune") return "saturate(172%) contrast(120%) brightness(106%)";
  if (props.regime === "hycean") return "saturate(176%) contrast(121%) brightness(106%)";
  if (props.regime === "venusian") return "saturate(150%) contrast(118%) brightness(107%)";
  if (props.regime === "lava") return "saturate(188%) contrast(130%) brightness(108%)";
  if (props.regime === "desert") return "saturate(162%) contrast(122%) brightness(105%)";
  if (props.regime === "airless") return directReference ? "saturate(124%) contrast(116%) brightness(104%)" : "saturate(146%) contrast(122%) brightness(105%)";
  if (props.regime === "temperate") return directReference ? "saturate(118%) contrast(112%) brightness(103%)" : "saturate(154%) contrast(118%) brightness(105%)";
  if (props.regime === "rocky") return directReference ? "saturate(122%) contrast(114%) brightness(104%)" : "saturate(156%) contrast(120%) brightness(105%)";
  return directReference ? "saturate(118%) contrast(112%) brightness(103%)" : "saturate(150%) contrast(118%) brightness(105%)";
}

function gridHash(seed: number, x: number, y: number) {
  const raw = Math.sin((x * 127.1 + y * 311.7 + seed * 0.017) * 1.137) * 43758.5453123;
  return raw - Math.floor(raw);
}

function valueNoise2D(seed: number, x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const a = gridHash(seed, ix, iy);
  const b = gridHash(seed, ix + 1, iy);
  const c = gridHash(seed, ix, iy + 1);
  const d = gridHash(seed, ix + 1, iy + 1);

  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

function fbm2D(seed: number, x: number, y: number, octaves = 5) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let totalAmplitude = 0;

  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise2D(seed + i * 131, x * frequency, y * frequency) * amplitude;
    totalAmplitude += amplitude;
    frequency *= 2.02;
    amplitude *= 0.52;
  }

  return totalAmplitude > 0 ? value / totalAmplitude : 0;
}

function ridgedFbm2D(seed: number, x: number, y: number, octaves = 4) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let totalAmplitude = 0;

  for (let i = 0; i < octaves; i += 1) {
    const sample = valueNoise2D(seed + i * 97, x * frequency, y * frequency);
    const ridged = 1 - Math.abs(sample * 2 - 1);
    value += ridged * amplitude;
    totalAmplitude += amplitude;
    frequency *= 2.12;
    amplitude *= 0.58;
  }

  return totalAmplitude > 0 ? value / totalAmplitude : 0;
}

function tutorialTerrainWaterLevel(regime: PlanetGlobeProps["regime"], densityGcc?: number | null, equilibriumK?: number | null) {
  const density = densityGcc ?? 5.2;
  const eq = equilibriumK ?? 285;

  switch (regime) {
    case "hycean":
      return clamp(0.32 + (eq - 290) * 0.00016, 0.26, 0.4);
    case "temperate":
      return clamp(0.52 + (density - 5.2) * 0.015 - (eq - 285) * 0.0004, 0.47, 0.58);
    case "airless":
      return 0.74;
    case "rocky":
      return clamp(0.56 + (density - 5.4) * 0.012 + (eq - 300) * 0.00025, 0.5, 0.64);
    case "venusian":
      return 0.68;
    case "desert":
      return clamp(0.61 + (eq - 330) * 0.0003, 0.56, 0.7);
    case "lava":
      return 0.68;
    default:
      return 0.56;
  }
}

function buildSatelliteStyleTerrainTexture(
  size: number,
  seed: number,
  regime: PlanetGlobeProps["regime"],
  base: HslColor,
  accent: HslColor,
  star: HslColor,
  densityGcc?: number | null,
  equilibriumK?: number | null,
) {
  const cacheKey = [
    "terrain",
    size,
    seed,
    regime,
    densityGcc ?? "na",
    equilibriumK ?? "na",
    base.h,
    base.s,
    base.l,
    accent.h,
    accent.s,
    accent.l,
    star.h,
    star.s,
    star.l,
  ].join("|");
  const cached = TERRAIN_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const width = size;
  const height = size;
  const elevation = new Float32Array(width * height);
  const temperature = new Float32Array(width * height);

  const seaLevel = tutorialTerrainWaterLevel(regime, densityGcc, equilibriumK);
  const eqBias = clamp(((equilibriumK ?? 285) - 285) / 120, -0.42, 0.62);
  const ruggedness = regime === "lava" ? 1.18 : regime === "desert" ? 0.92 : 0.78;

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const lat = 1 - v * 2;
    const absLat = Math.abs(lat);
    const equatorHeat = Math.cos(absLat * Math.PI * 0.5);

    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const macro = fbm2D(seed + 11, u * 1.8, v * 1.15, 5);
      const continental = fbm2D(seed + 53, u * 0.82, v * 0.82, 3);
      const ridged = ridgedFbm2D(seed + 107, u * 4.4, v * 3.6, 4);
      const crags = ridgedFbm2D(seed + 181, u * 10.8, v * 7.8, 3);
      const noise = fbm2D(seed + 233, u * 6.2, v * 6.2, 4);
      const signedHeight =
        macro * 0.52
        + continental * 0.3
        + ridged * 0.16 * ruggedness
        + crags * 0.08 * ruggedness
        + (noise - 0.5) * 0.08
        - seaLevel;

      const landMask = smoothstep(-0.02, 0.07, signedHeight);
      const mountainMask = smoothstep(0.46, 0.82, ridged) * landMask;
      const heightNorm = clamp(landMask * (0.18 + smoothstep(-0.02, 0.36, signedHeight) * 0.58 + mountainMask * 0.26), 0, 1);
      const tempNoise = (fbm2D(seed + 307, u * 8.4, v * 8.4, 3) - 0.5) * 0.1;
      const temp =
        equatorHeat * 0.96
        + eqBias
        - heightNorm * 0.62
        + tempNoise
        - (regime === "desert" ? 0.08 * (1 - equatorHeat) : 0);

      elevation[y * width + x] = heightNorm;
      temperature[y * width + x] = temp;
    }
  }

  const image = ctx.createImageData(width, height);
  const coldSediment = { h: 30, s: 26, l: 30 };
  const warmSediment = { h: 42, s: 74, l: 70 };
  const bedrockLow = mixColor(
    { h: base.h, s: clamp(base.s * 0.3, 8, 28), l: clamp(base.l - 24, 12, 34) },
    { h: 10, s: 8, l: 20 },
    0.25,
  );
  const bedrockHigh = mixColor(
    { h: accent.h, s: clamp(accent.s * 0.42, 12, 36), l: clamp(accent.l + 18, 48, 84) },
    { h: 18, s: 12, l: 68 },
    0.32,
  );
  const lowLatVegetation = { h: 118, s: 54, l: 28 };
  const highLatVegetation = { h: 98, s: 18, l: 46 };
  const iceColor = { h: star.h, s: 12, l: 95 };

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const lat = 1 - v * 2;
    const absLat = Math.abs(lat);
    const equatorHeat = Math.cos(absLat * Math.PI * 0.5);
    const subtropicDry = Math.exp(-Math.pow(absLat - 0.33, 2) / 0.014);

    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const u = x / (width - 1);
      const h = elevation[idx];
      const temp = temperature[idx];
      const tempNorm = clamp((temp + 0.28) / 1.22, 0, 1);
      const land = smoothstep(0.06, 0.12, h);
      const sedimentMask = land * (1 - smoothstep(0.14, 0.62, h));
      const riverField = 1 - Math.abs(fbm2D(seed + 401, u * 11.5, v * 9.2, 4) * 2 - 1);
      const valleyMask = land * smoothstep(0.08, 0.26, h) * (1 - smoothstep(0.3, 0.62, h));
      const inlandNoise = fbm2D(seed + 463, u * 1.6, v * 1.6, 2);
      const moisture =
        0.24
        + equatorHeat * 0.42
        - subtropicDry * 0.34
        - inlandNoise * 0.14
        + valleyMask * smoothstep(0.64, 0.9, riverField) * 0.52
        + smoothstep(0.54, 0.82, ridgedFbm2D(seed + 509, u * 5.4, v * 4.1, 3)) * (1 - absLat) * 0.1;
      const vegetationMask =
        land
        * smoothstep(0.22, 0.78, tempNorm)
        * smoothstep(0.24, 0.72, moisture)
        * (regime === "desert" ? 0.22 : regime === "lava" ? 0.04 : 1);
      const iceMask = land * (1 - smoothstep(0.16, 0.3, tempNorm));
      const seaIceMask = (1 - land) * (1 - smoothstep(0.08, 0.2, tempNorm)) * (regime === "lava" ? 0 : 1);

      let color = hslToRgb(mixColor(bedrockLow, bedrockHigh, clamp(h * 1.04, 0, 1)));

      if (land < 0.1 && regime !== "lava") {
        const oceanDepth = 1 - smoothstep(0.02, 0.18, h);
        const oceanColor = mixColor(
          { h: 206, s: 70, l: 22 },
          { h: 194, s: 82, l: 48 },
          clamp(oceanDepth * 0.9 + equatorHeat * 0.12, 0, 1),
        );
        color = hslToRgb(oceanColor);
      }

      const sedimentColor = hslToRgb(mixColor(coldSediment, warmSediment, tempNorm));
      color = mixRgb(color, sedimentColor, sedimentMask * 0.68);

      const vegetationColor = hslToRgb(mixColor(highLatVegetation, lowLatVegetation, tempNorm));
      color = mixRgb(color, vegetationColor, vegetationMask * 0.62);

      if (regime === "lava") {
        const emberField = smoothstep(0.7, 0.9, fbm2D(seed + 571, u * 14.2, v * 8.8, 4));
        const lavaGlow = emberField * (1 - smoothstep(0.24, 0.58, h));
        color = mixRgb(color, [255, 124, 48], lavaGlow * 0.5);
      }

      const iceRgb = hslToRgb(iceColor);
      color = mixRgb(color, iceRgb, iceMask * 0.82 + seaIceMask * 0.58);

      const left = elevation[y * width + Math.max(0, x - 1)];
      const right = elevation[y * width + Math.min(width - 1, x + 1)];
      const top = elevation[Math.max(0, y - 1) * width + x];
      const bottom = elevation[Math.min(height - 1, y + 1) * width + x];
      const dx = right - left;
      const dy = bottom - top;
      const shade = clamp(0.88 + (-dx * 0.52 - dy * 0.86), 0.62, 1.16);
      const dodge = clamp(0.92 + (-dx * 0.18 - dy * 0.26), 0.84, 1.08);

      image.data[idx * 4] = clamp(color[0] * shade * dodge, 0, 255);
      image.data[idx * 4 + 1] = clamp(color[1] * shade * dodge, 0, 255);
      image.data[idx * 4 + 2] = clamp(color[2] * shade * dodge, 0, 255);
      image.data[idx * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  TERRAIN_TEXTURE_CACHE.set(cacheKey, canvas);
  return canvas;
}

function buildBandedSwirlTexture(
  size: number,
  seed: number,
  props: PlanetGlobeProps,
  chemistry: ChemistryProfile,
) {
  const cacheKey = [
    "gas",
    size,
    seed,
    props.seedKey,
    props.regime,
    props.bandCount ?? 0,
    props.stormCount ?? 0,
    props.equilibriumK ?? "na",
    chemistry.bandBase.h,
    chemistry.bandBase.s,
    chemistry.bandBase.l,
    chemistry.bandAccent.h,
    chemistry.bandAccent.s,
    chemistry.bandAccent.l,
    chemistry.stormColor.h,
    chemistry.stormColor.s,
    chemistry.stormColor.l,
    chemistry.bandContrast,
    chemistry.bandVolume,
  ].join("|");
  const cached = GAS_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const width = size;
  const height = size;
  const image = ctx.createImageData(width, height);
  const gasGiantLike = props.regime === "gas-giant" || props.regime === "hot-jupiter" || props.regime === "saturnian";
  const bandCount = props.bandCount ?? (props.regime === "hot-jupiter" ? 13 : props.regime === "saturnian" ? 7 : gasGiantLike ? 11 : props.regime === "ice-giant" ? 8 : 9);
  const stormCount = props.stormCount ?? 6;
  const bandContrast = chemistry.bandContrast;
  const bandVolume = chemistry.bandVolume;
  const planetId = props.seedKey.trim().toLowerCase();
  const style =
    planetId === "jupiter"
      ? { bandMultiplier: 1.04, shear: 1.18, turbulence: 1.1, softness: 0.14, haze: 0.05, storm: 0.82, polarHaze: 0.04, equatorHaze: 0.02 }
      : planetId === "saturn"
        ? { bandMultiplier: 0.72, shear: 0.54, turbulence: 0.42, softness: 0.34, haze: 0.22, storm: 0.22, polarHaze: 0.1, equatorHaze: 0.12 }
        : props.regime === "saturnian"
          ? { bandMultiplier: 0.68, shear: 0.48, turbulence: 0.36, softness: 0.38, haze: 0.24, storm: 0.18, polarHaze: 0.1, equatorHaze: 0.14 }
          : props.regime === "hot-jupiter"
            ? { bandMultiplier: 1.18, shear: 1.34, turbulence: 1.28, softness: 0.1, haze: 0.04, storm: 0.66, polarHaze: 0.02, equatorHaze: 0.02 }
        : planetId === "uranus"
          ? { bandMultiplier: 0.48, shear: 0.2, turbulence: 0.18, softness: 0.42, haze: 0.18, storm: 0.12, polarHaze: 0.18, equatorHaze: 0.04 }
          : planetId === "neptune"
            ? { bandMultiplier: 0.68, shear: 0.46, turbulence: 0.34, softness: 0.24, haze: 0.1, storm: 0.52, polarHaze: 0.08, equatorHaze: 0.04 }
            : props.regime === "ice-giant"
              ? { bandMultiplier: 0.7, shear: 0.34, turbulence: 0.28, softness: 0.28, haze: 0.12, storm: 0.24, polarHaze: 0.1, equatorHaze: 0.04 }
              : { bandMultiplier: 0.9, shear: 0.74, turbulence: 0.62, softness: 0.2, haze: 0.08, storm: 0.42, polarHaze: 0.06, equatorHaze: 0.04 };
  const effectiveBandCount = Math.max(3.2, bandCount * style.bandMultiplier);

  const storms = Array.from({ length: stormCount }, (_, index) => ({
    x: seeded(seed, 620 + index * 13),
    y: 0.14 + seeded(seed, 660 + index * 11) * 0.72,
    rx: 0.045 + seeded(seed, 700 + index * 17) * (gasGiantLike ? 0.09 : 0.06),
    ry: 0.018 + seeded(seed, 740 + index * 19) * (gasGiantLike ? 0.045 : 0.03),
    spin: index % 2 === 0 ? 1 : -1,
  }));

  if (props.seedKey.trim().toLowerCase() === "jupiter") {
    storms.unshift({ x: 0.72, y: 0.62, rx: 0.12, ry: 0.07, spin: -1 });
  }

  const stormRgb = hslToRgb(chemistry.stormColor);
  const hazeRgb = hslToRgb(
    gasGiantLike
      ? { h: chemistry.bandBase.h, s: clamp(chemistry.bandBase.s - 18, 8, 52), l: clamp(chemistry.bandBase.l + 8, 42, 88) }
      : { h: chemistry.bandBase.h, s: clamp(chemistry.bandBase.s - 12, 8, 44), l: clamp(chemistry.bandBase.l + 10, 44, 90) },
  );

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const lat = v * 2 - 1;
    const absLat = Math.abs(lat);

    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const macroShear = (fbm2D(seed + 811, u * 2.6, v * 6.4, 4) - 0.5) * 0.32 * bandVolume * style.shear;
      const eddyField = (fbm2D(seed + 853, u * 10.6, v * 11.4, 4) - 0.5) * 0.14 * style.turbulence;
      const ridgeField = ridgedFbm2D(seed + 907, u * 18.2, v * 8.6, 3) * (0.78 + style.turbulence * 0.4);
      const plumeField = fbm2D(seed + 941, u * 24.5, v * 13.2, 3);
      const jetWave = Math.sin((u * Math.PI * 2 * 3.4) + lat * 4.4 + macroShear * 8.2) * 0.08 * bandVolume * (0.72 + style.turbulence * 0.4);
      const displacedLat = lat + macroShear + eddyField + jetWave;
      const primaryBands = 0.5 + 0.5 * Math.sin(displacedLat * Math.PI * effectiveBandCount);
      const secondaryBands = 0.5 + 0.5 * Math.sin(displacedLat * Math.PI * (effectiveBandCount + 2) + plumeField * 2.6);
      const tertiaryBands = 0.5 + 0.5 * Math.sin(displacedLat * Math.PI * (effectiveBandCount * 0.55 + 1.4) - ridgeField * 1.8);
      const rawBandMix = clamp(primaryBands * 0.56 + secondaryBands * 0.28 + tertiaryBands * 0.16 + (plumeField - 0.5) * 0.18, 0, 1);
      const bandMix = lerp(rawBandMix, 0.5 + 0.5 * primaryBands, style.softness);
      const baseColor = mixColor(
        chemistry.bandBase,
        chemistry.bandAccent,
        smoothstep(0.16 + style.softness * 0.12, 0.84 - style.softness * 0.08, bandMix),
      );
      let rgb = hslToRgb({
        h: baseColor.h,
        s: clamp(baseColor.s + (plumeField - 0.5) * 24 * bandContrast + ridgeField * 5, 22, 100),
        l: clamp(baseColor.l + (ridgeField - 0.5) * 24 * bandContrast - (primaryBands - 0.5) * 6, 14, 94),
      });

      const beltShadow = clamp(0.76 + primaryBands * 0.14 - ridgeField * 0.16, 0.56, 1.08);
      const beltDodge = clamp(0.92 + plumeField * 0.12 + secondaryBands * 0.08, 0.82, 1.18);
      rgb = [rgb[0] * beltShadow * beltDodge, rgb[1] * beltShadow * beltDodge, rgb[2] * beltShadow * beltDodge] as const;

      let stormMask = 0;
      for (const storm of storms) {
        const dxRaw = Math.abs(u - storm.x);
        const dx = Math.min(dxRaw, 1 - dxRaw);
        const dy = v - storm.y;
        const nx = dx / storm.rx;
        const ny = dy / storm.ry;
        const dist = Math.sqrt(nx * nx + ny * ny);
        if (dist > 1.35) continue;
        const angle = Math.atan2(ny, nx * storm.spin);
        const spiral = 0.5 + 0.5 * Math.sin(angle * 3.4 + dist * 7.2 + plumeField * 4.4);
        stormMask = Math.max(stormMask, (1 - smoothstep(0.4, 1.2, dist)) * (0.48 + spiral * 0.42) * style.storm);
      }

      if (stormMask > 0) {
        rgb = mixRgb(rgb, stormRgb, stormMask * (gasGiantLike ? 0.68 : 0.42));
      }

      const hazeMask =
        planetId === "saturn"
          ? 0.18
          : props.regime === "saturnian"
            ? 0.2
          : props.regime === "ice-giant"
            ? 0.08 + (1 - absLat) * 0.08
            : 0.06 + (1 - absLat) * 0.04;
      rgb = mixRgb(rgb, hazeRgb, hazeMask + style.haze + smoothstep(0.55, 1, absLat) * style.polarHaze + (1 - absLat) * style.equatorHaze);

      if (planetId === "neptune" || planetId === "uranus") {
        const methaneClouds = smoothstep(0.74, 0.9, plumeField) * (1 - absLat) * (planetId === "neptune" ? 0.2 : 0.12);
        rgb = mixRgb(rgb, [236, 247, 255], methaneClouds);
      }

      image.data[(y * width + x) * 4] = clamp(rgb[0], 0, 255);
      image.data[(y * width + x) * 4 + 1] = clamp(rgb[1], 0, 255);
      image.data[(y * width + x) * 4 + 2] = clamp(rgb[2], 0, 255);
      image.data[(y * width + x) * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  GAS_TEXTURE_CACHE.set(cacheKey, canvas);
  return canvas;
}

function buildTemperateTerrainTexture(
  size: number,
  seed: number,
  base: HslColor,
  accent: HslColor,
  densityGcc?: number | null,
  equilibriumK?: number | null,
) {
  return buildSatelliteStyleTerrainTexture(size, seed, "temperate", base, accent, base, densityGcc, equilibriumK);
}

function buildRockyTerrainTexture(
  size: number,
  seed: number,
  base: HslColor,
  accent: HslColor,
  densityGcc?: number | null,
  equilibriumK?: number | null,
) {
  return buildSatelliteStyleTerrainTexture(size, seed, "rocky", base, accent, base, densityGcc, equilibriumK);
}

function buildDesertTerrainTexture(
  size: number,
  seed: number,
  base: HslColor,
  accent: HslColor,
  densityGcc?: number | null,
  equilibriumK?: number | null,
) {
  const aridBase = mixColor(base, { h: 32, s: 48, l: 52 }, 0.42);
  const aridAccent = mixColor(accent, { h: 42, s: 72, l: 68 }, 0.56);
  return buildSatelliteStyleTerrainTexture(size, seed, "desert", aridBase, aridAccent, aridAccent, densityGcc, equilibriumK);
}

function buildLavaTerrainTexture(
  size: number,
  seed: number,
  base: HslColor,
  accent: HslColor,
  densityGcc?: number | null,
  equilibriumK?: number | null,
) {
  const magmaBase = mixColor(base, { h: 18, s: 84, l: 34 }, 0.58);
  const magmaAccent = mixColor(accent, { h: 12, s: 96, l: 60 }, 0.62);
  return buildSatelliteStyleTerrainTexture(size, seed, "lava", magmaBase, magmaAccent, magmaAccent, densityGcc, equilibriumK);
}

function buildAirlessTerrainTexture(
  size: number,
  seed: number,
  base: HslColor,
  accent: HslColor,
  equilibriumK?: number | null,
) {
  const cacheKey = ["airless", size, seed, base.h, base.s, base.l, accent.h, accent.s, accent.l, equilibriumK ?? "na"].join("|");
  const cached = AIRLESS_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const image = ctx.createImageData(size, size);
  const heatBias = clamp(((equilibriumK ?? 420) - 380) / 800, 0, 0.18);
  const coolBias = clamp((320 - (equilibriumK ?? 320)) / 260, 0, 0.16);
  const lowRock = mixColor({ h: 24 + coolBias * 20, s: 8, l: 22 }, base, 0.24);
  const midRock = mixColor({ h: 30 + coolBias * 12, s: 10, l: 38 }, accent, 0.26);
  const highRock = mixColor({ h: 34 + coolBias * 10, s: 12, l: 60 }, accent, 0.16);

  for (let y = 0; y < size; y += 1) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const macro = fbm2D(seed + 101, u * 1.8, v * 1.8, 4);
      const ridged = ridgedFbm2D(seed + 151, u * 7.6, v * 7.6, 4);
      const fine = fbm2D(seed + 197, u * 20.2, v * 20.2, 3);
      const elevation = clamp(macro * 0.58 + ridged * 0.28 + fine * 0.14, 0, 1);
      const mineral = mixColor(lowRock, midRock, smoothstep(0.18, 0.7, elevation));
      const lit = mixColor(mineral, highRock, smoothstep(0.66, 0.94, ridged));
      const warmed = mixColor(lit, { h: 18, s: 28, l: 52 }, heatBias * smoothstep(0.58, 0.92, fine));
      const cooled = mixColor(warmed, { h: 214, s: 14, l: 58 }, coolBias * smoothstep(0.62, 0.94, macro) * 0.45);
      const metalTint = mixColor(cooled, { h: 28, s: 22, l: 48 }, smoothstep(0.48, 0.9, ridged) * 0.18);
      const rgb = hslToRgb(metalTint);
      image.data[(y * size + x) * 4] = rgb[0];
      image.data[(y * size + x) * 4 + 1] = rgb[1];
      image.data[(y * size + x) * 4 + 2] = rgb[2];
      image.data[(y * size + x) * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const craterCount = Math.round(size * 0.22);
  for (let i = 0; i < craterCount; i += 1) {
    const cx = seeded(seed, 3000 + i * 11) * size;
    const cy = seeded(seed, 3200 + i * 13) * size;
    const radius = 2 + seeded(seed, 3400 + i * 17) * (size * 0.06);
    const ring = ctx.createRadialGradient(cx - radius * 0.18, cy - radius * 0.18, radius * 0.08, cx, cy, radius);
    ring.addColorStop(0, `rgba(248, 240, 225, ${0.12 + seeded(seed, 3600 + i * 19) * 0.12})`);
    ring.addColorStop(0.58, `rgba(70, 58, 48, ${0.14 + seeded(seed, 3800 + i * 23) * 0.16})`);
    ring.addColorStop(0.82, `rgba(188, 170, 148, ${0.1 + seeded(seed, 4000 + i * 29) * 0.1})`);
    ring.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    const ejectaRays = 5 + Math.floor(seeded(seed, 4100 + i * 31) * 6);
    ctx.globalCompositeOperation = "soft-light";
    for (let ray = 0; ray < ejectaRays; ray += 1) {
      const angle = (Math.PI * 2 * ray) / ejectaRays + seeded(seed, 4300 + i * 37) * Math.PI * 0.4;
      const length = radius * (1.8 + seeded(seed, 4500 + i * 41 + ray) * 1.6);
      ctx.strokeStyle = `rgba(236, 220, 198, ${0.035 + seeded(seed, 4700 + i * 43 + ray) * 0.05})`;
      ctx.lineWidth = Math.max(0.6, radius * 0.08);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * radius * 0.28, cy + Math.sin(angle) * radius * 0.28);
      ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < Math.round(size * 0.05); i += 1) {
    const x0 = seeded(seed, 5200 + i * 17) * size;
    const y0 = seeded(seed, 5400 + i * 19) * size;
    const x1 = x0 + (seeded(seed, 5600 + i * 23) - 0.5) * size * 0.24;
    const y1 = y0 + (seeded(seed, 5800 + i * 29) - 0.5) * size * 0.2;
    ctx.strokeStyle = `rgba(34, 28, 22, ${0.06 + seeded(seed, 6000 + i * 31) * 0.08})`;
    ctx.lineWidth = 0.5 + seeded(seed, 6200 + i * 37) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  AIRLESS_TEXTURE_CACHE.set(cacheKey, canvas);
  return canvas;
}

function buildGasGiantTexture(size: number, seed: number, props: PlanetGlobeProps, chemistry: ChemistryProfile) {
  const cacheKey = ["gas-giant-special", size, seed, props.regime, props.planetColor.h, props.accentColor.h, props.equilibriumK ?? "na"].join("|");
  const cached = GAS_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const localProps = {
    ...props,
    bandCount:
      props.regime === "hot-jupiter"
        ? Math.max(props.bandCount ?? 12, 14)
        : props.regime === "saturnian"
          ? Math.min(props.bandCount ?? 7, 8)
          : Math.max(props.bandCount ?? 10, 10),
  };
  ctx.drawImage(buildBandedSwirlTexture(size, seed, localProps, chemistry), 0, 0, size, size);

  if (props.regime === "saturnian") {
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 8; i += 1) {
      const y = size * (0.12 + seeded(seed, 14500 + i * 17) * 0.76);
      const lane = ctx.createLinearGradient(0, y - size * 0.03, 0, y + size * 0.03);
      lane.addColorStop(0, hsla({ h: 42, s: 14, l: 94 }, 0));
      lane.addColorStop(0.5, hsla({ h: 42, s: 14, l: 94 }, 0.08));
      lane.addColorStop(1, hsla({ h: 42, s: 14, l: 94 }, 0));
      ctx.fillStyle = lane;
      ctx.fillRect(0, y - size * 0.04, size, size * 0.08);
    }
  } else if (props.regime === "hot-jupiter") {
    ctx.globalCompositeOperation = "overlay";
    const thermal = ctx.createLinearGradient(0, 0, size, size);
    thermal.addColorStop(0, hsla({ h: 18, s: 86, l: 66 }, 0.14));
    thermal.addColorStop(0.5, hsla({ h: 340, s: 70, l: 44 }, 0.08));
    thermal.addColorStop(1, hsla({ h: 24, s: 82, l: 58 }, 0.14));
    ctx.fillStyle = thermal;
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.globalCompositeOperation = "soft-light";
    for (let i = 0; i < 10; i += 1) {
      const cx = size * (0.08 + seeded(seed, 14600 + i * 19) * 0.84);
      const cy = size * (0.16 + seeded(seed, 14700 + i * 23) * 0.68);
      const radius = size * (0.02 + seeded(seed, 14800 + i * 29) * 0.04);
      const eddy = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      eddy.addColorStop(0, hsla(chemistry.stormColor, 0.2));
      eddy.addColorStop(1, hsla(chemistry.stormColor, 0));
      ctx.fillStyle = eddy;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "source-over";
  GAS_TEXTURE_CACHE.set(cacheKey, canvas);
  return canvas;
}

function buildIceGiantTexture(size: number, seed: number, props: PlanetGlobeProps, chemistry: ChemistryProfile) {
  const cacheKey = ["ice-giant-special", size, seed, props.planetColor.h, props.accentColor.h, props.equilibriumK ?? "na"].join("|");
  const cached = CLOUDWORLD_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(buildBandedSwirlTexture(size, seed, props, chemistry), 0, 0, size, size);
  ctx.globalCompositeOperation = "screen";
  const poleGlow = ctx.createRadialGradient(size * 0.5, size * 0.08, size * 0.02, size * 0.5, size * 0.08, size * 0.28);
  poleGlow.addColorStop(0, hsla({ h: 196, s: 28, l: 95 }, 0.24));
  poleGlow.addColorStop(1, hsla({ h: 196, s: 28, l: 95 }, 0));
  ctx.fillStyle = poleGlow;
  ctx.fillRect(0, 0, size, size * 0.34);
  const southGlow = ctx.createRadialGradient(size * 0.5, size * 0.92, size * 0.02, size * 0.5, size * 0.92, size * 0.28);
  southGlow.addColorStop(0, hsla({ h: 196, s: 28, l: 95 }, 0.18));
  southGlow.addColorStop(1, hsla({ h: 196, s: 28, l: 95 }, 0));
  ctx.fillStyle = southGlow;
  ctx.fillRect(0, size * 0.66, size, size * 0.34);

  ctx.globalCompositeOperation = "soft-light";
  for (let i = 0; i < 10; i += 1) {
    const cx = size * (0.12 + seeded(seed, 8100 + i * 17) * 0.76);
    const cy = size * (seeded(seed, 8200 + i * 19) < 0.5 ? 0.18 : 0.82);
    const radius = size * (0.025 + seeded(seed, 8300 + i * 23) * 0.05);
    const storm = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    storm.addColorStop(0, hsla({ h: 182, s: 24, l: 88 }, 0.3));
    storm.addColorStop(1, hsla({ h: 204, s: 20, l: 50 }, 0));
    ctx.fillStyle = storm;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  CLOUDWORLD_TEXTURE_CACHE.set(cacheKey, canvas);
  return canvas;
}

function buildSubNeptuneTexture(size: number, seed: number, props: PlanetGlobeProps, chemistry: ChemistryProfile) {
  const cacheKey = ["sub-neptune-special", size, seed, props.planetColor.h, props.accentColor.h, props.cloudCover ?? "na"].join("|");
  const cached = CLOUDWORLD_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(buildBandedSwirlTexture(size, seed, { ...props, bandCount: Math.max(props.bandCount ?? 6, 8) }, chemistry), 0, 0, size, size);
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 14; i += 1) {
    const cx = size * (0.08 + seeded(seed, 9100 + i * 13) * 0.84);
    const cy = size * (0.12 + seeded(seed, 9200 + i * 17) * 0.76);
    const rx = size * (0.04 + seeded(seed, 9300 + i * 19) * 0.08);
    const ry = rx * (0.5 + seeded(seed, 9400 + i * 23) * 0.5);
    const rot = seeded(seed, 9500 + i * 29) * Math.PI;
    const cloud = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    cloud.addColorStop(0, hsla({ h: 188, s: 18, l: 96 }, 0.22));
    cloud.addColorStop(0.7, hsla({ h: 188, s: 18, l: 96 }, 0.08));
    cloud.addColorStop(1, hsla({ h: 188, s: 18, l: 96 }, 0));
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "overlay";
  const veil = ctx.createLinearGradient(0, 0, size, size);
  veil.addColorStop(0, hsla({ h: chemistry.bandBase.h, s: chemistry.bandBase.s + 10, l: chemistry.bandBase.l + 10 }, 0.08));
  veil.addColorStop(1, hsla({ h: chemistry.bandAccent.h, s: chemistry.bandAccent.s, l: chemistry.bandAccent.l - 8 }, 0.08));
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  CLOUDWORLD_TEXTURE_CACHE.set(cacheKey, canvas);
  return canvas;
}

function buildVenusianTexture(
  size: number,
  seed: number,
  base: HslColor,
  accent: HslColor,
  equilibriumK?: number | null,
) {
  const cacheKey = [
    "venusian",
    size,
    seed,
    base.h,
    base.s,
    base.l,
    accent.h,
    accent.s,
    accent.l,
    equilibriumK ?? "na",
  ].join("|");
  const cached = CLOUDWORLD_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const image = ctx.createImageData(size, size);
  const sulfurBase = mixColor(base, { h: 46, s: 18, l: 84 }, 0.62);
  const sulfurAccent = mixColor(accent, { h: 34, s: 56, l: 68 }, 0.54);
  const heatBias = clamp(((equilibriumK ?? 720) - 640) / 420, 0, 0.18);

  for (let y = 0; y < size; y += 1) {
    const v = y / Math.max(size - 1, 1);
    const lat = v * 2 - 1;
    const absLat = Math.abs(lat);

    for (let x = 0; x < size; x += 1) {
      const u = x / Math.max(size - 1, 1);
      const macro = fbm2D(seed + 401, u * 2.6, v * 3.8, 5);
      const shear = fbm2D(seed + 463, u * 12.2, v * 5.2, 4);
      const plume = ridgedFbm2D(seed + 521, u * 18.6, v * 9.8, 4);
      const band = 0.5 + 0.5 * Math.sin((lat + (shear - 0.5) * 0.2) * Math.PI * 5.8 + u * 12.8);
      const mix = clamp(macro * 0.44 + shear * 0.18 + plume * 0.16 + band * 0.22, 0, 1);
      const haze = smoothstep(0.42, 1, absLat) * 0.08;
      const color = mixColor(
        sulfurBase,
        { ...sulfurAccent, h: sulfurAccent.h - heatBias * 16, l: clamp(sulfurAccent.l - heatBias * 8 + haze * 8, 34, 90) },
        mix,
      );
      const rgb = hslToRgb({
        h: color.h,
        s: clamp(color.s + (plume - 0.5) * 10 + heatBias * 12, 6, 74),
        l: clamp(color.l + (band - 0.5) * 10 + haze * 12, 46, 92),
      });
      const shade = clamp(0.92 + (plume - 0.5) * 0.16, 0.8, 1.08);
      image.data[(y * size + x) * 4] = clamp(rgb[0] * shade, 0, 255);
      image.data[(y * size + x) * 4 + 1] = clamp(rgb[1] * shade, 0, 255);
      image.data[(y * size + x) * 4 + 2] = clamp(rgb[2] * shade, 0, 255);
      image.data[(y * size + x) * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  ctx.globalCompositeOperation = "soft-light";
  for (let stream = 0; stream < 16; stream += 1) {
    const y = size * (0.08 + seeded(seed, 12000 + stream * 17) * 0.84);
    const amp = size * (0.008 + seeded(seed, 12100 + stream * 19) * 0.014);
    const cycles = 1.4 + seeded(seed, 12200 + stream * 23) * 2.8;
    ctx.strokeStyle = hsla({ h: 40, s: 24, l: 94 }, 0.09);
    ctx.lineWidth = 1.2 + seeded(seed, 12300 + stream * 29) * 1.8;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 5) {
      const px = x / size;
      const py = y + Math.sin(px * Math.PI * 2 * cycles + stream * 0.8) * amp + (fbm2D(seed + 12400 + stream, px * 4.8, stream * 0.2, 3) - 0.5) * amp * 1.4;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  CLOUDWORLD_TEXTURE_CACHE.set(cacheKey, canvas);
  return canvas;
}

function buildHyceanTexture(
  size: number,
  seed: number,
  base: HslColor,
  accent: HslColor,
  cloudCover = 0.6,
  equilibriumK?: number | null,
) {
  const cacheKey = [
    "hycean",
    size,
    seed,
    base.h,
    base.s,
    base.l,
    accent.h,
    accent.s,
    accent.l,
    cloudCover,
    equilibriumK ?? "na",
  ].join("|");
  const cached = CLOUDWORLD_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const image = ctx.createImageData(size, size);
  const deepOcean = mixColor(base, { h: 198, s: 84, l: 26 }, 0.66);
  const shelfOcean = mixColor(accent, { h: 178, s: 72, l: 56 }, 0.52);
  const cloudTone = { h: 190, s: 20, l: 95 };
  const polarIceBoost = equilibriumK !== null && equilibriumK !== undefined && equilibriumK < 280 ? smoothstep(220, 280, equilibriumK) : 0;

  for (let y = 0; y < size; y += 1) {
    const v = y / Math.max(size - 1, 1);
    const lat = v * 2 - 1;
    const absLat = Math.abs(lat);

    for (let x = 0; x < size; x += 1) {
      const u = x / Math.max(size - 1, 1);
      const current = fbm2D(seed + 601, u * 2.4, v * 2.1, 5);
      const gyre = ridgedFbm2D(seed + 661, u * 6.6, v * 4.8, 4);
      const shelf = fbm2D(seed + 719, u * 10.8, v * 8.4, 3);
      const cloud = fbm2D(seed + 773, u * 12.4, v * 8.4, 4);
      const oceanMix = clamp(current * 0.48 + gyre * 0.22 + shelf * 0.3, 0, 1);
      let rgb = hslToRgb(mixColor(deepOcean, shelfOcean, oceanMix));

      const cloudMask = smoothstep(0.54 - cloudCover * 0.12, 0.92, cloud) * clamp(0.52 + cloudCover * 0.44, 0.3, 0.92);
      rgb = mixRgb(rgb, hslToRgb(cloudTone), cloudMask * 0.52);

      const polarIce = smoothstep(0.78, 1, absLat) * (1 - polarIceBoost) * 0.16;
      if (polarIce > 0) {
        rgb = mixRgb(rgb, [234, 246, 255], polarIce);
      }

      const shade = clamp(0.9 + (gyre - 0.5) * 0.14 + (cloudMask * 0.06), 0.78, 1.1);
      image.data[(y * size + x) * 4] = clamp(rgb[0] * shade, 0, 255);
      image.data[(y * size + x) * 4 + 1] = clamp(rgb[1] * shade, 0, 255);
      image.data[(y * size + x) * 4 + 2] = clamp(rgb[2] * shade, 0, 255);
      image.data[(y * size + x) * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  ctx.globalCompositeOperation = "screen";
  for (let current = 0; current < 18; current += 1) {
    const y = size * (0.08 + seeded(seed, 13000 + current * 17) * 0.84);
    const amp = size * (0.006 + seeded(seed, 13100 + current * 19) * 0.018);
    const cycles = 1.6 + seeded(seed, 13200 + current * 23) * 3.4;
    ctx.strokeStyle = hsla({ h: 188, s: 20, l: 96 }, 0.06 + cloudCover * 0.04);
    ctx.lineWidth = 1 + seeded(seed, 13300 + current * 29) * 2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 5) {
      const px = x / size;
      const gyre = (fbm2D(seed + 13400 + current, px * 7.4, y / size * 4.2, 4) - 0.5) * amp * 2;
      const py = y + Math.sin(px * Math.PI * 2 * cycles + current * 0.7) * amp + gyre;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  CLOUDWORLD_TEXTURE_CACHE.set(cacheKey, canvas);
  return canvas;
}

function buildWrappedMapFromDisc(image: CanvasImageSource, cacheKey: string) {
  const cached = DISC_WRAP_CACHE.get(cacheKey);
  if (cached) return cached;

  const { width, height } = imageDimensions(image);
  const cropSize = Math.min(width, height);
  const cropX = (width - cropSize) / 2;
  const cropY = (height - cropSize) / 2;

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = cropSize;
  sampleCanvas.height = cropSize;
  const sampleCtx = sampleCanvas.getContext("2d");
  if (!sampleCtx) return image;
  sampleCtx.drawImage(
    image,
    cropX,
    cropY,
    cropSize,
    cropSize,
    0,
    0,
    cropSize,
    cropSize,
  );

  const source = sampleCtx.getImageData(0, 0, cropSize, cropSize);
  const outCanvas = document.createElement("canvas");
  outCanvas.width = 1024;
  outCanvas.height = 512;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) return image;
  const out = outCtx.createImageData(outCanvas.width, outCanvas.height);

  for (let y = 0; y < outCanvas.height; y += 1) {
    const lat = (0.5 - y / (outCanvas.height - 1)) * Math.PI;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);

    for (let x = 0; x < outCanvas.width; x += 1) {
      const lon = (x / (outCanvas.width - 1)) * Math.PI * 2 - Math.PI;
      const frontLon = Math.atan2(Math.sin(lon), Math.abs(Math.cos(lon)));
      const swirl = Math.sin(lat * 2.6) * 0.08;
      const sampleLon = clamp(frontLon + swirl, -Math.PI * 0.5, Math.PI * 0.5);
      const sx = cosLat * Math.sin(sampleLon);
      const sy = sinLat;
      const u = clamp(0.5 + sx * 0.492, 0, 0.99999);
      const v = clamp(0.5 - sy * 0.492, 0, 0.99999);
      const sampleX = Math.floor(u * (cropSize - 1));
      const sampleY = Math.floor(v * (cropSize - 1));
      const srcIndex = (sampleY * cropSize + sampleX) * 4;
      const outIndex = (y * outCanvas.width + x) * 4;

      out.data[outIndex] = source.data[srcIndex];
      out.data[outIndex + 1] = source.data[srcIndex + 1];
      out.data[outIndex + 2] = source.data[srcIndex + 2];
      out.data[outIndex + 3] = 255;
    }
  }

  outCtx.putImageData(out, 0, 0);
  DISC_WRAP_CACHE.set(cacheKey, outCanvas);
  return outCanvas;
}

export function materializePlanetReference(asset: ReferenceAsset, image: HTMLImageElement) {
  return asset.mode === "map" ? image : buildWrappedMapFromDisc(image, asset.src);
}

function paintReferenceTexture(
  ctx: CanvasRenderingContext2D,
  size: number,
  image: CanvasImageSource,
) {
  const { width, height } = imageDimensions(image);
  const drawHeight = size * 1.06;
  const drawWidth = (width / height) * drawHeight;
  const y = -size * 0.03;

  for (let x = -drawWidth; x <= size + drawWidth; x += drawWidth) {
    ctx.drawImage(image, x, y, drawWidth, drawHeight);
  }
}

function inferredChemistryProfile(props: PlanetGlobeProps): ChemistryProfile {
  const id = props.seedKey.trim().toLowerCase();
  const tags = (props.moleculeTags ?? []).map((tag) => tag.toUpperCase());
  const cloudiness = clamp(props.cloudCover ?? 0.4, 0, 1);
  const methane = tags.includes("CH4");
  const ammonia = tags.includes("NH3");
  const sodium = tags.includes("NA") || tags.includes("K");
  const water = tags.includes("H2O");
  const sulfur = tags.includes("SO2");
  const carbon = tags.includes("CO2") || tags.includes("CO");
  const hot = (props.daysideK ?? props.equilibriumK ?? 500) > 900;
  if (id === "jupiter") {
    return {
      bandBase: { h: 38, s: 46, l: 70 },
      bandAccent: { h: 24, s: 68, l: 55 },
      stormColor: { h: 18, s: 74, l: 50 },
      bandContrast: 1.18,
      bandVolume: 1.22,
    };
  }
  if (id === "saturn") {
    return {
      bandBase: { h: 44, s: 28, l: 80 },
      bandAccent: { h: 34, s: 34, l: 68 },
      stormColor: { h: 30, s: 26, l: 66 },
      bandContrast: 0.46,
      bandVolume: 0.54,
    };
  }
  if (id === "uranus") {
    return {
      bandBase: { h: 190, s: 40, l: 74 },
      bandAccent: { h: 196, s: 44, l: 66 },
      stormColor: { h: 186, s: 36, l: 82 },
      bandContrast: 0.24,
      bandVolume: 0.32,
    };
  }
  if (id === "neptune") {
    return {
      bandBase: { h: 206, s: 70, l: 55 },
      bandAccent: { h: 220, s: 82, l: 46 },
      stormColor: { h: 195, s: 90, l: 70 },
      bandContrast: 0.86,
      bandVolume: 0.72,
    };
  }
  if (props.regime === "saturnian") {
    return {
      bandBase: { h: 44, s: 28, l: 80 },
      bandAccent: { h: 34, s: 34, l: 68 },
      stormColor: { h: 30, s: 24, l: 70 },
      bandContrast: clamp(0.42 + (carbon ? 0.06 : 0) - cloudiness * 0.14, 0.24, 0.72),
      bandVolume: clamp(0.54 + (ammonia ? 0.06 : 0) + (water ? 0.04 : 0), 0.42, 0.84),
    };
  }
  if (props.regime === "hot-jupiter") {
    return {
      bandBase: {
        h: sodium ? 18 : sulfur ? 30 : carbon ? 22 : 16,
        s: sodium ? 82 : sulfur ? 72 : 70,
        l: 56,
      },
      bandAccent: {
        h: sulfur ? 346 : sodium ? 10 : methane ? 214 : 334,
        s: 78,
        l: methane ? 44 : 54,
      },
      stormColor: {
        h: sulfur ? 40 : sodium ? 12 : 20,
        s: 84,
        l: 64,
      },
      bandContrast: clamp(1.18 + (sodium ? 0.12 : 0) + (sulfur ? 0.08 : 0) - cloudiness * 0.12, 0.88, 1.5),
      bandVolume: clamp(1.12 + (props.radiationFluxEarth && props.radiationFluxEarth > 20 ? 0.16 : 0) + (water ? 0.04 : 0), 0.92, 1.5),
    };
  }
  if (props.regime === "gas-giant") {
    return {
      bandBase: {
        h: methane ? 204 : sulfur ? 42 : hot ? 18 : carbon ? 30 : 40,
        s: methane ? 72 : sulfur ? 68 : hot ? 82 : carbon ? 58 : 54,
        l: ammonia ? 76 : water ? 72 : hot ? 58 : 66,
      },
      bandAccent: {
        h: methane ? 216 : sodium ? 18 : sulfur ? 54 : hot ? 338 : 24,
        s: methane ? 84 : hot ? 74 : sulfur ? 72 : 66,
        l: methane ? 46 : water ? 62 : hot ? 54 : 54,
      },
      stormColor: {
        h: methane ? 194 : sulfur ? 46 : hot ? 20 : 18,
        s: methane ? 82 : 74,
        l: methane ? 68 : water ? 62 : 54,
      },
      bandContrast: clamp((hot ? 1.22 : methane ? 1.08 : 0.98) + (sodium ? 0.08 : 0) - cloudiness * 0.18, 0.52, 1.32),
      bandVolume: clamp((props.radiationFluxEarth && props.radiationFluxEarth > 5 ? 1.18 : hot ? 1.1 : 1) + (ammonia ? 0.08 : 0) + (water ? 0.06 : 0), 0.6, 1.34),
    };
  }
  if (props.regime === "hycean") {
    return {
      bandBase: {
        h: water ? 194 : methane ? 186 : props.planetColor.h,
        s: clamp(props.planetColor.s + 14 + (water ? 8 : 0), 34, 94),
        l: clamp(props.planetColor.l + 6, 28, 78),
      },
      bandAccent: {
        h: water ? 172 : methane ? 202 : props.accentColor.h,
        s: clamp(props.accentColor.s + 12, 34, 96),
        l: clamp(props.accentColor.l + 8, 28, 86),
      },
      stormColor: { h: 188, s: 36, l: 92 },
      bandContrast: clamp(0.42 + (water ? 0.08 : 0) - cloudiness * 0.08, 0.2, 0.72),
      bandVolume: clamp(0.48 + (cloudiness > 0.65 ? 0.08 : 0), 0.3, 0.82),
    };
  }
  if (props.regime === "venusian") {
    return {
      bandBase: { h: 46, s: 18, l: 84 },
      bandAccent: { h: 34, s: 44, l: 70 },
      stormColor: { h: 28, s: 24, l: 82 },
      bandContrast: 0.32,
      bandVolume: 0.44,
    };
  }
  if (props.regime === "ice-giant" || props.regime === "sub-neptune") {
    return {
      bandBase: {
        h: methane ? 202 : sulfur ? 48 : water ? 188 : props.planetColor.h,
        s: clamp((methane ? 84 : props.planetColor.s + 8) + (sulfur ? 8 : 0), 30, 96),
        l: clamp((methane ? 56 : props.planetColor.l + 8) + (water ? 4 : 0), 30, 84),
      },
      bandAccent: {
        h: methane ? 222 : sulfur ? 28 : water ? 176 : props.accentColor.h,
        s: clamp((methane ? 92 : props.accentColor.s + 10) + (carbon ? 6 : 0), 30, 98),
        l: clamp((methane ? 44 : props.accentColor.l - 2) + (water ? 3 : 0), 20, 80),
      },
      stormColor: { h: methane ? 192 : props.starColor.h, s: methane ? 62 : 30, l: methane ? 78 : 88 },
      bandContrast: clamp(0.72 + (methane ? 0.12 : 0) + (carbon ? 0.08 : 0) - cloudiness * 0.16, 0.3, 1.04),
      bandVolume: clamp(0.74 + (water ? 0.08 : 0) + (cloudiness > 0.65 ? 0.04 : 0), 0.42, 1.04),
    };
  }
  return {
    bandBase: props.planetColor,
    bandAccent: props.accentColor,
    stormColor: props.accentColor,
    bandContrast: 1,
    bandVolume: 1,
  };
}

function drawMagnetosphere(ctx: CanvasRenderingContext2D, size: number, props: PlanetGlobeProps) {
  if (!props.showMagnetosphere) return;
  const field = props.magneticFieldMicroTesla;
  const standoff = props.magnetopauseRadii;
  const flux = props.radiationFluxEarth ?? props.insolationEarth ?? 1;
  if (field === null || field === undefined || standoff === null || standoff === undefined) return;

  const centerX = size / 2;
  const centerY = size / 2;
  const planetRadius = size * 0.48;
  const fieldStrength = clamp(field / 50, 0.08, 4);
  const compression = clamp(1 / Math.pow(Math.max(flux, 0.08), 0.16), 0.42, 1.1);
  const tailStretch = clamp(Math.pow(Math.max(flux, 0.08), 0.22), 0.9, 3.2);
  const bowScale = clamp((standoff / 10) * fieldStrength, 0.72, 2.8);
  const leftExtent = planetRadius * (1.1 + bowScale * compression * 0.34);
  const rightExtent = planetRadius * (1.65 + bowScale * tailStretch * 0.9);
  const verticalExtent = planetRadius * (1.15 + bowScale * 0.42);
  const protectionTone =
    props.magneticProtection === "strong"
      ? { h: 188, s: 88, l: 68 }
      : props.magneticProtection === "moderate"
        ? { h: 196, s: 74, l: 64 }
        : props.magneticProtection === "weak"
          ? { h: 210, s: 68, l: 60 }
          : { h: 12, s: 78, l: 62 };

  ctx.save();
  ctx.lineCap = "round";
  for (let line = 0; line < 7; line += 1) {
    const t = line / 6;
    const offset = (t - 0.5) * verticalExtent * 1.45;
    const alpha = 0.1 + (1 - Math.abs(t - 0.5) * 1.7) * 0.18;
    ctx.strokeStyle = hsla(protectionTone, alpha);
    ctx.lineWidth = 1 + (1 - Math.abs(t - 0.5) * 1.5) * 1.6;
    ctx.beginPath();
    ctx.moveTo(centerX - leftExtent, centerY + offset * 0.92);
    ctx.bezierCurveTo(
      centerX - leftExtent * 0.42,
      centerY + offset * 0.2,
      centerX - planetRadius * 0.76,
      centerY + offset * 0.08,
      centerX - planetRadius * 0.98,
      centerY + offset * 0.04,
    );
    ctx.bezierCurveTo(
      centerX + planetRadius * 0.92,
      centerY + offset * 0.02,
      centerX + rightExtent * 0.34,
      centerY + offset * 0.38,
      centerX + rightExtent,
      centerY + offset * 0.24,
    );
    ctx.stroke();
  }

  const tailGradient = ctx.createLinearGradient(centerX + planetRadius * 0.2, centerY, centerX + rightExtent, centerY);
  tailGradient.addColorStop(0, hsla(protectionTone, 0.08));
  tailGradient.addColorStop(1, hsla(protectionTone, 0));
  ctx.strokeStyle = tailGradient;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(centerX + planetRadius * 0.82, centerY);
  ctx.lineTo(centerX + rightExtent, centerY);
  ctx.stroke();
  ctx.restore();
}

function paintArtisticDetail(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  props: PlanetGlobeProps,
  opacityScale = 1,
) {
  const patchCount =
    isGasRegime(props.regime) || props.regime === "hycean"
      ? 26
      : 34;

  for (let i = 0; i < patchCount; i += 1) {
    const cx = seeded(seed, i + 900) * size;
    const cy = seeded(seed, i + 930) * size;
    const rx = 10 + seeded(seed, i + 960) * ((props.regime === "gas-giant" || props.regime === "hot-jupiter" || props.regime === "saturnian") ? 42 : 28);
    const ry = 6 + seeded(seed, i + 990) * ((props.regime === "gas-giant" || props.regime === "hot-jupiter" || props.regime === "saturnian") ? 18 : 20);
    const rot = seeded(seed, i + 1020) * Math.PI + phase * 0.12;
    const tint = i % 2 === 0 ? props.accentColor : props.planetColor;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    gradient.addColorStop(0, hsla({ ...tint, l: clamp(tint.l + 10, 18, 92) }, 0.09 * opacityScale));
    gradient.addColorStop(1, hsla(tint, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }

  const wrinkleCount = isGasRegime(props.regime) ? 18 : 12;
  ctx.lineCap = "round";
  for (let i = 0; i < wrinkleCount; i += 1) {
    const baseY = size * (0.14 + seeded(seed, i + 1050) * 0.72);
    const amplitude = 2 + seeded(seed, i + 1080) * 6;
    const cycles = 1 + Math.floor(seeded(seed, i + 1110) * 4);
    const tint = i % 2 === 0 ? props.accentColor : props.planetColor;
    ctx.strokeStyle = hsla({ ...tint, l: clamp(tint.l + 12, 20, 94) }, 0.08 * opacityScale);
    ctx.lineWidth = 0.8 + seeded(seed, i + 1140) * 1.4;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 6) {
      const y = baseY + Math.sin((x / size) * Math.PI * 2 * cycles + phase * 0.45 + i * 0.6) * amplitude;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function paintPhotographicPolish(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  props: PlanetGlobeProps,
  chemistry: ChemistryProfile,
) {
  ctx.save();

  if (isGasRegime(props.regime) || props.regime === "hycean") {
    const bandTotal = Math.max(props.bandCount ?? 6, props.regime === "hycean" ? 4 : 6);
    const darkLaneColor = { h: chemistry.bandAccent.h, s: clamp(chemistry.bandAccent.s - 24, 10, 84), l: clamp(chemistry.bandAccent.l - 26, 8, 62) };
    const highlightColor = { h: chemistry.bandBase.h, s: clamp(chemistry.bandBase.s + 8, 20, 98), l: clamp(chemistry.bandBase.l + 18, 26, 94) };

    for (let band = 0; band < bandTotal; band += 1) {
      const y = size * ((band + 0.5) / bandTotal) + Math.sin(band * 0.8 + phase * 0.28) * size * 0.01;
      const bandHeight = size * (props.regime === "saturnian" ? 0.09 : props.regime === "hycean" ? 0.06 : 0.07);

      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = props.regime === "saturnian" ? 0.07 : 0.11;
      const lane = ctx.createLinearGradient(0, y - bandHeight, 0, y + bandHeight);
      lane.addColorStop(0, hsla(darkLaneColor, 0));
      lane.addColorStop(0.5, hsla(darkLaneColor, 0.9));
      lane.addColorStop(1, hsla(darkLaneColor, 0));
      ctx.fillStyle = lane;
      ctx.fillRect(0, y - bandHeight, size, bandHeight * 2);

      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = props.regime === "hot-jupiter" ? 0.14 : 0.09;
      const highlight = ctx.createLinearGradient(0, y - bandHeight * 0.84, 0, y + bandHeight * 0.84);
      highlight.addColorStop(0, hsla(highlightColor, 0));
      highlight.addColorStop(0.5, hsla(highlightColor, 0.86));
      highlight.addColorStop(1, hsla(highlightColor, 0));
      ctx.fillStyle = highlight;
      ctx.fillRect(0, y - bandHeight, size, bandHeight * 2);
    }

    const stormTotal = Math.max(props.stormCount ?? 4, props.regime === "hot-jupiter" ? 8 : props.regime === "hycean" ? 6 : 4);
    for (let i = 0; i < stormTotal; i += 1) {
      const cx = size * (0.1 + seeded(seed, 6100 + i * 19) * 0.8);
      const cy = size * (0.14 + seeded(seed, 6200 + i * 23) * 0.72);
      const radius = size * (props.regime === "hycean" ? 0.05 : 0.04 + seeded(seed, 6300 + i * 29) * 0.05);

      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = props.regime === "hot-jupiter" ? 0.16 : 0.1;
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
      glow.addColorStop(0, hsla({ ...chemistry.stormColor, l: clamp(chemistry.stormColor.l + 8, 30, 96) }, 0.92));
      glow.addColorStop(0.65, hsla(chemistry.stormColor, 0.3));
      glow.addColorStop(1, hsla(chemistry.stormColor, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const highlightColor = { h: props.planetColor.h, s: clamp(props.planetColor.s + 10, 16, 98), l: clamp(props.planetColor.l + 14, 18, 92) };
    const shadowColor = { h: props.accentColor.h, s: clamp(props.accentColor.s - 20, 8, 74), l: clamp(props.accentColor.l - 28, 6, 50) };
    const polishPasses = props.regime === "airless" ? 22 : props.regime === "lava" ? 18 : 14;

    for (let i = 0; i < polishPasses; i += 1) {
      const cx = size * seeded(seed, 7100 + i * 17);
      const cy = size * seeded(seed, 7200 + i * 19);
      const rx = size * (0.03 + seeded(seed, 7300 + i * 23) * (props.regime === "airless" ? 0.12 : 0.08));
      const ry = size * (0.02 + seeded(seed, 7400 + i * 29) * 0.05);
      const rot = seeded(seed, 7500 + i * 31) * Math.PI + phase * 0.08;

      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = props.regime === "airless" ? 0.12 : 0.08;
      const shadow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      shadow.addColorStop(0, hsla(shadowColor, 0.92));
      shadow.addColorStop(1, hsla(shadowColor, 0));
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = props.regime === "lava" ? 0.16 : 0.08;
      const light = ctx.createRadialGradient(cx - rx * 0.24, cy - ry * 0.22, 0, cx, cy, rx);
      light.addColorStop(0, hsla(highlightColor, 0.9));
      light.addColorStop(1, hsla(highlightColor, 0));
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = props.regime === "temperate" ? 0.06 : props.regime === "venusian" ? 0.04 : 0.05;
    const cinematicWash = ctx.createLinearGradient(0, size * 0.12, size, size * 0.88);
    cinematicWash.addColorStop(0, hsla({ ...highlightColor, l: clamp(highlightColor.l + 4, 20, 96) }, 0.66));
    cinematicWash.addColorStop(0.5, hsla(props.accentColor, 0.12));
    cinematicWash.addColorStop(1, hsla({ ...shadowColor, l: clamp(shadowColor.l - 6, 4, 46) }, 0.68));
    ctx.fillStyle = cinematicWash;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.restore();
}

function paintGasMicroDetail(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  base: HslColor,
  accent: HslColor,
  bandCount: number,
  coriolisStrength: number,
  contrast = 1,
  opacityScale = 1,
) {
  const filamentLines = bandCount * 5 + 18;
  ctx.lineCap = "round";

  for (let i = 0; i < filamentLines; i += 1) {
    const y = size * (0.1 + seeded(seed, i + 1400) * 0.8);
    const lat = y / size - 0.5;
    const jetDirection = lat >= 0 ? 1 : -1;
    const amplitude = 1.8 + seeded(seed, i + 1430) * 4.8;
    const cycles = 3 + Math.floor(seeded(seed, i + 1460) * 6);
    const tint = i % 2 === 0 ? accent : base;
    ctx.strokeStyle = hsla(
      {
        h: tint.h + (seeded(seed, i + 1490) - 0.5) * 12,
        s: clamp(tint.s + 10, 24, 98),
        l: clamp(tint.l + 8, 18, 94),
      },
      (0.1 + contrast * 0.08) * opacityScale,
    );
    ctx.lineWidth = 0.55 + seeded(seed, i + 1520) * 1.3;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 4) {
      const longitude = (x / size) * Math.PI * 2 * cycles;
      const wave = Math.sin(longitude + phase * (1.6 + Math.abs(lat) * 0.8) * jetDirection + i * 0.24) * amplitude;
      const crossMix = Math.cos(longitude * 0.63 - phase * 1.25 + i * 0.11) * amplitude * 0.55 * coriolisStrength;
      const py = y + wave + crossMix;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }

  const vortexCount = 20 + Math.round(bandCount * 1.1);
  for (let i = 0; i < vortexCount; i += 1) {
    const cx = size * (0.08 + seeded(seed, i + 1550) * 0.84);
    const cy = size * (0.14 + seeded(seed, i + 1580) * 0.72);
    const hemisphere = cy < size * 0.5 ? -1 : 1;
    const radius = 4 + seeded(seed, i + 1610) * 12;
    const tint = i % 2 === 0 ? accent : base;
    ctx.strokeStyle = hsla({ ...tint, l: clamp(tint.l + 14, 22, 98), s: clamp(tint.s + 10, 18, 100) }, (0.12 + contrast * 0.06) * opacityScale);
    ctx.lineWidth = 0.8 + seeded(seed, i + 1640) * 1.1;
    ctx.beginPath();
    for (let step = 0; step <= 18; step += 1) {
      const t = step / 18;
      const theta = phase * (1.1 + coriolisStrength * 0.7) * hemisphere + t * Math.PI * 2.8 * hemisphere;
      const r = radius * (1 - t * 0.7);
      const px = cx + Math.cos(theta) * r;
      const py = cy + Math.sin(theta) * r * 0.56;
      if (step === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

function paintTerrainMicroDetail(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  regime: PlanetGlobeProps["regime"],
  base: HslColor,
  accent: HslColor,
  opacityScale = 1,
) {
  const patchCount = regime === "temperate" ? 72 : regime === "lava" ? 58 : 52;
  for (let i = 0; i < patchCount; i += 1) {
    const cx = size * (0.04 + seeded(seed, i + 1700) * 0.92);
    const cy = size * (0.06 + seeded(seed, i + 1730) * 0.88);
    const rx = 2 + seeded(seed, i + 1760) * 10;
    const ry = 1 + seeded(seed, i + 1790) * 5;
    const rot = seeded(seed, i + 1820) * Math.PI;
    const tint = i % 3 === 0 ? accent : base;
    ctx.fillStyle = hsla({ ...tint, s: clamp(tint.s + 8, 10, 100), l: clamp(tint.l + 8, 18, 94) }, (regime === "lava" ? 0.2 : 0.12) * opacityScale);
    ctx.beginPath();
    ctx.ellipse(cx + Math.sin(phase * 0.8 + i * 0.12) * 2, cy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }

  const ridgeCount = regime === "lava" ? 32 : 24;
  ctx.lineCap = "round";
  for (let i = 0; i < ridgeCount; i += 1) {
    const y = size * (0.12 + seeded(seed, i + 1850) * 0.76);
    const amplitude = 2 + seeded(seed, i + 1880) * 6;
    const cycles = 2 + Math.floor(seeded(seed, i + 1910) * 4);
    const tint = regime === "lava" ? { h: 18, s: 88, l: 58 } : i % 2 === 0 ? accent : base;
    ctx.strokeStyle = hsla({ ...tint, s: clamp(tint.s + 10, 10, 100), l: clamp(tint.l + 10, 20, 96) }, (regime === "lava" ? 0.28 : 0.12) * opacityScale);
    ctx.lineWidth = regime === "lava" ? 1.6 : 0.95;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 5) {
      const py = y + Math.sin((x / size) * Math.PI * 2 * cycles + phase * 0.3 + i * 0.4) * amplitude;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
}

function paintCloudFiligree(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  cloudColor: HslColor,
  props: PlanetGlobeProps,
  coriolisStrength: number,
) {
  const cloudCover = clamp(props.cloudCover ?? 0.3, 0, 1);
  if (props.regime === "airless" || cloudCover < 0.06) return;

  const dynamics = cloudDynamicsProfile(props);
  const wisps = Math.max(2, Math.round((18 + cloudCover * 18) * 0.5 * dynamics.filigreeMultiplier));
  const terminatorBoost = terminatorPumpStrength(props) * dynamics.terminatorBias;
  const terminatorWidth = dynamics.terminatorWidth + terminatorBoost * 0.05;
  ctx.lineCap = "round";

  for (let i = 0; i < wisps; i += 1) {
    const y = size * biasedCloudLatitude(seeded(seed, i + 1960), dynamics.equatorialBias, dynamics.polarBias);
    const hemisphere = y < size * 0.5 ? -1 : 1;
    const amplitude = (3 + seeded(seed, i + 1990) * 9) * dynamics.amplitudeScale;
    const cycles = 2 + Math.floor(seeded(seed, i + 2020) * 4);
    ctx.strokeStyle = hsla(
      { ...cloudColor, l: clamp(cloudColor.l + 8, 72, 99), s: clamp(cloudColor.s - 4, 0, 16) },
      (0.03 + cloudCover * 0.04) * dynamics.filigreeMultiplier,
    );
    ctx.lineWidth = (0.9 + seeded(seed, i + 2050) * 1.2) * (0.82 + dynamics.filigreeMultiplier * 0.42);
    ctx.beginPath();
    for (let x = 0; x <= size; x += 4) {
      const u = x / size;
      const longitude = (x / size) * Math.PI * 2 * cycles;
      const jet = Math.sin(longitude + phase * (1.4 + coriolisStrength * 0.8) * hemisphere + i * 0.25) * amplitude;
      const shear = Math.cos(longitude * 0.48 - phase * 0.9 + i * 0.13) * amplitude * 0.42 * coriolisStrength;
      const fracture = (ridgedFbm2D(seed + 10620 + i, x / size * 7.8, phase * 0.18, 3) - 0.5) * amplitude * 0.8;
      const terminator =
        props.tidalLock
          ? Math.exp(-((u - dynamics.terminatorCenter) ** 2) / Math.max(0.001, terminatorWidth * terminatorWidth))
          : 0;
      const pump =
        Math.sin(u * Math.PI * 2 * (1.6 + terminatorBoost * 0.6) + phase * 0.9 + i * 0.3)
        * amplitude
        * 0.18
        * terminator
        * terminatorBoost;
      const py = y + jet + shear + fracture + pump;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
}

function paintJaggedCloudMass(
  ctx: CanvasRenderingContext2D,
  seed: number,
  phase: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  cloudColor: HslColor,
  alpha: number,
) {
  const steps = 32;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const angle = t * Math.PI * 2;
    const noise = fbm2D(seed + 9100, Math.cos(angle) * 2.4 + phase * 0.18, Math.sin(angle) * 2.4 - phase * 0.13, 4);
    const crag = ridgedFbm2D(seed + 9310, Math.cos(angle) * 5.6, Math.sin(angle) * 5.6, 3);
    const radial = 1 + (noise - 0.5) * 0.44 + (crag - 0.5) * 0.24 + Math.sin(angle * 3.0 + phase * 0.5) * 0.06;
    const px = Math.cos(angle) * rx * radial;
    const py = Math.sin(angle) * ry * (1 + (noise - 0.5) * 0.34 + (crag - 0.5) * 0.18);
    if (step === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.closePath();
  const gradient = ctx.createRadialGradient(-rx * 0.18, -ry * 0.22, rx * 0.08, 0, 0, rx * 1.08);
  gradient.addColorStop(0, hsla({ ...cloudColor, l: clamp(cloudColor.l + 8, 76, 99), s: clamp(cloudColor.s - 4, 0, 16) }, alpha));
  gradient.addColorStop(0.56, hsla({ ...cloudColor, l: clamp(cloudColor.l + 2, 72, 98), s: clamp(cloudColor.s - 8, 0, 14) }, alpha * 0.68));
  gradient.addColorStop(1, hsla(cloudColor, 0));
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.lineWidth = Math.max(0.8, rx * 0.035);
  ctx.strokeStyle = hsla({ ...cloudColor, l: clamp(cloudColor.l + 14, 80, 100), s: clamp(cloudColor.s - 10, 0, 10) }, alpha * 0.38);
  ctx.stroke();
  ctx.restore();
}

function paintFracturedCloudFront(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  bandY: number,
  thickness: number,
  cycles: number,
  cloudColor: HslColor,
  opacity: number,
  coriolisStrength: number,
  streamIndex: number,
  tidalLock = false,
  terminatorBoost = 0,
) {
  const upper: Array<{ x: number; y: number }> = [];
  const lower: Array<{ x: number; y: number }> = [];
  const terminatorWidth = 0.12 + terminatorBoost * 0.05;

  for (let x = 0; x <= size; x += 5) {
    const u = x / size;
    const longitude = u * Math.PI * 2 * cycles;
    const macro = Math.sin(longitude + phase * (1.24 + coriolisStrength * 0.78) + streamIndex * 0.72) * thickness * 0.7;
    const shear = Math.cos(longitude * 0.56 - phase * (1.06 + streamIndex * 0.05)) * thickness * 0.46 * coriolisStrength;
    const fracture = (fbm2D(seed + 9440 + streamIndex * 17, u * 8.8, streamIndex * 0.2 + phase * 0.16, 4) - 0.5) * thickness * 0.84;
    const crag = (ridgedFbm2D(seed + 9620 + streamIndex * 13, u * 16.4, streamIndex * 0.34 + phase * 0.11, 3) - 0.5) * thickness * 0.46;
    const terminator =
      tidalLock
        ? Math.exp(-((u - 0.56) ** 2) / Math.max(0.001, terminatorWidth * terminatorWidth))
        : 0;
    const pump =
      Math.sin(u * Math.PI * 2 * (1.5 + terminatorBoost * 0.85) + phase * 0.72 + streamIndex * 0.66)
      * thickness
      * 0.62
      * terminator
      * terminatorBoost;
    const localThickness = thickness * (1 + terminator * 0.55 * terminatorBoost);
    const y = bandY + macro + shear + fracture + crag + pump;
    upper.push({ x, y: y - localThickness * (0.48 + fbm2D(seed + 9800 + streamIndex, u * 7.2, phase * 0.08, 3) * 0.26) });
    lower.push({ x, y: y + localThickness * (0.36 + fbm2D(seed + 9950 + streamIndex, u * 9.6, phase * 0.09, 3) * 0.34) });
  }

  ctx.beginPath();
  upper.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  lower.reverse().forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, bandY - thickness * 1.2, 0, bandY + thickness * 1.2);
  gradient.addColorStop(0, hsla({ ...cloudColor, l: clamp(cloudColor.l + 10, 80, 100), s: clamp(cloudColor.s - 6, 0, 16) }, opacity * 0.8));
  gradient.addColorStop(0.48, hsla({ ...cloudColor, l: clamp(cloudColor.l + 4, 76, 99), s: clamp(cloudColor.s - 10, 0, 12) }, opacity));
  gradient.addColorStop(1, hsla(cloudColor, 0));
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.lineWidth = Math.max(1.2, thickness * 0.18);
  ctx.strokeStyle = hsla({ ...cloudColor, l: clamp(cloudColor.l + 16, 84, 100), s: clamp(cloudColor.s - 14, 0, 8) }, opacity * 0.44);
  ctx.stroke();
}

function terminatorPumpStrength(props: PlanetGlobeProps) {
  if (!props.tidalLock) return 0;
  const day = props.daysideK ?? props.equilibriumK ?? null;
  const night = props.nightsideK ?? props.equilibriumK ?? null;
  if (day === null || night === null) return 0.34;
  const contrast = clamp((day - night) / Math.max(day, 1), 0.08, 0.78);
  return 0.26 + contrast * 0.9;
}

function cloudLayerColor(props: PlanetGlobeProps, chemistry: ChemistryProfile): HslColor {
  const tags = (props.moleculeTags ?? []).map((tag) => tag.toUpperCase());
  const sulfur = tags.includes("SO2") || tags.includes("S2") || tags.includes("H2S");
  const ammonia = tags.includes("NH3");
  const methane = tags.includes("CH4");
  const hot = (props.daysideK ?? props.equilibriumK ?? 0) > 1200;

  switch (props.regime) {
    case "airless":
      return { h: 0, s: 0, l: 0 };
    case "lava":
      return sulfur
        ? { h: 42, s: 42, l: 76 }
        : hot
          ? { h: 24, s: 18, l: 72 }
          : { h: 34, s: 20, l: 78 };
    case "venusian":
      return { h: 46, s: 24, l: 88 };
    case "temperate":
    case "rocky":
      return { h: 0, s: 0, l: 96 };
    case "hycean":
      return { h: methane ? 192 : 200, s: methane ? 10 : 6, l: 97 };
    case "sub-neptune":
    case "ice-giant":
      return { h: methane ? 198 : 210, s: methane ? 8 : 4, l: 96 };
    case "saturnian":
      return ammonia ? { h: 46, s: 10, l: 94 } : { h: 40, s: 6, l: 95 };
    case "gas-giant":
    case "hot-jupiter":
      return {
        h: sulfur ? 42 : chemistry.bandBase.h,
        s: sulfur ? 14 : 6,
        l: sulfur ? 88 : 95,
      };
    default:
      return { h: 0, s: 0, l: 95 };
  }
}

type CloudDynamicsProfile = {
  massMultiplier: number;
  frontMultiplier: number;
  swirlMultiplier: number;
  filigreeMultiplier: number;
  amplitudeScale: number;
  frontThicknessScale: number;
  massOpacityScale: number;
  frontOpacityScale: number;
  swirlOpacityScale: number;
  equatorialBias: number;
  polarBias: number;
  terminatorBias: number;
  terminatorCenter: number;
  terminatorWidth: number;
  stretchX: number;
  stretchY: number;
};

function cloudDynamicsProfile(props: PlanetGlobeProps): CloudDynamicsProfile {
  const tags = (props.moleculeTags ?? []).map((tag) => tag.toUpperCase());
  const sulfur = tags.includes("SO2") || tags.includes("S2") || tags.includes("H2S");
  const methane = tags.includes("CH4");
  const water = tags.includes("H2O");
  const hot = (props.daysideK ?? props.equilibriumK ?? 0) > 1000;

  switch (props.regime) {
    case "hot-jupiter":
      return { massMultiplier: 0.52, frontMultiplier: 1.72, swirlMultiplier: 1.26, filigreeMultiplier: 1.12, amplitudeScale: 1.34, frontThicknessScale: 1.2, massOpacityScale: 0.82, frontOpacityScale: 1.18, swirlOpacityScale: 1.1, equatorialBias: 0.78, polarBias: 0.12, terminatorBias: props.tidalLock ? 0.88 : 0.18, terminatorCenter: 0.57, terminatorWidth: 0.11, stretchX: 1.3, stretchY: 0.62 };
    case "gas-giant":
      return { massMultiplier: 0.72, frontMultiplier: 1.42, swirlMultiplier: 1.18, filigreeMultiplier: 0.94, amplitudeScale: 1.16, frontThicknessScale: 1.08, massOpacityScale: 0.94, frontOpacityScale: 1.02, swirlOpacityScale: 1.02, equatorialBias: 0.62, polarBias: 0.18, terminatorBias: props.tidalLock ? 0.38 : 0.08, terminatorCenter: 0.56, terminatorWidth: 0.12, stretchX: 1.2, stretchY: 0.68 };
    case "saturnian":
      return { massMultiplier: 0.44, frontMultiplier: 1.56, swirlMultiplier: 0.42, filigreeMultiplier: 0.72, amplitudeScale: 0.86, frontThicknessScale: 0.86, massOpacityScale: 0.62, frontOpacityScale: 0.76, swirlOpacityScale: 0.54, equatorialBias: 0.68, polarBias: 0.1, terminatorBias: props.tidalLock ? 0.24 : 0.05, terminatorCenter: 0.56, terminatorWidth: 0.14, stretchX: 1.56, stretchY: 0.5 };
    case "ice-giant":
      return { massMultiplier: methane ? 0.38 : 0.5, frontMultiplier: 0.64, swirlMultiplier: 0.62, filigreeMultiplier: 0.48, amplitudeScale: 0.72, frontThicknessScale: 0.64, massOpacityScale: 0.72, frontOpacityScale: 0.62, swirlOpacityScale: 0.82, equatorialBias: 0.24, polarBias: methane ? 0.72 : 0.54, terminatorBias: props.tidalLock ? 0.24 : 0.04, terminatorCenter: 0.56, terminatorWidth: 0.13, stretchX: 0.92, stretchY: 0.86 };
    case "sub-neptune":
      return { massMultiplier: 0.88, frontMultiplier: 1.02, swirlMultiplier: 0.84, filigreeMultiplier: 0.78, amplitudeScale: 0.94, frontThicknessScale: 1.02, massOpacityScale: 0.96, frontOpacityScale: 0.94, swirlOpacityScale: 0.84, equatorialBias: 0.48, polarBias: methane ? 0.34 : 0.18, terminatorBias: props.tidalLock ? 0.58 : 0.1, terminatorCenter: 0.56, terminatorWidth: 0.12, stretchX: 1.14, stretchY: 0.76 };
    case "hycean":
      return { massMultiplier: 1.18, frontMultiplier: 0.94, swirlMultiplier: 1.04, filigreeMultiplier: 0.86, amplitudeScale: 1.02, frontThicknessScale: 1.1, massOpacityScale: 1.08, frontOpacityScale: 0.92, swirlOpacityScale: 1, equatorialBias: 0.58, polarBias: water ? 0.24 : 0.12, terminatorBias: props.tidalLock ? 0.94 : 0.14, terminatorCenter: 0.58, terminatorWidth: 0.14, stretchX: 1.12, stretchY: 0.84 };
    case "venusian":
      return { massMultiplier: 0.92, frontMultiplier: 1.66, swirlMultiplier: 0.3, filigreeMultiplier: 0.46, amplitudeScale: 0.82, frontThicknessScale: 1.24, massOpacityScale: 0.92, frontOpacityScale: 1.06, swirlOpacityScale: 0.24, equatorialBias: 0.82, polarBias: 0.06, terminatorBias: 0.12, terminatorCenter: 0.54, terminatorWidth: 0.16, stretchX: 1.42, stretchY: 0.58 };
    case "temperate":
      return { massMultiplier: 0.82, frontMultiplier: 1.12, swirlMultiplier: 0.84, filigreeMultiplier: 0.76, amplitudeScale: 0.94, frontThicknessScale: 0.92, massOpacityScale: 0.92, frontOpacityScale: 0.92, swirlOpacityScale: 0.82, equatorialBias: 0.12, polarBias: 0.16, terminatorBias: props.tidalLock ? 0.62 : 0.06, terminatorCenter: 0.57, terminatorWidth: 0.13, stretchX: 1.04, stretchY: 0.92 };
    case "rocky":
      return { massMultiplier: 0.7, frontMultiplier: 0.94, swirlMultiplier: 0.7, filigreeMultiplier: 0.62, amplitudeScale: 0.82, frontThicknessScale: 0.88, massOpacityScale: 0.82, frontOpacityScale: 0.82, swirlOpacityScale: 0.74, equatorialBias: 0.08, polarBias: 0.12, terminatorBias: props.tidalLock ? 0.56 : 0.05, terminatorCenter: 0.57, terminatorWidth: 0.13, stretchX: 0.98, stretchY: 0.94 };
    case "desert":
      return { massMultiplier: 0.42, frontMultiplier: 0.72, swirlMultiplier: 0.34, filigreeMultiplier: 0.56, amplitudeScale: 0.72, frontThicknessScale: 0.72, massOpacityScale: 0.54, frontOpacityScale: 0.58, swirlOpacityScale: 0.42, equatorialBias: 0.28, polarBias: 0.08, terminatorBias: props.tidalLock ? 0.42 : 0.05, terminatorCenter: 0.58, terminatorWidth: 0.11, stretchX: 1.18, stretchY: 0.66 };
    case "lava":
      return { massMultiplier: sulfur || hot ? 0.32 : 0.24, frontMultiplier: 0.46, swirlMultiplier: 0.22, filigreeMultiplier: 0.2, amplitudeScale: 0.68, frontThicknessScale: 0.54, massOpacityScale: 0.46, frontOpacityScale: 0.44, swirlOpacityScale: 0.28, equatorialBias: 0.08, polarBias: 0.04, terminatorBias: props.tidalLock ? 1.08 : 0.22, terminatorCenter: 0.61, terminatorWidth: 0.1, stretchX: 0.84, stretchY: 1.08 };
    default:
      return { massMultiplier: 0.7, frontMultiplier: 1, swirlMultiplier: 0.7, filigreeMultiplier: 0.6, amplitudeScale: 0.9, frontThicknessScale: 0.9, massOpacityScale: 0.8, frontOpacityScale: 0.8, swirlOpacityScale: 0.8, equatorialBias: 0.16, polarBias: 0.08, terminatorBias: props.tidalLock ? 0.5 : 0.05, terminatorCenter: 0.56, terminatorWidth: 0.12, stretchX: 1, stretchY: 0.88 };
  }
}

function biasedCloudLatitude(raw: number, equatorialBias: number, polarBias: number) {
  let centered = raw * 2 - 1;
  if (equatorialBias > 0) {
    centered *= 1 - equatorialBias * 0.58;
  }
  if (polarBias > 0) {
    centered = Math.sign(centered || 1) * Math.pow(Math.abs(centered), Math.max(0.58, 1 - polarBias * 0.46));
  }
  return clamp(0.5 + centered * 0.5, 0.04, 0.96);
}

function paintBands(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  base: HslColor,
  accent: HslColor,
  bandCount: number,
  stormCount: number,
  coriolisStrength: number,
  eddyStrength: number,
  bandContrast = 1,
  bandVolume = 1,
  stormTint: HslColor = accent,
) {
  const stripeHeight = size / (bandCount + 2);
  for (let band = 0; band < bandCount; band += 1) {
    const y = stripeHeight * (band + 1);
    const amplitude = (8 + seeded(seed, band) * 14) * bandVolume;
    const cycles = 1 + Math.floor(seeded(seed, band + 8) * 3);
    const jetDirection = band % 2 === 0 ? 1 : -1;
    const lat = y / size - 0.5;
    const hue = (band % 2 === 0 ? base.h : accent.h) + (seeded(seed, band + 22) - 0.5) * 8;
    const sat = clamp((band % 2 === 0 ? base.s : accent.s) + seeded(seed, band + 14) * 14 * bandContrast, 28, 92);
    const light = clamp((band % 2 === 0 ? base.l : accent.l) + (seeded(seed, band + 31) - 0.5) * 18 * bandContrast, 24, 82);

    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${0.68 + Math.min(0.18, bandContrast * 0.08)})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 8) {
      const longitude = (x / size) * Math.PI * 2 * cycles;
      const shear = Math.sin(phase * (0.7 + Math.abs(lat) * 0.8) * jetDirection + band * 0.9) * amplitude * 0.42 * coriolisStrength;
      const wave = Math.sin(longitude + phase + band * 0.9 + shear * 0.05) * amplitude;
      const eddyMix = Math.cos(longitude * 0.55 + phase * (1.1 + band * 0.02)) * amplitude * 0.18 * eddyStrength;
      ctx.lineTo(x, y + wave + eddyMix * Math.sign(lat || 1));
    }
    ctx.lineTo(size, y + stripeHeight * 0.9);
    ctx.lineTo(0, y + stripeHeight * 0.9);
    ctx.closePath();
    ctx.fill();
  }

  for (let storm = 0; storm < stormCount; storm += 1) {
    const x = seeded(seed, storm + 90) * size;
    const y = size * (0.18 + seeded(seed, storm + 120) * 0.64);
    const rx = 8 + seeded(seed, storm + 160) * 24;
    const ry = 4 + seeded(seed, storm + 190) * 12;
    const rot = seeded(seed, storm + 210) * Math.PI;
    const color = storm % 2 === 0 ? stormTint : base;
    ctx.fillStyle = hsla({ ...color, l: clamp(color.l + 8, 24, 90) }, 0.24 + bandContrast * 0.04);
    ctx.beginPath();
    ctx.ellipse(x + Math.sin(phase + storm) * 10 * coriolisStrength, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }

  const eddyCount = Math.max(4, Math.round(stormCount * (1.4 + eddyStrength)));
  for (let eddy = 0; eddy < eddyCount; eddy += 1) {
    const cx = size * (0.14 + seeded(seed, eddy + 340) * 0.72);
    const cy = size * (0.18 + seeded(seed, eddy + 372) * 0.64);
    const hemisphere = cy < size * 0.5 ? -1 : 1;
    const spin = hemisphere * (eddy % 2 === 0 ? 1 : -1);
    const radius = 10 + seeded(seed, eddy + 401) * 22;
    const color = eddy % 2 === 0 ? accent : base;
    ctx.strokeStyle = hsla({ ...color, l: clamp(color.l + 10, 24, 92) }, 0.12 + eddyStrength * 0.1);
    ctx.lineWidth = 1.4 + eddyStrength * 1.2;
    ctx.beginPath();
    for (let step = 0; step <= 22; step += 1) {
      const t = step / 22;
      const swirl = phase * (0.7 + coriolisStrength * 0.8) * spin + t * Math.PI * 2.4 * spin;
      const r = radius * (1 - t * 0.72);
      const px = cx + Math.cos(swirl) * r;
      const py = cy + Math.sin(swirl) * r * (0.55 + coriolisStrength * 0.18);
      if (step === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

void paintBands;

function paintJetFilaments(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  base: HslColor,
  accent: HslColor,
  bandCount: number,
  coriolisStrength: number,
  eddyStrength: number,
  opacityScale = 1,
) {
  const stripeHeight = size / (bandCount + 2);
  for (let band = 0; band < bandCount; band += 1) {
    const bandCenter = stripeHeight * (band + 1.45);
    const lat = bandCenter / size - 0.5;
    const jetDirection = band % 2 === 0 ? 1 : -1;
    const filamentCount = 2 + Math.round(seeded(seed, band + 470) * 2);

    for (let filament = 0; filament < filamentCount; filament += 1) {
      const color = filament % 2 === 0 ? accent : base;
      const hue = color.h + (seeded(seed, band * 13 + filament + 510) - 0.5) * 10;
      const sat = clamp(color.s + 8 + seeded(seed, band * 9 + filament + 540) * 18, 30, 96);
      const light = clamp(color.l + 4 + (filament - 1) * 3, 24, 90);
      const offset = (filament - (filamentCount - 1) / 2) * (stripeHeight * 0.18);
      const amplitude = 5 + seeded(seed, band * 17 + filament + 580) * 9;
      const cycles = 2 + Math.floor(seeded(seed, band * 11 + filament + 610) * 4);

      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${(0.18 + eddyStrength * 0.12) * opacityScale})`;
      ctx.lineWidth = 1.1 + eddyStrength * 1.5;
      ctx.beginPath();

      for (let x = 0; x <= size; x += 6) {
        const longitude = (x / size) * Math.PI * 2 * cycles;
        const meander = Math.sin(longitude + phase * (1.1 + Math.abs(lat) * 1.6) * jetDirection + filament * 1.2) * amplitude;
        const vorticalShift = Math.cos(longitude * 0.56 - phase * (1.4 + band * 0.03) + band * 0.8) * amplitude * 0.62 * coriolisStrength;
        const y = bandCenter + offset + meander + vorticalShift * Math.sign(lat || 1);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.stroke();
    }
  }
}

function paintRockySurface(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  seedKey: string,
  regime: PlanetGlobeProps["regime"],
  base: HslColor,
  accent: HslColor,
  densityGcc?: number | null,
  equilibriumK?: number | null,
) {
  const airless =
    regime === "airless"
    || seedKey.trim().toLowerCase() === "mercury"
    || (regime === "rocky" && (equilibriumK ?? 0) > 320 && (densityGcc ?? 0) > 4.8);
  const terrain =
    airless
      ? buildAirlessTerrainTexture(size, seed, base, accent, equilibriumK)
      : regime === "temperate"
        ? buildTemperateTerrainTexture(size, seed, base, accent, densityGcc, equilibriumK)
        : regime === "desert"
          ? buildDesertTerrainTexture(size, seed, base, accent, densityGcc, equilibriumK)
          : regime === "lava"
            ? buildLavaTerrainTexture(size, seed, base, accent, densityGcc, equilibriumK)
            : buildRockyTerrainTexture(size, seed, base, accent, densityGcc, equilibriumK);
  ctx.drawImage(terrain, 0, 0, size, size);

  if (regime === "lava") {
    ctx.strokeStyle = "rgba(255, 132, 64, 0.54)";
    ctx.lineWidth = 2.6;
    for (let crack = 0; crack < 7; crack += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 20; step += 1) {
        const x = (step / 20) * size;
        const y = size * (0.12 + crack * 0.11) + Math.sin(step * 0.7 + crack + phase * 0.35) * 8;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

function paintClouds(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  phase: number,
  cloudCover: number,
  cloudColor: HslColor,
  props: PlanetGlobeProps,
  coriolisStrength: number,
) {
  const regime = props.regime;
  if (regime === "airless" || cloudCover < 0.06) return;

  const gasRegime = isGasRegime(regime);
  const dynamics = cloudDynamicsProfile(props);
  const terminatorBoost = terminatorPumpStrength(props) * dynamics.terminatorBias;
  const count = gasRegime
    ? Math.round(8 + cloudCover * 10)
    : regime === "venusian" || regime === "hycean"
      ? Math.round(9 + cloudCover * 11)
      : Math.round(5 + cloudCover * 8);
  const cloudMassCount = Math.max(1, Math.round(count * dynamics.massMultiplier));

  for (let i = 0; i < cloudMassCount; i += 1) {
    const cy = size * biasedCloudLatitude(seeded(seed, i + 230), dynamics.equatorialBias, dynamics.polarBias);
    const hemisphere = cy < size * 0.5 ? -1 : 1;
    const terminatorCenter = size * dynamics.terminatorCenter;
    const terminatorWidth = size * (dynamics.terminatorWidth + terminatorBoost * 0.06);
    const cxBase = seeded(seed, i + 200) * size;
    const cx = props.tidalLock
      ? terminatorCenter + (seeded(seed, i + 211) - 0.5) * terminatorWidth * 2.1
      : cxBase + Math.sin(phase * (0.8 + coriolisStrength * 0.6) + i * 0.7) * 12 * (1 + coriolisStrength * 0.5);
    const rx = (18 + seeded(seed, i + 260) * 82) * dynamics.stretchX;
    const ry = (gasRegime ? 8 + seeded(seed, i + 290) * 20 : regime === "venusian" ? 14 + seeded(seed, i + 290) * 22 : 10 + seeded(seed, i + 290) * 28) * dynamics.stretchY;
    const rot = seeded(seed, i + 320) * Math.PI + hemisphere * coriolisStrength * 0.35;
    paintJaggedCloudMass(
      ctx,
      seed + i * 37,
      phase,
      cx,
      cy,
      rx,
      ry,
      rot,
      cloudColor,
      ((gasRegime ? 0.22 : 0.28) + cloudCover * (regime === "venusian" || regime === "hycean" ? 0.24 : 0.18)) * dynamics.massOpacityScale,
    );
  }

  const jetStreamCount =
    regime === "temperate" || regime === "rocky"
      ? Math.max(3, Math.round(2 + cloudCover * 5))
      : regime === "venusian"
        ? Math.max(5, Math.round(4 + cloudCover * 7))
      : Math.max(4, Math.round(3 + cloudCover * 6));
  const frontCount = Math.max(1, Math.round(jetStreamCount * dynamics.frontMultiplier));
  for (let stream = 0; stream < frontCount; stream += 1) {
    const bandY = size * biasedCloudLatitude(0.16 + seeded(seed, stream + 780) * 0.68, dynamics.equatorialBias, dynamics.polarBias);
    const hemisphere = bandY < size * 0.5 ? -1 : 1;
    const spin = hemisphere * (stream % 2 === 0 ? 1 : -1);
    const amplitude = (4 + seeded(seed, stream + 812) * 9) * dynamics.amplitudeScale;
    const cycles = 1 + Math.floor(seeded(seed, stream + 844) * (regime === "venusian" ? 2 : 3)) + (regime === "venusian" ? 1 : 0);
    paintFracturedCloudFront(
      ctx,
      size,
      seed + stream * 71,
      phase * (1 + Math.abs(spin) * 0.08),
      bandY,
      amplitude * (gasRegime ? 0.52 : 0.68) * dynamics.frontThicknessScale,
      cycles,
      cloudColor,
      ((gasRegime ? 0.14 : 0.18) + cloudCover * 0.12) * dynamics.frontOpacityScale,
      coriolisStrength,
      stream,
      props.tidalLock,
      terminatorBoost,
    );
  }

  const swirlCount = Math.max(0, Math.round(count * (0.45 + coriolisStrength * 0.35) * dynamics.swirlMultiplier));
  for (let swirl = 0; swirl < swirlCount; swirl += 1) {
    const cx = size * (props.tidalLock
      ? dynamics.terminatorCenter + (seeded(seed, swirl + 680) - 0.5) * dynamics.terminatorWidth * 1.5
      : 0.16 + seeded(seed, swirl + 680) * 0.68);
    const cy = size * biasedCloudLatitude(0.18 + seeded(seed, swirl + 712) * 0.64, dynamics.equatorialBias, dynamics.polarBias);
    const hemisphere = cy < size * 0.5 ? -1 : 1;
    const spin = hemisphere * (swirl % 2 === 0 ? 1 : -1);
    const radius = 18 + seeded(seed, swirl + 744) * 34;
    const alpha = (0.08 + cloudCover * 0.14) * dynamics.swirlOpacityScale;

    ctx.strokeStyle = hsla({ ...cloudColor, l: clamp(cloudColor.l + 4, 40, 94) }, alpha);
    ctx.lineWidth = 1.8 + cloudCover * 1.9;
    ctx.beginPath();

    for (let step = 0; step <= 30; step += 1) {
      const t = step / 30;
      const theta = phase * (0.8 + coriolisStrength * 0.7) * spin + t * Math.PI * (2.2 + cloudCover * 1.1) * spin;
      const r = radius * (1 - t * 0.76);
      const jag =
        (ridgedFbm2D(seed + 10840 + swirl, t * 7.8, phase * 0.1 + swirl * 0.17, 3) - 0.5) * radius * 0.18
        + (fbm2D(seed + 10990 + swirl, t * 13.6, phase * 0.12 + swirl * 0.22, 3) - 0.5) * radius * 0.12;
      const px = cx + Math.cos(theta) * (r + jag);
      const py = cy + Math.sin(theta) * (r + jag * 0.6) * (0.58 + coriolisStrength * 0.24);
      if (step === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.stroke();
  }
}

function circulationProfile(props: PlanetGlobeProps, time: number) {
  const phase = props.tidalLock ? 0 : (time / Math.max(props.rotationSeconds ?? 30, 1)) * Math.PI * 2;
  let coriolisStrength = props.tidalLock ? 0.16 : 0.42;
  let eddyStrength = 0.24;

  switch (props.regime) {
    case "hot-jupiter":
      coriolisStrength = props.tidalLock ? 0.48 : 1;
      eddyStrength = 0.86;
      break;
    case "gas-giant":
      coriolisStrength = props.tidalLock ? 0.38 : 0.9;
      eddyStrength = 0.78;
      break;
    case "saturnian":
      coriolisStrength = props.tidalLock ? 0.34 : 0.74;
      eddyStrength = 0.58;
      break;
    case "ice-giant":
      coriolisStrength = props.tidalLock ? 0.34 : 0.72;
      eddyStrength = 0.62;
      break;
    case "sub-neptune":
      coriolisStrength = props.tidalLock ? 0.32 : 0.72;
      eddyStrength = 0.62;
      break;
    case "hycean":
      coriolisStrength = props.tidalLock ? 0.28 : 0.56;
      eddyStrength = 0.56;
      break;
    case "venusian":
      coriolisStrength = props.tidalLock ? 0.18 : 0.26;
      eddyStrength = 0.32;
      break;
    case "temperate":
      coriolisStrength = props.tidalLock ? 0.16 : 0.44;
      eddyStrength = 0.48;
      break;
    case "airless":
      coriolisStrength = 0.08;
      eddyStrength = 0.04;
      break;
    default:
      break;
  }

  return { phase, coriolisStrength, eddyStrength };
}

function paintPlanetSurface(
  ctx: CanvasRenderingContext2D,
  size: number,
  time: number,
  props: PlanetGlobeProps,
  seed: number,
  referenceImage?: CanvasImageSource | null,
) {
  const { phase, coriolisStrength, eddyStrength } = circulationProfile(props, time);
  const useEarthReference = shouldUseEarthReference(props.seedKey) && !!referenceImage;
  const hasReferenceBase = isDirectDisplayReferencePlanet(props.seedKey) && !!referenceImage;
  const referenceCalibration = !useEarthReference && referenceImage ? analyzeReferenceImage(referenceImage) : null;
  const calibratedPlanetColor = referenceCalibration ? mixColor(props.planetColor, referenceCalibration.avg, 0.34) : props.planetColor;
  const calibratedAccentColor = referenceCalibration ? mixColor(props.accentColor, referenceCalibration.accent, 0.3) : props.accentColor;
  const renderProps = referenceCalibration
    ? { ...props, planetColor: calibratedPlanetColor, accentColor: calibratedAccentColor }
    : props;
  const chemistry = inferredChemistryProfile(renderProps);
  const dayColor = {
    h: (renderProps.planetColor.h * 0.72 + renderProps.starColor.h * 0.28 + 360) % 360,
    s: clamp(renderProps.planetColor.s + 10, 32, 98),
    l: clamp(renderProps.planetColor.l + 10, 26, 88),
  };
  const midColor = {
    h: renderProps.planetColor.h,
    s: clamp(renderProps.planetColor.s + 6, 30, 96),
    l: clamp(renderProps.planetColor.l, 20, 76),
  };
  const nightColor = {
    h: renderProps.accentColor.h,
    s: clamp(renderProps.accentColor.s + 4, 24, 92),
    l: clamp(renderProps.accentColor.l - 26, 8, 54),
  };
  const underpaintMultiply =
    props.regime === "airless"
      ? 0.08
      : props.regime === "venusian"
        ? 0.06
        : props.regime === "saturnian"
          ? 0.04
          : props.regime === "hot-jupiter"
            ? 0.035
            : props.regime === "gas-giant"
              ? 0.04
              : props.regime === "ice-giant" || props.regime === "sub-neptune"
                ? 0.03
                : props.regime === "hycean"
                  ? 0.02
                  : props.regime === "temperate"
                    ? 0.018
                    : props.regime === "desert"
                      ? 0.04
                      : props.regime === "lava"
                        ? 0.024
                        : 0.028;
  const underpaintSoftLight = underpaintMultiply * 0.55;
  const underpaintOverlay = underpaintMultiply * 0.35;
  if (hasReferenceBase) {
    paintReferenceTexture(ctx, size, referenceImage!);
  } else {
    const baseGradient = ctx.createRadialGradient(size * 0.28, size * 0.24, size * 0.05, size / 2, size / 2, size * 0.72);
    baseGradient.addColorStop(0, hsla(dayColor, 1));
    baseGradient.addColorStop(0.36, hsla(midColor, 1));
    baseGradient.addColorStop(1, hsla(nightColor, 1));
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, size, size);

    const chromaWash = ctx.createLinearGradient(0, size * 0.06, size, size * 0.94);
    chromaWash.addColorStop(0, hsla({ ...renderProps.starColor, s: clamp(renderProps.starColor.s - 18, 24, 96), l: 84 }, 0.12));
    chromaWash.addColorStop(0.45, hsla({ ...renderProps.accentColor, l: clamp(renderProps.accentColor.l + 8, 20, 88) }, 0.06));
    chromaWash.addColorStop(1, hsla({ ...renderProps.accentColor, l: clamp(renderProps.accentColor.l - 18, 8, 62) }, 0.16));
    ctx.fillStyle = chromaWash;
    ctx.fillRect(0, 0, size, size);
  }
  if (!hasReferenceBase && referenceCalibration && referenceImage) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = underpaintMultiply;
    paintReferenceTexture(ctx, size, referenceImage);
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = underpaintSoftLight;
    paintReferenceTexture(ctx, size, referenceImage);
    if (underpaintOverlay > 0.012) {
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = underpaintOverlay;
      paintReferenceTexture(ctx, size, referenceImage);
    }
    ctx.restore();
  }
  if (hasReferenceBase) {
    const chromaWash = ctx.createLinearGradient(0, size * 0.08, size, size * 0.92);
    chromaWash.addColorStop(0, hsla({ ...renderProps.starColor, s: clamp(renderProps.starColor.s - 12, 18, 96), l: 88 }, useEarthReference ? 0.04 : 0.08));
    chromaWash.addColorStop(0.5, hsla({ ...renderProps.planetColor, s: clamp(renderProps.planetColor.s + 10, 24, 98), l: clamp(renderProps.planetColor.l + 2, 20, 88) }, useEarthReference ? 0.02 : 0.12));
    chromaWash.addColorStop(1, hsla({ ...renderProps.accentColor, l: clamp(renderProps.accentColor.l - 18, 10, 72) }, useEarthReference ? 0.08 : 0.16));
    ctx.fillStyle = chromaWash;
    ctx.fillRect(0, 0, size, size);
  }

  if (!useEarthReference) {
    switch (props.regime) {
      case "hot-jupiter":
      case "saturnian":
      case "gas-giant":
        ctx.drawImage(buildGasGiantTexture(size, seed, renderProps, chemistry), 0, 0, size, size);
        paintJetFilaments(ctx, size, seed, phase, chemistry.bandBase, chemistry.bandAccent, renderProps.bandCount ?? (renderProps.regime === "hot-jupiter" ? 13 : renderProps.regime === "saturnian" ? 7 : 11), coriolisStrength, eddyStrength, renderProps.regime === "saturnian" ? 0.16 : 0.28);
        paintGasMicroDetail(ctx, size, seed, phase, chemistry.bandBase, chemistry.bandAccent, renderProps.bandCount ?? (renderProps.regime === "hot-jupiter" ? 13 : renderProps.regime === "saturnian" ? 7 : 11), coriolisStrength, chemistry.bandContrast, renderProps.regime === "saturnian" ? 0.12 : 0.22);
        break;
      case "ice-giant":
        ctx.drawImage(buildIceGiantTexture(size, seed, renderProps, chemistry), 0, 0, size, size);
        paintJetFilaments(ctx, size, seed, phase * 0.6, chemistry.bandBase, chemistry.bandAccent, renderProps.bandCount ?? 8, coriolisStrength, eddyStrength, 0.22);
        paintGasMicroDetail(ctx, size, seed, phase * 0.6, chemistry.bandBase, chemistry.bandAccent, renderProps.bandCount ?? 8, coriolisStrength, chemistry.bandContrast, 0.16);
        break;
      case "hycean":
        ctx.drawImage(buildHyceanTexture(size, seed, renderProps.planetColor, renderProps.accentColor, renderProps.cloudCover ?? 0.6, renderProps.equilibriumK), 0, 0, size, size);
        paintJetFilaments(ctx, size, seed, phase * 0.52, chemistry.bandBase, chemistry.bandAccent, renderProps.bandCount ?? 4, coriolisStrength, eddyStrength, 0.12);
        break;
      case "venusian":
        ctx.drawImage(buildVenusianTexture(size, seed, renderProps.planetColor, renderProps.accentColor, renderProps.equilibriumK), 0, 0, size, size);
        break;
      case "sub-neptune":
        ctx.drawImage(buildSubNeptuneTexture(size, seed, renderProps, chemistry), 0, 0, size, size);
        paintJetFilaments(ctx, size, seed, phase * 0.75, chemistry.bandBase, chemistry.bandAccent, renderProps.bandCount ?? 9, coriolisStrength, eddyStrength, 0.18);
        paintGasMicroDetail(ctx, size, seed, phase * 0.75, chemistry.bandBase, chemistry.bandAccent, renderProps.bandCount ?? 9, coriolisStrength, chemistry.bandContrast, 0.14);
        break;
      default:
        paintRockySurface(ctx, size, seed, phase, renderProps.seedKey, renderProps.regime, renderProps.planetColor, renderProps.accentColor, renderProps.densityGcc, renderProps.equilibriumK);
        paintTerrainMicroDetail(ctx, size, seed, phase, renderProps.regime, renderProps.planetColor, renderProps.accentColor, renderProps.regime === "lava" ? 0.7 : 0.22);
        break;
    }
  }

  paintArtisticDetail(
    ctx,
    size,
    seed,
    phase,
    renderProps,
    useEarthReference
      ? 0.22
      : renderProps.regime === "venusian"
        ? 0.14
        : renderProps.regime === "hycean"
          ? 0.18
          : isRockyRegime(renderProps.regime)
            ? 0.24
            : 0.32,
  );

  paintPhotographicPolish(
    ctx,
    size,
    seed,
    phase,
    renderProps,
    chemistry,
  );

  paintClouds(
    ctx,
    size,
    seed,
    phase,
    renderProps.cloudCover ?? 0.3,
    cloudLayerColor(renderProps, chemistry),
    renderProps,
    coriolisStrength,
  );
  paintCloudFiligree(
    ctx,
    size,
    seed,
    phase,
    cloudLayerColor(renderProps, chemistry),
    renderProps,
    coriolisStrength,
  );
}

export function renderPlanetSurface(
  ctx: CanvasRenderingContext2D,
  size: number,
  time: number,
  props: PlanetGlobeProps,
  referenceImage?: CanvasImageSource | null,
) {
  if (typeof document === "undefined") {
    ctx.clearRect(0, 0, size, size);
    paintPlanetSurface(ctx, size, time, props, hashSeed(props.seedKey), referenceImage);
    return;
  }

  const scratchCanvas = getSurfaceScratchCanvas(size);
  const scratchCtx = scratchCanvas.getContext("2d");
  if (!scratchCtx) {
    ctx.clearRect(0, 0, size, size);
    paintPlanetSurface(ctx, size, time, props, hashSeed(props.seedKey), referenceImage);
    return;
  }

  scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratchCtx.globalCompositeOperation = "source-over";
  scratchCtx.filter = "none";
  scratchCtx.clearRect(0, 0, size, size);
  paintPlanetSurface(scratchCtx, size, time, props, hashSeed(props.seedKey), referenceImage);

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.filter = surfaceGradeFilter(props);
  ctx.drawImage(scratchCanvas, 0, 0, size, size);
  ctx.restore();
}

function drawPlanet(
  ctx: CanvasRenderingContext2D,
  size: number,
  time: number,
  props: PlanetGlobeProps,
  surfaceMap?: CanvasImageSource | null,
  directMapImage?: CanvasImageSource | null,
  directMapMode?: "map" | "disc" | null,
) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
  ctx.clip();

  const normalizedLongitude = props.viewLongitude !== undefined
    ? ((props.viewLongitude % 1) + 1) % 1
    : null;
  const normalizedLatitude = props.viewLatitude !== undefined
    ? clamp(props.viewLatitude, 0, 1)
    : 0.5;
  const verticalShift = (0.5 - normalizedLatitude) * size * 0.12;

  const useDirectMap = !!directMapImage;
  if (useDirectMap) {
    const { width, height } = imageDimensions(directMapImage);
    if (directMapMode === "map") {
      const drawHeight = size * 1.14;
      const drawWidth = (width / height) * drawHeight;
      const baseOffset = normalizedLongitude !== null
        ? size * 0.5 - normalizedLongitude * drawWidth
        : -((props.tidalLock ? 0 : ((time / Math.max(props.rotationSeconds ?? 30, 1)) * drawWidth) % drawWidth));
      const y = (size - drawHeight) * 0.5 + verticalShift;
      for (let x = baseOffset - drawWidth; x <= size + drawWidth; x += drawWidth) {
        ctx.drawImage(directMapImage, x, y, drawWidth, drawHeight);
      }
    } else {
      const cropSize = Math.min(width, height);
      const cropInset = cropSize * 0.08;
      const sampleSize = cropSize - cropInset * 2;
      const cropX = (width - cropSize) * 0.5 + cropInset;
      const cropY = (height - cropSize) * 0.5 + cropInset;
      const drawSize = size * 1.24;
      const panRange = (drawSize - size) * 0.42;
      const sweep = panRange * 2;
      const dx = normalizedLongitude !== null
        ? (size - drawSize) * 0.5 + lerp(panRange, -panRange, normalizedLongitude)
        : (size - drawSize) * 0.5 + panRange - (props.tidalLock ? panRange : ((time / Math.max(props.rotationSeconds ?? 30, 1)) * sweep) % sweep);
      const dy = (size - drawSize) * 0.5 + verticalShift * 0.8;
      ctx.drawImage(directMapImage, cropX, cropY, sampleSize, sampleSize, dx, dy, drawSize, drawSize);
    }
  } else {
    const drawSize = size * 1.14;
    const baseOffset = normalizedLongitude !== null
      ? size * 0.5 - normalizedLongitude * drawSize
      : -((props.tidalLock ? 0 : ((time / Math.max(props.rotationSeconds ?? 30, 1)) * drawSize) % drawSize));
    const y = (size - drawSize) * 0.5 + verticalShift;
    if (surfaceMap) {
      for (let x = baseOffset - drawSize; x <= size + drawSize; x += drawSize) {
        ctx.drawImage(surfaceMap, x, y, drawSize, drawSize);
      }
    }
  }

  const lightX = props.lightDirectionX ?? -0.72;
  const lightY = props.lightDirectionY ?? -0.26;
  const startX = size * (0.5 - lightX * 0.44);
  const startY = size * (0.5 - lightY * 0.34);
  const endX = size * (0.5 + lightX * 0.44);
  const endY = size * (0.5 + lightY * 0.34);
  const lightOverlay = ctx.createLinearGradient(startX, startY, endX, endY);
  lightOverlay.addColorStop(0, hsla({ ...props.starColor, l: 92, s: clamp(props.starColor.s - 10, 20, 96) }, props.regime === "lava" ? 0.16 : 0.2));
  lightOverlay.addColorStop(0.24, hsla({ ...props.planetColor, l: clamp(props.planetColor.l + 18, 24, 90) }, 0.08));
  lightOverlay.addColorStop(0.56, "rgba(0,0,0,0.02)");
  lightOverlay.addColorStop(1, hsla({ ...props.accentColor, l: clamp(props.accentColor.l - 26, 6, 48) }, 0.34));
  ctx.fillStyle = lightOverlay;
  ctx.fillRect(0, 0, size, size);

  ctx.restore();

  const rim = ctx.createRadialGradient(size / 2, size / 2, size * 0.36, size / 2, size / 2, size * 0.5);
  rim.addColorStop(0.8, "rgba(0,0,0,0)");
  rim.addColorStop(1, hsla({ ...props.accentColor, l: clamp(props.accentColor.l + 6, 20, 90) }, 0.24));
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  drawMagnetosphere(ctx, size, props);
}

export function PlanetGlobe(props: PlanetGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const calibrationImageRef = useRef<CanvasImageSource | null>(null);
  const directImageRef = useRef<CanvasImageSource | null>(null);
  const directReferenceAsset = useMemo(
    () =>
      resolvePlanetReferenceAsset({
        seedKey: props.seedKey,
        regime: props.regime,
        equilibriumK: props.equilibriumK,
        densityGcc: props.densityGcc,
      }),
    [props.seedKey, props.regime, props.equilibriumK, props.densityGcc],
  );
  const calibrationAsset = useMemo(
    () =>
      resolvePlanetCalibrationAsset({
        seedKey: props.seedKey,
        regime: props.regime,
        equilibriumK: props.equilibriumK,
        densityGcc: props.densityGcc,
      }),
    [props.seedKey, props.regime, props.equilibriumK, props.densityGcc],
  );

  useEffect(() => {
    if (!calibrationAsset) {
      calibrationImageRef.current = null;
      return undefined;
    }
    let cancelled = false;
    const image = new Image();
    image.src = calibrationAsset.src;
    image.onload = () => {
      if (!cancelled) calibrationImageRef.current = image;
    };
    return () => {
      cancelled = true;
      calibrationImageRef.current = null;
    };
  }, [calibrationAsset]);

  useEffect(() => {
    if (!directReferenceAsset) {
      directImageRef.current = null;
      return undefined;
    }
    let cancelled = false;
    const image = new Image();
    image.src = directReferenceAsset.src;
    image.onload = () => {
      if (!cancelled) directImageRef.current = image;
    };
    return () => {
      cancelled = true;
      directImageRef.current = null;
    };
  }, [directReferenceAsset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const surfaceCanvas = document.createElement("canvas");
    surfaceCanvas.width = canvas.width * 2;
    surfaceCanvas.height = canvas.height * 2;
    surfaceCanvasRef.current = surfaceCanvas;
    const surfaceCtx = surfaceCanvas.getContext("2d");
    if (!surfaceCtx) return undefined;

    let frameId = 0;
    const size = canvas.width;
    const surfaceSize = surfaceCanvas.width;
    const start = performance.now();

    const render = (now: number) => {
      const time = (now - start) / 1000;
      renderPlanetSurface(surfaceCtx, surfaceSize, time, props, calibrationImageRef.current);
      drawPlanet(ctx, size, time, props, surfaceCanvasRef.current, directImageRef.current, directReferenceAsset?.mode ?? null);
      frameId = requestAnimationFrame(render);
    };

    render(start);
    return () => {
      cancelAnimationFrame(frameId);
      surfaceCanvasRef.current = null;
    };
  }, [props, calibrationAsset, directReferenceAsset]);

  return (
    <>
      <style jsx>{`
        @keyframes twinkling {
          0%,
          100% {
            opacity: 0.18;
          }
          50% {
            opacity: 0.95;
          }
        }
      `}</style>
      <div className={cn("relative flex min-h-[18rem] items-center justify-center overflow-hidden rounded-[1.5rem]", props.className)}>
        <div className="absolute left-[8%] top-[10%] h-20 w-20 rounded-full blur-3xl" style={{ background: hsla(props.starColor, 0.24) }} />
        <div className="absolute right-[8%] top-[16%] h-1 w-1 rounded-full bg-white/70" style={{ animation: "twinkling 3s ease-in-out infinite" }} />
        <div className="absolute left-[12%] top-[22%] h-1 w-1 rounded-full bg-white/70" style={{ animation: "twinkling 2.2s ease-in-out infinite" }} />
        <div className="absolute right-[20%] bottom-[22%] h-1 w-1 rounded-full bg-white/70" style={{ animation: "twinkling 4.2s ease-in-out infinite" }} />
        <div className="absolute left-[18%] bottom-[14%] h-1 w-1 rounded-full bg-white/70" style={{ animation: "twinkling 1.8s ease-in-out infinite" }} />

        <div className="relative h-[15rem] w-[15rem] rounded-full">
          <div
            className="absolute inset-[-4%] rounded-full"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${hsla(props.accentColor, 0.18)} 0%, ${hsla(props.accentColor, 0.1)} 44%, transparent 72%)`,
              filter: "blur(18px)",
            }}
          />
          <div
            className="absolute inset-[3%] overflow-hidden rounded-full border border-white/8"
            style={{
              boxShadow: [
                `0 0 20px ${hsla(props.accentColor, 0.14)}`,
                `0 0 42px ${hsla(props.starColor, 0.08)}`,
                "20px 2px 24px rgba(0,0,0,0.34) inset",
                "52px 0 38px rgba(0,0,0,0.38) inset",
                "-10px 0 16px rgba(255,255,255,0.06) inset",
              ].join(", "),
            }}
          >
            <canvas ref={canvasRef} width={512} height={512} className="h-full w-full" />
          </div>
        </div>
      </div>
    </>
  );
}
