import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import type {
  LocalAnalysisBundle,
  LocalAnalysisReport,
  LocalAnalysisSummary,
  SourceDescriptor,
} from "@/lib/science/types";

const LEGACY_ROOT = "/Users/hendrixx./Desktop/EXOPLANET_ANALYSES";
const LEGACY_INDEX_PATH = path.join(LEGACY_ROOT, "index.html");
const LEGACY_REGISTRY_PATH = path.join(LEGACY_ROOT, "site/cosmoplot/science_registry.js");
const JWST_VERBOSE_PLANET_ROOT = "/Users/hendrixx./Desktop/jwst_exoplanets/verbose_analyses/planets";
const JWST_VERBOSE_STAR_ROOT = "/Users/hendrixx./Desktop/jwst_exoplanets/verbose_analyses/stars";
const LOCAL_SOURCE_LABEL = "Local EXOPLANET_ANALYSES bundle";

type LegacyStar = {
  name?: string;
  spectralType?: string;
  temperatureK?: number;
  massSolar?: number;
  radiusSolar?: number;
  luminositySolar?: number;
  ageGyr?: number;
  metallicityDex?: number;
  activityLevel?: string;
};

export type LegacyPlanetEntry = {
  name: string;
  systemName?: string;
  star?: LegacyStar;
  physical?: {
    massEarth?: number;
    radiusEarth?: number;
    densityGcc?: number;
    gravityMs2?: number;
  };
  orbital?: {
    periodDays?: number;
    semiMajorAxisAu?: number;
    eccentricity?: number;
    dayLengthDays?: number;
    orderFromStar?: number;
    tidallyLocked?: boolean;
  };
  temperatures?: {
    equilibriumK?: number;
    daysideK?: number;
    nightsideK?: number;
  };
  radiation?: {
    fluxWm2?: number;
    fluxEarthMultiple?: number;
  };
  magnetosphere?: {
    surfaceFieldMicroTesla?: number;
    magnetopauseRadii?: number;
    protected?: boolean;
    strength?: string | number;
  };
  composition?: {
    type?: string;
  };
  atmosphere?: {
    detected?: boolean;
    type?: string;
    molecules?: string[];
  };
  spectrum?: {
    bundlePointCount?: number;
    databasePointCount?: number;
    moleculeTags?: string[];
    jwstInstrumentLabels?: string[];
  };
  habitability?: string;
  docs?: Record<string, string>;
};

export type LegacySystemEntry = {
  name: string;
  planetKeys?: string[];
  distanceFromEarthLy?: number;
  star?: LegacyStar;
  spectralCoverage?: {
    allMinUm?: number;
    allMaxUm?: number;
    jwstInstruments?: string[];
  };
  docs?: Record<string, string>;
  archive?: {
    docs?: Record<string, string>;
  };
};

type LegacySpectrumSource = {
  planetName?: string;
  specType?: string;
  authors?: string;
  instrument?: string;
  facility?: string;
  numDatapoints?: number;
  wavelengthMinUm?: number;
  wavelengthMaxUm?: number;
  bibcode?: string;
  adsUrl?: string;
  specPath?: string;
  isJWST?: boolean;
  docs?: {
    label?: string;
    url?: string;
  };
};

type LegacyRegistryRaw = {
  SCIENCE_REGISTRY_VERSION?: string;
  SCIENCE_PLANET_MAP?: Record<string, LegacyPlanetEntry>;
  SCIENCE_SYSTEM_MAP?: Record<string, LegacySystemEntry>;
  SCIENCE_SPECTRA_SOURCE_MAP?: Record<string, LegacySpectrumSource[]>;
};

type LegacyRegistry = {
  version: string | null;
  planetsByKey: Map<string, LegacyPlanetEntry>;
  systemsByKey: Map<string, LegacySystemEntry>;
  spectraByPlanetKey: Map<string, LegacySpectrumSource[]>;
};

type LegacyStudiedPlanet = {
  name: string;
  systemName: string;
  starType: string | null;
  planetClass: string | null;
  jwstPriority: string | null;
};

