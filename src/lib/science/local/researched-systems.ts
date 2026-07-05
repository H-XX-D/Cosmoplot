import { readFile } from "node:fs/promises";
import path from "node:path";

// Researched systems: the local deep-dive analyses (formation, interior
// structure, long-term evolution, magnetosphere) committed to the repo so they
// are available in production. This manifest drives the "researched" flag and
// the researched-systems plotter buttons; numeric truth stays the NASA archive.
export type ResearchedSystem = {
  system: string;
  planets: string[];
  summary: string;
  files: string[];
};

const MANIFEST_PATH = path.join(process.cwd(), "data", "science", "analyses", "researched-systems.json");

type Loaded = {
  planetNames: string[];
  byPlanet: Map<string, ResearchedSystem>;
  systems: ResearchedSystem[];
};

let cache: Loaded | null = null;

function normalize(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function load(): Promise<Loaded> {
  if (cache) return cache;
  const empty: Loaded = { planetNames: [], byPlanet: new Map(), systems: [] };
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as { planetNames: string[]; systems: ResearchedSystem[] };
    const byPlanet = new Map<string, ResearchedSystem>();
    for (const system of parsed.systems) {
      for (const planet of system.planets) byPlanet.set(normalize(planet), system);
    }
    cache = { planetNames: parsed.planetNames, byPlanet, systems: parsed.systems };
  } catch {
    cache = empty;
  }
  return cache;
}

export async function getResearchedPlanetNames(): Promise<string[]> {
  return (await load()).planetNames;
}

// Synchronous lookup map for the snapshot post-pass (prefetch with load()).
export async function getResearchedPlanetSummaryMap(): Promise<Map<string, string>> {
  const { byPlanet } = await load();
  const map = new Map<string, string>();
  for (const [key, system] of byPlanet) map.set(key, system.summary);
  return map;
}

export function researchedPlanetKey(name: string) {
  return normalize(name);
}

const ANALYSES_DIR = path.join(process.cwd(), "data", "science", "analyses");

// Full deep-dive narrative for a researched planet's system: the committed
// analysis files (formation, interior structure, evolution, magnetosphere)
// concatenated, for the maximal-analysis card. Reads from the repo, so it works
// in production; returns null for non-researched targets.
export async function getResearchedNarrative(planetName: string): Promise<string | null> {
  const { byPlanet } = await load();
  const system = byPlanet.get(normalize(planetName));
  if (!system) return null;
  const dir = path.join(ANALYSES_DIR, system.system);
  const order = (file: string) =>
    /INTERIOR/i.test(file) ? 0 : /FORMATION/i.test(file) ? 1 : /MAGNETO|CHEMISTRY/i.test(file) ? 2 : /EVOLUTION/i.test(file) ? 3 : 4;
  const files = [...system.files].filter((f) => f.endsWith(".md")).sort((a, b) => order(a) - order(b));
  const parts: string[] = [];
  for (const file of files) {
    try {
      const text = (await readFile(path.join(dir, file), "utf8")).trim();
      if (text) {
        const heading = file.replace(/\.md$/i, "").replace(/_/g, " ");
        parts.push(`===== ${heading} =====\n\n${text}`);
      }
    } catch {
      // Skip files that cannot be read.
    }
  }
  return parts.length ? parts.join("\n\n") : null;
}
