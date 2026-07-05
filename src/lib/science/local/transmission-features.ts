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

export type ReducedSpectrum = {
  instrument: string;
  points: Array<[number, number]>;
};

const POINTS_PATH = path.join(process.cwd(), "data", "science", "spectra", "spectra-points.json");
let pointsCache: Map<string, ReducedSpectrum> | null = null;

// Real reduced JWST/archive transmission spectrum for a planet (wavelength_um,
// reduced transit signal), committed to the repo for the spectrum chart.
export async function getSpectrumPoints(planetName: string): Promise<ReducedSpectrum | null> {
  if (!planetName) return null;
  if (!pointsCache) {
    const map = new Map<string, ReducedSpectrum>();
    try {
      const parsed = JSON.parse(await readFile(POINTS_PATH, "utf8")) as Record<string, ReducedSpectrum>;
      for (const [name, spectrum] of Object.entries(parsed)) {
        if (spectrum?.points?.length) map.set(normalizeName(name), spectrum);
      }
    } catch {
      // No committed reduced spectra.
    }
    pointsCache = map;
  }
  return pointsCache.get(normalizeName(planetName)) ?? null;
}