type LegacyStudiedSystem = {
  name: string;
  starTypes: string[];
  planetNames: string[];
};

type LegacyStudiedCatalog = {
  planetsByKey: Map<string, LegacyStudiedPlanet>;
  systemsByKey: Map<string, LegacyStudiedSystem>;
};

let registryCache: { mtimeMs: number; value: LegacyRegistry } | null = null;
let systemFolderCache: Map<string, string> | null = null;
let studiedCatalogCache: { mtimeMs: number; value: LegacyStudiedCatalog } | null = null;

function scienceKey(input: string | null | undefined) {
  return String(input || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function asString(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const text = asString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    deduped.push(text);
  }
  return deduped;
}

function isInterestingHabitability(text: string | null) {
  if (!text) return false;
  return !/^\s*(none|no\b|n\/a|unknown|unresolved)/i.test(text);
}

async function loadLegacyStudiedCatalog() {
  const stat = await fs.stat(LEGACY_INDEX_PATH);
  if (studiedCatalogCache && studiedCatalogCache.mtimeMs === stat.mtimeMs) {
    return studiedCatalogCache.value;
  }

  const source = await fs.readFile(LEGACY_INDEX_PATH, "utf8");
  const match = source.match(/const PLANETS = \[([\s\S]*?)\];\s*const CLASS_COLORS/);
  const planetArraySource = match?.[1] ?? null;
  if (!planetArraySource) {
    const emptyCatalog: LegacyStudiedCatalog = {
      planetsByKey: new Map(),
      systemsByKey: new Map(),
    };
    studiedCatalogCache = { mtimeMs: stat.mtimeMs, value: emptyCatalog };
    return emptyCatalog;
  }

  const sandbox = { module: { exports: [] as Array<Record<string, unknown>> } };
  const script = new vm.Script(`module.exports = [${planetArraySource}];`, { filename: LEGACY_INDEX_PATH });
  script.runInNewContext(sandbox);
  const rows = sandbox.module.exports ?? [];

  const planetsByKey = new Map<string, LegacyStudiedPlanet>();
  const systemsByKey = new Map<string, LegacyStudiedSystem>();

  for (const row of rows) {
    const name = asString(row.name);
    const systemName = asString(row.star);
    if (!name || !systemName) continue;
    const studiedPlanet: LegacyStudiedPlanet = {
      name,
      systemName,
      starType: asString(row.starType),
      planetClass: asString(row.pClass),
      jwstPriority: asString(row.jwst),
    };
    planetsByKey.set(scienceKey(name), studiedPlanet);

    const systemKey = scienceKey(systemName);
    const existingSystem = systemsByKey.get(systemKey);
    if (existingSystem) {
      existingSystem.planetNames.push(name);
      if (studiedPlanet.starType && !existingSystem.starTypes.includes(studiedPlanet.starType)) {
        existingSystem.starTypes.push(studiedPlanet.starType);
      }
    } else {
      systemsByKey.set(systemKey, {
        name: systemName,
        planetNames: [name],
        starTypes: studiedPlanet.starType ? [studiedPlanet.starType] : [],
      });
    }
  }

  const catalog: LegacyStudiedCatalog = {
    planetsByKey,
    systemsByKey,
  };
  studiedCatalogCache = { mtimeMs: stat.mtimeMs, value: catalog };
  return catalog;
}

function legacyStudiedReason(studiedPlanet: LegacyStudiedPlanet | null | undefined) {
  if (!studiedPlanet) return null;
  const details = [studiedPlanet.planetClass, studiedPlanet.jwstPriority ? `JWST ${studiedPlanet.jwstPriority}` : null].filter(Boolean);
  return details.length ? `Legacy studied target · ${details.join(" · ")}` : "Legacy studied target";
}

function fallbackPlanetSummary(
  planetName: string,
  systemName: string | null,
  studiedPlanet: LegacyStudiedPlanet | null,
): LocalAnalysisSummary | null {
  if (!studiedPlanet && !systemName) return null;
  return {
    sourceLabel: LOCAL_SOURCE_LABEL,
    registryVersion: null,
    systemName: systemName ?? studiedPlanet?.systemName ?? null,
    studied: !!studiedPlanet,
    studiedPlanetCount: studiedPlanet ? 1 : null,
    interesting: !!studiedPlanet,
    interestingReason: legacyStudiedReason(studiedPlanet),
    habitability: null,
    activityLevel: null,
    compositionType: studiedPlanet?.planetClass ?? null,
    atmosphereType: null,
    moleculeTags: [],
    jwstInstrumentLabels: [],
    spectralCoverage: {
      minUm: null,
      maxUm: null,
    },
    fluxEarthMultiple: null,
    surfaceFieldMicroTesla: null,
    magnetopauseRadii: null,
  };
}

function fallbackSystemSummary(systemName: string, studiedSystem: LegacyStudiedSystem | null): LocalAnalysisSummary | null {
  if (!studiedSystem) return null;
  return {
    sourceLabel: LOCAL_SOURCE_LABEL,
    registryVersion: null,
    systemName,
    studied: true,
    studiedPlanetCount: studiedSystem.planetNames.length,
    interesting: true,
    interestingReason: `Legacy studied system · ${studiedSystem.planetNames.length} planet${studiedSystem.planetNames.length === 1 ? "" : "s"}`,
    habitability: null,
    activityLevel: null,
    compositionType: null,
    atmosphereType: null,
    moleculeTags: [],
    jwstInstrumentLabels: [],
    spectralCoverage: {
      minUm: null,
      maxUm: null,
    },
    fluxEarthMultiple: null,
    surfaceFieldMicroTesla: null,
    magnetopauseRadii: null,
  };
}

function summaryFromPlanetEntry(
  entry: LegacyPlanetEntry,
  registryVersion: string | null,
  spectralSources?: LegacySpectrumSource[],
  studiedPlanet?: LegacyStudiedPlanet | null,
): LocalAnalysisSummary {
  const jwstInstrumentLabels = uniqueStrings([
    ...(entry.spectrum?.jwstInstrumentLabels ?? []),
    ...((spectralSources ?? []).filter((source) => source.isJWST).map((source) => source.instrument ?? null)),
  ]);
  const moleculeTags = uniqueStrings([
    ...(entry.spectrum?.moleculeTags ?? []),
    ...(entry.atmosphere?.molecules ?? []),
  ]);

  const reasons = uniqueStrings([
    isInterestingHabitability(entry.habitability ?? null) ? entry.habitability ?? null : null,
    jwstInstrumentLabels.length ? `JWST ${jwstInstrumentLabels.slice(0, 2).join(", ")}` : null,
    moleculeTags.length ? `Molecules ${moleculeTags.slice(0, 4).join(", ")}` : null,
  ]);

  const wavelengthMin = spectralSources?.length
    ? Math.min(...spectralSources.map((source) => asNumber(source.wavelengthMinUm)).filter((value): value is number => value !== null))
    : null;
  const wavelengthMax = spectralSources?.length
    ? Math.max(...spectralSources.map((source) => asNumber(source.wavelengthMaxUm)).filter((value): value is number => value !== null))
    : null;

  return {
    sourceLabel: LOCAL_SOURCE_LABEL,
    registryVersion,
    systemName: entry.systemName ?? null,
    studied: !!studiedPlanet,
    studiedPlanetCount: studiedPlanet ? 1 : null,
    interesting: !!studiedPlanet || reasons.length > 0,
    interestingReason: reasons[0] ?? legacyStudiedReason(studiedPlanet),
    habitability: entry.habitability ?? null,
    activityLevel: entry.star?.activityLevel ?? null,
    compositionType: entry.composition?.type ?? null,
    atmosphereType: entry.atmosphere?.type ?? null,
    moleculeTags,
    jwstInstrumentLabels,
    spectralCoverage: {
      minUm: Number.isFinite(wavelengthMin) ? wavelengthMin : null,
      maxUm: Number.isFinite(wavelengthMax) ? wavelengthMax : null,
    },
    fluxEarthMultiple: asNumber(entry.radiation?.fluxEarthMultiple),
    surfaceFieldMicroTesla: asNumber(entry.magnetosphere?.surfaceFieldMicroTesla),
    magnetopauseRadii: asNumber(entry.magnetosphere?.magnetopauseRadii),
  };
}

function summaryFromSystemEntry(
  entry: LegacySystemEntry,
  planetSummaries: LocalAnalysisSummary[],
  registryVersion: string | null,
  studiedSystem?: LegacyStudiedSystem | null,
): LocalAnalysisSummary {
  const jwstInstrumentLabels = uniqueStrings([
    ...(entry.spectralCoverage?.jwstInstruments ?? []),
    ...planetSummaries.flatMap((summary) => summary.jwstInstrumentLabels),
  ]);
  const studiedPlanetCount =
    studiedSystem?.planetNames.length
    ?? planetSummaries.reduce((count, summary) => count + (summary.studiedPlanetCount ?? 0), 0)
    ?? null;
  const habitabilitySummary = planetSummaries.find((summary) => isInterestingHabitability(summary.habitability))?.habitability ?? null;
  const interestingReason =
    habitabilitySummary
    ?? (studiedPlanetCount ? `Legacy studied system · ${studiedPlanetCount} planet${studiedPlanetCount === 1 ? "" : "s"}` : null)
    ?? (jwstInstrumentLabels.length ? `JWST ${jwstInstrumentLabels.slice(0, 2).join(", ")}` : null)
    ?? planetSummaries.find((summary) => summary.interestingReason)?.interestingReason
    ?? null;

  return {
    sourceLabel: LOCAL_SOURCE_LABEL,
    registryVersion,
    systemName: entry.name,
    studied: !!studiedPlanetCount,
    studiedPlanetCount: studiedPlanetCount || null,
    interesting: !!interestingReason,
    interestingReason,
    habitability: habitabilitySummary,
    activityLevel: entry.star?.activityLevel ?? null,
    compositionType: null,
    atmosphereType: null,
    moleculeTags: uniqueStrings(planetSummaries.flatMap((summary) => summary.moleculeTags)),
    jwstInstrumentLabels,
    spectralCoverage: {
      minUm: asNumber(entry.spectralCoverage?.allMinUm),
      maxUm: asNumber(entry.spectralCoverage?.allMaxUm),
    },
    fluxEarthMultiple: null,
    surfaceFieldMicroTesla: null,
    magnetopauseRadii: null,
  };
}

async function loadLegacyRegistry() {
  const stat = await fs.stat(LEGACY_REGISTRY_PATH);
  if (registryCache && registryCache.mtimeMs === stat.mtimeMs) {
    return registryCache.value;
  }

  const source = await fs.readFile(LEGACY_REGISTRY_PATH, "utf8");
  const sandbox = {
    module: { exports: {} as LegacyRegistryRaw },
    exports: {},
  };

  const script = new vm.Script(
    `${source}\nmodule.exports = { SCIENCE_REGISTRY_VERSION, SCIENCE_PLANET_MAP, SCIENCE_SYSTEM_MAP, SCIENCE_SPECTRA_SOURCE_MAP };`,
    { filename: LEGACY_REGISTRY_PATH },
  );
  script.runInNewContext(sandbox);

  const raw = sandbox.module.exports;
  const planetsByKey = new Map<string, LegacyPlanetEntry>();
  const systemsByKey = new Map<string, LegacySystemEntry>();
  const spectraByPlanetKey = new Map<string, LegacySpectrumSource[]>();

  for (const [key, entry] of Object.entries(raw.SCIENCE_PLANET_MAP ?? {})) {
    const normalizedKeys = uniqueStrings([key, entry.name, entry.systemName ? `${entry.systemName} ${entry.name}` : null]);
    for (const normalized of normalizedKeys.map((value) => scienceKey(value))) {
      if (normalized) planetsByKey.set(normalized, entry);
    }
  }

  for (const [key, entry] of Object.entries(raw.SCIENCE_SYSTEM_MAP ?? {})) {
    const normalizedKeys = uniqueStrings([key, entry.name, entry.star?.name]);
    for (const normalized of normalizedKeys.map((value) => scienceKey(value))) {
      if (normalized) systemsByKey.set(normalized, entry);
    }
  }

  for (const [key, entries] of Object.entries(raw.SCIENCE_SPECTRA_SOURCE_MAP ?? {})) {
    const normalized = scienceKey(key);
    if (normalized) spectraByPlanetKey.set(normalized, entries ?? []);
    for (const entry of entries ?? []) {
      const nameKey = scienceKey(entry.planetName);
      if (nameKey) {
        spectraByPlanetKey.set(nameKey, [...(spectraByPlanetKey.get(nameKey) ?? []), entry]);
      }
    }
  }

  const registry = {
    version: asString(raw.SCIENCE_REGISTRY_VERSION),
    planetsByKey,
    systemsByKey,
    spectraByPlanetKey,
  } satisfies LegacyRegistry;

  registryCache = {
    mtimeMs: stat.mtimeMs,
    value: registry,
  };
  return registry;
}

async function getSystemFolderMap() {
  if (systemFolderCache) return systemFolderCache;
  const entries = await fs.readdir(LEGACY_ROOT, { withFileTypes: true });
  const folders = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith("_System")) continue;
    const systemName = entry.name.replace(/_System$/, "");
    folders.set(scienceKey(systemName), path.join(LEGACY_ROOT, entry.name));
  }
  systemFolderCache = folders;
  return folders;
}

