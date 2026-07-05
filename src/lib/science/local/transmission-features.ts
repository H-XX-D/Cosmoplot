import { readFile } from "node:fs/promises";
import path from "node:path";

// Per-planet transmission-spectrum feature summary, committed to the repo so
// the atmosphere inference works in production. Derived from the JWST-era
// transmission sample: peak-to-trough feature amplitude, wavelength span, and
// detected molecules per planet.
export type TransmissionFeature = {
  nPoints: number;
  minDepthPpm: number;
  maxDepthPpm: number;
  amplitudePpm: number;
  minWavelengthUm: number;
  maxWavelengthUm: number;
  molecules: string[];
};

const FEATURES_PATH = path.join(process.cwd(), "data", "science", "spectra", "transmission_features.json");

let cache: Map<string, TransmissionFeature> | null = null;

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function loadFeatures(): Promise<Map<string, TransmissionFeature>> {
  if (cache) return cache;
  const map = new Map<string, TransmissionFeature>();
  try {
    const raw = await readFile(FEATURES_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, TransmissionFeature>;
    for (const [name, feature] of Object.entries(parsed)) {
      map.set(normalizeName(name), feature);
    }
  } catch {
    // No committed feature table available; inference is simply skipped.
  }
  cache = map;
  return map;
}

export async function getTransmissionFeature(planetName: string): Promise<TransmissionFeature | null> {
  if (!planetName) return null;
  const map = await loadFeatures();
  return map.get(normalizeName(planetName)) ?? null;
}

const POINTS_PATH = path.join(process.cwd(), "data", "science", "spectra", "spectra-points.json");
let pointsCache: Map<string, Array<[number, number]>> | null = null;

// Per-planet reduced transmission spectrum: [wavelength_um, transit_depth_ppm]
// points, committed to the repo for the spectrum chart on researched targets.
export async function getSpectrumPoints(planetName: string): Promise<Array<[number, number]> | null> {
  if (!planetName) return null;
  if (!pointsCache) {
    const map = new Map<string, Array<[number, number]>>();
    try {
      const parsed = JSON.parse(await readFile(POINTS_PATH, "utf8")) as Record<string, Array<[number, number]>>;
      for (const [name, points] of Object.entries(parsed)) map.set(normalizeName(name), points);
    } catch {
      // No committed spectrum points.
    }
    pointsCache = map;
  }
  return pointsCache.get(normalizeName(planetName)) ?? null;
}