function classifyReport(fileName: string) {
  const matches: Array<{ key: string; label: string; priority: number }> = [
    { key: "QUICK_REFERENCE", label: "Quick Reference", priority: 0 },
    { key: "COMPLETE_SYSTEM_ANALYSIS", label: "Complete System Analysis", priority: 1 },
    { key: "INTERIOR_STRUCTURE_AND_CHEMISTRY", label: "Interior Structure and Chemistry", priority: 2 },
    { key: "MAGNETOSPHERE_RADIATION_CHEMISTRY", label: "Magnetosphere, Radiation, and Chemistry", priority: 3 },
    { key: "FORMATION_AND_COMPARATIVE_ANALYSIS", label: "Formation and Comparative Analysis", priority: 4 },
    { key: "LONG_TERM_EVOLUTION", label: "Long-Term Evolution", priority: 5 },
  ];
  const match = matches.find((entry) => fileName.toUpperCase().includes(entry.key));
  return match ?? { key: fileName, label: fileName, priority: 99 };
}

async function loadPlanetReports(planetName: string, systemName: string | null) {
  const reports: Array<LocalAnalysisReport & { priority: number }> = [];
  const planetKey = scienceKey(planetName);

  if (systemName) {
    const folders = await getSystemFolderMap();
    const folder = folders.get(scienceKey(systemName));
    if (folder) {
      const entries = await fs.readdir(folder, { withFileTypes: true });
      reports.push(
        ...entries
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .filter((fileName) => scienceKey(fileName).includes(planetKey))
          .filter((fileName) => /\.(md|txt)$/i.test(fileName))
          .map((fileName) => {
            const info = classifyReport(fileName);
            return {
              label: info.label,
              filename: fileName,
              path: path.join(folder, fileName),
              priority: info.priority,
            };
          }),
      );
    }
  }

  const fallbackRoots: Array<{ root: string; label: string; priority: number; matchKey: string }> = [
    { root: JWST_VERBOSE_PLANET_ROOT, label: "Verbose Planet Analysis", priority: 6, matchKey: planetKey },
    { root: JWST_VERBOSE_STAR_ROOT, label: "Verbose Host Star Analysis", priority: 7, matchKey: systemName ? scienceKey(systemName) : "" },
  ];

  for (const fallback of fallbackRoots) {
    if (!fallback.matchKey) continue;
    try {
      const entries = await fs.readdir(fallback.root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !/\.(txt|md)$/i.test(entry.name)) continue;
        if (!scienceKey(entry.name).includes(fallback.matchKey)) continue;
        reports.push({
          label: fallback.label,
          filename: entry.name,
          path: path.join(fallback.root, entry.name),
          priority: fallback.priority,
        });
      }
    } catch {
      // Ignore missing fallback directories on machines that do not have the verbose bundle.
    }
  }

  return reports
    .sort((left, right) => left.priority - right.priority || left.filename.localeCompare(right.filename))
    .filter((report, index, all) => all.findIndex((candidate) => candidate.path === report.path) === index)
    .map(({ label, filename, path: reportPath }) => ({
      label,
      filename,
      path: reportPath,
    }));
}

function sanitizeLegacyNarrative(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const annotateSectionHeading = (heading: string) => {
    const normalized = heading.toUpperCase();
    let basis = "Legacy local narrative section; read with the structured claim basis and provenance appendix.";
    if (/OBSERVATIONAL DATA SOURCES|OBSERVATION|DISCOVERY|SPECTROSCOPY|DATA SOURCE/.test(normalized)) {
      basis = "Source-bound section; prioritize cited references and measured values in this block.";
    } else if (/FUNDAMENTAL PHYSICAL CONSTANTS|CONSTANTS USED|REFERENCE BODIES/.test(normalized)) {
      basis = "Standards/constants section; values here are reference inputs rather than target-specific observations.";
    } else if (/CALCULATION|DERIVED|DENSITY|GRAVITY|FLUX|TEMPERATURE|ORBIT|SCALE HEIGHT|SIGNAL|MAGNETIC|MAGNETOSPHERE|ESCAPE|RETENTION/.test(normalized)) {
      basis = "Derived-physics section; treat equations and outputs as model-dependent calculations tied to the loaded inputs.";
    } else if (/INTERPRETATION|COMMENTARY|HABITABILITY|ASSESSMENT|IMPLICATION|SYNTHESIS|CONCLUSION/.test(normalized)) {
      basis = "Interpretation section; use it downstream of the source-bound and derived sections rather than as a primary measurement.";
    }
    return `${heading}\n[SECTION BASIS: ${basis}]`;
  };

  return trimmed
    .replace(/-{40,}\s*SECTION\s+\d+:\s+RAW JSON SNAPSHOT\s+\[O(?:\/I)?\][\s\S]*?(?=(?:-{40,}\s*SECTION\s+\d+:)|$)/gi, "")
    .replace(/\bBinding Energy Framework\b/g, "Legacy Retention Framework")
    .replace(/\bbinding energy\b/gi, "retention-energy proxy")
    .replace(/\batmospheric binding\b/gi, "atmospheric retention proxy")
    .replace(/\bbinding ratio\b/gi, "retention proxy ratio")
    .replace(/\bretention-energy proxy Ratio\b/g, "retention proxy ratio")
    .replace(/\bE_B\/E_th\b/g, "retention proxy ratio")
    .replace(/\bbound atmosphere\b/gi, "retained-atmosphere outcome proxy")
    .replace(/\bdefinitive proof\b/gi, "strong model-dependent support")
    .replace(/\bdefinitively detect\b/gi, "strongly constrain")
    .replace(/\bfirst observational proof of\b/gi, "early observational support for")
    .replace(/\bconfirmed water clouds\b/gi, "water-cloud interpretation candidate")
    .replace(/\bconfirmed organic tholins\b/gi, "organic-haze interpretation candidate")
    .replace(/\bconfirmed by JWST observations\b/gi, "listed in the local analysis as JWST-observed")
    .replace(/\bJWST Observations:\s*All predictions confirmed\b/gi, "JWST observations: several framework expectations were reported as consistent with the cited data")
    .replace(/\bAll framework predictions confirmed\b/gi, "Multiple framework expectations were reported as consistent with the cited data")
    .replace(/\bAll predictions confirmed\b/gi, "Several framework expectations were reported as consistent with the cited data")
    .replace(/\bframework predictions confirmed\b/gi, "framework expectations were reported as consistent with the cited data")
    .replace(/\bpredicted and confirmed\b/gi, "predicted and later reported as broadly consistent")
    .replace(/\bValidation of Theory\b/g, "Support for the underlying interpretation")
    .replace(/\bAll framework predictions validated\b/gi, "Multiple framework expectations were reported as consistent with the cited data")
    .replace(/\bAll predictions validated\b/gi, "Several framework expectations were reported as consistent with the cited data")
    .replace(/\bframework predictions validated\b/gi, "framework expectations were reported as consistent with the cited data")
    .replace(/\bFramework Validation\b/gi, "Framework-consistency note")
    .replace(/\bframework validated\b/gi, "framework interpreted locally as broadly consistent with the cited data")
    .replace(/\bvalidated by JWST observations\b/gi, "reported as broadly consistent with the cited JWST observations")
    .replace(/\bvalidates the Binding Energy Framework\b/gi, "is presented locally as consistent with the binding-energy interpretation")
    .replace(/\bvalidates binding energy framework\b/gi, "is presented locally as consistent with the binding-energy interpretation")
    .replace(/\bvalidates binding energy\b/gi, "is presented locally as consistent with the binding-energy interpretation")
    .replace(/\bvalidates atmospheric models\b/gi, "supports aspects of atmospheric models")
    .replace(/\bvalidates model atmospheres\b/gi, "supports aspects of the model-atmosphere interpretation")
    .replace(/\bAgreement validates\b/gi, "Agreement is consistent with")
    .replace(/\bRatio comparison validates\b/gi, "Ratio comparison is consistent with")
    .replace(/\bsecure atmosphere\b/gi, "retention-favored regime")
    .replace(/\bstrongly bound\b/gi, "retention-favored in the current proxy framework")
    .replace(/\bmaintain this atmosphere\b/gi, "remain in a retention-favored regime")
    .replace(/\bwill survive\b/gi, "is modeled to remain retained")
    .replace(/\bstrong detection guaranteed\b/gi, "strong detection is favored under the local assumptions")
    .replace(/\bguaranteed\b/gi, "treated as strongly favored in the current proxy framework")
    .replace(/\bguarantee\b/gi, "strongly favor")
    .replace(/\bproves\b/gi, "supports")
    .replace(/\bprove\b/gi, "support")
    .replace(/\bthin atmosphere confirmed by data\b/gi, "thin-atmosphere interpretation favored by the cited data")
    .replace(/\bobservational confirmation\b/gi, "observational support")
    .replace(/\bvalidates atmospheric models\b/gi, "supports aspects of atmospheric models")
    .replace(/\bcertainly tidally locked\b/gi, "very likely tidally locked under tidal-timescale assumptions")
    .replace(/\bfor the entire main-sequence lifetime\b/gi, "under current-loss assumptions across the main-sequence lifetime")
    .replace(/\bfor entire main-sequence lifetime\b/gi, "under current-loss assumptions across the main-sequence lifetime")
    .replace(/\bfor the remaining main-sequence lifetime\b/gi, "under current-loss assumptions across the remaining main-sequence lifetime")
    .replace(/^(SECTION\s+\d+:\s+.+)$/gm, annotateSectionHeading);
}

function localSourceDescriptor(accessedAt: string): SourceDescriptor {
  return {
    id: "local-exoplanet-analyses",
    name: LOCAL_SOURCE_LABEL,
    kind: "derived",
    url: LEGACY_REGISTRY_PATH,
    accessedAt,
    cache: "hit",
  };
}

export async function getLegacyPlanetSummary(planetName: string) {
  const [registry, studiedCatalog] = await Promise.all([loadLegacyRegistry(), loadLegacyStudiedCatalog()]);
  const key = scienceKey(planetName);
  const entry = registry.planetsByKey.get(key);
  const studiedPlanet = studiedCatalog.planetsByKey.get(key) ?? null;
  if (!entry) return fallbackPlanetSummary(planetName, studiedPlanet?.systemName ?? null, studiedPlanet);
  return summaryFromPlanetEntry(entry, registry.version, registry.spectraByPlanetKey.get(key) ?? [], studiedPlanet);
}

export async function getLegacySystemSummary(systemName: string) {
  const [registry, studiedCatalog] = await Promise.all([loadLegacyRegistry(), loadLegacyStudiedCatalog()]);
  const key = scienceKey(systemName);
  const entry = registry.systemsByKey.get(key);
  const studiedSystem = studiedCatalog.systemsByKey.get(key) ?? null;
  if (!entry) return fallbackSystemSummary(systemName, studiedSystem);
  const planetSummaries = (entry.planetKeys ?? [])
    .map((planetKey) => registry.planetsByKey.get(scienceKey(planetKey)))
    .filter((planet): planet is LegacyPlanetEntry => !!planet)
    .map((planet) => {
      const studiedPlanet = studiedCatalog.planetsByKey.get(scienceKey(planet.name)) ?? null;
      return summaryFromPlanetEntry(planet, registry.version, registry.spectraByPlanetKey.get(scienceKey(planet.name)) ?? [], studiedPlanet);
    });
  return summaryFromSystemEntry(entry, planetSummaries, registry.version, studiedSystem);
}

export async function getLegacyPlanetBundle(planetName: string, systemName?: string | null) {
  const [registry, studiedCatalog] = await Promise.all([loadLegacyRegistry(), loadLegacyStudiedCatalog()]);
  const key = scienceKey(planetName);
  const entry = registry.planetsByKey.get(key);
  const studiedPlanet = studiedCatalog.planetsByKey.get(key) ?? null;
  const summary = entry
    ? summaryFromPlanetEntry(entry, registry.version, registry.spectraByPlanetKey.get(key) ?? [], studiedPlanet)
    : fallbackPlanetSummary(planetName, systemName ?? studiedPlanet?.systemName ?? null, studiedPlanet);
  if (!summary) return null;

  const reports = await loadPlanetReports(entry?.name ?? planetName, systemName ?? entry?.systemName ?? studiedPlanet?.systemName ?? null);
  const contents = await Promise.all(
    reports.map(async (report) => {
      const text = await fs.readFile(report.path, "utf8");
      return [
        `# ${report.label}`,
        "",
        "REPORT PROVENANCE CAPSULE",
        `- File: ${report.filename}`,
        "- Role: preserved legacy local narrative from the Desktop EXOPLANET_ANALYSES/JWST bundle",
        "- Numeric and source-bound claims should be checked against the STRUCTURED CLAIM BASIS above",
        "- Section annotations below label blocks as source-bound, derived-physics, or interpretation-heavy",
        "- Retention-language passages remain proxy language and are superseded by the rewrite's escape-regime audit",
        "",
        sanitizeLegacyNarrative(text),
      ].join("\n");
    }),
  );

  return {
    ...summary,
    reports,
    narrative: contents.length ? contents.join("\n\n---\n\n") : null,
    caveats: [
      "Local analysis is merged from the original EXOPLANET_ANALYSES bundle.",
      "Atmospheric retention passages inherited from the legacy analysis are reinterpreted as escape-regime proxies, not direct atmospheric outcomes.",
      "Use Jeans escape, escape velocity, irradiative stress, and magnetosphere context together rather than reading legacy retention-energy language literally.",
      "Magnetic-field language is retained only as context; shielding is not treated as a guaranteed on/off control over atmospheric escape.",
    ],
  } satisfies LocalAnalysisBundle;
}

export async function getLegacyLocalSource() {
  await loadLegacyRegistry();
  return localSourceDescriptor(new Date().toISOString());
}

export async function getLegacyPlanetEntry(planetName: string) {
  const registry = await loadLegacyRegistry();
  return registry.planetsByKey.get(scienceKey(planetName)) ?? null;
}

export async function getLegacySystemEntry(systemName: string) {
  const registry = await loadLegacyRegistry();
  return registry.systemsByKey.get(scienceKey(systemName)) ?? null;
}

export async function getLegacyStudiedPlanetNames() {
  const catalog = await loadLegacyStudiedCatalog();
  return Array.from(catalog.planetsByKey.values()).map((planet) => planet.name);
}
