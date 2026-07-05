import { equatorialToCartesianPc } from "@/lib/science/coordinates";
import {
  getLegacyLocalSource,
  getLegacyPlanetEntry,
  getLegacyPlanetSummary,
  getLegacyStudiedPlanetNames,
  getLegacySystemEntry,
  getLegacySystemSummary,
} from "@/lib/science/local/legacy-analysis";
import { getWhiteDwarfCatalog } from "@/lib/science/local/white-dwarfs";
import { fetchArchivePlanetsByNames, fetchNearbyArchivePlanets } from "@/lib/science/official/exoplanet-archive";
import { propagateCatalogPlanet } from "@/lib/science/physics";
import { clamp, measurementBounds } from "@/lib/utils";
import type {
  ArchivePlanetRow,
  SourceDescriptor,
  UniversePlanet,
  UniverseSnapshot,
  UniverseSystem,
} from "@/lib/science/types";

function matchesSolarSearch(search: string | null) {
  const normalized = String(search || "").trim().toLowerCase();
  if (!normalized) return true;
  const corpus = [
    "sun",
    "solar system",
    "mercury",
    "venus",
    "earth",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
  ];
  return corpus.some((entry) => entry.includes(normalized));
}

function solarPlanet(source: SourceDescriptor, input: Omit<UniversePlanet, "provenance">): UniversePlanet {
  return {
    ...input,
    provenance: [source],
  };
}

const J2000_JD = 2451545.0;
const MS_PER_DAY = 86400000;
const SNAPSHOT_CACHE_TTL_MS = 1000 * 60 * 10;

const universeSnapshotCache = new Map<string, { expiresAt: number; snapshot: UniverseSnapshot }>();

type SolarApproxElement = {
  id: string;
  a0: number;
  a1: number;
  e0: number;
  e1: number;
  i0: number;
  i1: number;
  l0: number;
  l1: number;
  peri0: number;
  peri1: number;
  node0: number;
  node1: number;
  b?: number;
  c?: number;
  s?: number;
  f?: number;
};

const SOLAR_APPROX_ELEMENTS: Record<string, SolarApproxElement> = {
  mercury: { id: "mercury", a0: 0.38709927, a1: 0.00000037, e0: 0.20563593, e1: 0.00001906, i0: 7.00497902, i1: -0.00594749, l0: 252.2503235, l1: 149472.67411175, peri0: 77.45779628, peri1: 0.16047689, node0: 48.33076593, node1: -0.12534081 },
  venus: { id: "venus", a0: 0.72333566, a1: 0.0000039, e0: 0.00677672, e1: -0.00004107, i0: 3.39467605, i1: -0.0007889, l0: 181.9790995, l1: 58517.81538729, peri0: 131.60246718, peri1: 0.00268329, node0: 76.67984255, node1: -0.27769418 },
  earth: { id: "earth", a0: 1.00000261, a1: 0.00000562, e0: 0.01671123, e1: -0.00004392, i0: -0.00001531, i1: -0.01294668, l0: 100.46457166, l1: 35999.37244981, peri0: 102.93768193, peri1: 0.32327364, node0: 0, node1: 0 },
  mars: { id: "mars", a0: 1.52371034, a1: 0.00001847, e0: 0.0933941, e1: 0.00007882, i0: 1.84969142, i1: -0.00813131, l0: -4.55343205, l1: 19140.30268499, peri0: -23.94362959, peri1: 0.44441088, node0: 49.55953891, node1: -0.29257343 },
  jupiter: { id: "jupiter", a0: 5.202887, a1: -0.00011607, e0: 0.04838624, e1: -0.00013253, i0: 1.30439695, i1: -0.00183714, l0: 34.39644051, l1: 3034.74612775, peri0: 14.72847983, peri1: 0.21252668, node0: 100.47390909, node1: 0.20469106, b: -0.00012452, c: 0.0606406, s: -0.35635438, f: 38.35125 },
  saturn: { id: "saturn", a0: 9.53667594, a1: -0.0012506, e0: 0.05386179, e1: -0.00050991, i0: 2.48599187, i1: 0.00193609, l0: 49.95424423, l1: 1222.49362201, peri0: 92.59887831, peri1: -0.41897216, node0: 113.66242448, node1: -0.28867794, b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125 },
  uranus: { id: "uranus", a0: 19.18916464, a1: -0.00196176, e0: 0.04725744, e1: -0.00004397, i0: 0.77263783, i1: -0.00242939, l0: 313.23810451, l1: 428.48202785, peri0: 170.9542763, peri1: 0.40805281, node0: 74.01692503, node1: 0.04240589, b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025 },
  neptune: { id: "neptune", a0: 30.06992276, a1: 0.00026291, e0: 0.00859048, e1: 0.00005105, i0: 1.77004347, i1: 0.00035372, l0: -55.12002969, l1: 218.45945325, peri0: 44.96476227, peri1: -0.32241464, node0: 131.78422574, node1: -0.00508664, b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025 },
};

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function julianDayNow() {
  return Date.now() / MS_PER_DAY + 2440587.5;
}

function inferMeanAnomalyFromTransit(eccentricity: number, argumentPeriastronDeg: number) {
  const f = Math.PI * 0.5 - (argumentPeriastronDeg * Math.PI / 180);
  const e = clamp(eccentricity, 0, 0.95);
  const eccentricAnomaly = 2 * Math.atan(
    Math.sqrt((1 - e) / Math.max(1 + e, 0.0001))
    * Math.tan(f / 2),
  );
  return normalizeDegrees((eccentricAnomaly - e * Math.sin(eccentricAnomaly)) * 180 / Math.PI);
}

function solarCurrentElements(id: string, jd: number) {
  const entry = SOLAR_APPROX_ELEMENTS[id];
  const T = (jd - J2000_JD) / 36525;
  const a = entry.a0 + entry.a1 * T;
  const e = entry.e0 + entry.e1 * T;
  const inclinationDeg = entry.i0 + entry.i1 * T;
  const meanLongitudeDeg = entry.l0 + entry.l1 * T;
  const longitudePeriapsisDeg = entry.peri0 + entry.peri1 * T;
  const longitudeAscendingNodeDeg = entry.node0 + entry.node1 * T;
  let meanAnomalyDeg = meanLongitudeDeg - longitudePeriapsisDeg;

  if (entry.b !== undefined && entry.c !== undefined && entry.s !== undefined && entry.f !== undefined) {
    meanAnomalyDeg += entry.b * T * T + entry.c * Math.cos(entry.f * T * Math.PI / 180) + entry.s * Math.sin(entry.f * T * Math.PI / 180);
  }

  return {
    semiMajorAxisAu: a,
    eccentricity: e,
    inclinationDeg: Math.abs(inclinationDeg),
    longitudeAscendingNodeDeg: normalizeDegrees(longitudeAscendingNodeDeg),
    argumentPeriastronDeg: normalizeDegrees(longitudePeriapsisDeg - longitudeAscendingNodeDeg),
    meanAnomalyDegAtEpoch: normalizeDegrees(meanAnomalyDeg),
    orbitEpochJd: jd,
  };
}

function phaseFromPeriodAndEpoch(periodDays: number | null, epochJd: number | null, baseMeanAnomalyDeg: number) {
  if (!periodDays || !epochJd) return null;
  const elapsedCycles = (julianDayNow() - epochJd) / periodDays;
  return normalizeDegrees(baseMeanAnomalyDeg + elapsedCycles * 360);
}

function buildSolarSystem(source: SourceDescriptor): UniverseSystem {
  const solarEpochJd = julianDayNow();
  const mercuryOrbit = solarCurrentElements("mercury", solarEpochJd);
  const venusOrbit = solarCurrentElements("venus", solarEpochJd);
  const earthOrbit = solarCurrentElements("earth", solarEpochJd);
  const marsOrbit = solarCurrentElements("mars", solarEpochJd);
  const jupiterOrbit = solarCurrentElements("jupiter", solarEpochJd);
  const saturnOrbit = solarCurrentElements("saturn", solarEpochJd);
  const uranusOrbit = solarCurrentElements("uranus", solarEpochJd);
  const neptuneOrbit = solarCurrentElements("neptune", solarEpochJd);
  const planets: UniversePlanet[] = [
    solarPlanet(source, {
      id: "mercury",
      name: "Mercury",
      radiusEarth: 0.383,
      massEarth: 0.055,
      equilibriumK: 440,
      orbitalPeriodDays: 87.97,
      semiMajorAxisAu: mercuryOrbit.semiMajorAxisAu,
      densityGcc: 5.43,
      insolationEarth: 6.67,
      eccentricity: mercuryOrbit.eccentricity,
      inclinationDeg: mercuryOrbit.inclinationDeg,
      inclinationReference: "ecliptic",
      longitudeAscendingNodeDeg: mercuryOrbit.longitudeAscendingNodeDeg,
      argumentPeriastronDeg: mercuryOrbit.argumentPeriastronDeg,
      meanAnomalyDegAtEpoch: mercuryOrbit.meanAnomalyDegAtEpoch,
      orbitEpochJd: mercuryOrbit.orbitEpochJd,
      orbitBasis: "jpl-approx",
      transitDepthPpm: null,
      transitDurationHours: null,
      uncertainty: {
        radiusEarth: measurementBounds(null, null),
        massEarth: measurementBounds(null, null),
        equilibriumK: measurementBounds(null, null),
        periodDays: measurementBounds(null, null),
        semiMajorAxisAu: measurementBounds(null, null),
      },
      discoveryFacility: "Solar System",
      discoveryYear: null,
    }),
    solarPlanet(source, {
      id: "venus",
      name: "Venus",
      radiusEarth: 0.949,
      massEarth: 0.815,
      equilibriumK: 227,
      orbitalPeriodDays: 224.7,
      semiMajorAxisAu: venusOrbit.semiMajorAxisAu,
      densityGcc: 5.24,
      insolationEarth: 1.91,
      eccentricity: venusOrbit.eccentricity,
      inclinationDeg: venusOrbit.inclinationDeg,
      inclinationReference: "ecliptic",
      longitudeAscendingNodeDeg: venusOrbit.longitudeAscendingNodeDeg,
      argumentPeriastronDeg: venusOrbit.argumentPeriastronDeg,
      meanAnomalyDegAtEpoch: venusOrbit.meanAnomalyDegAtEpoch,
      orbitEpochJd: venusOrbit.orbitEpochJd,
      orbitBasis: "jpl-approx",
      transitDepthPpm: null,
      transitDurationHours: null,
      uncertainty: {
        radiusEarth: measurementBounds(null, null),
        massEarth: measurementBounds(null, null),
        equilibriumK: measurementBounds(null, null),
        periodDays: measurementBounds(null, null),
        semiMajorAxisAu: measurementBounds(null, null),
      },
      discoveryFacility: "Solar System",
      discoveryYear: null,
    }),
    solarPlanet(source, {
      id: "earth",
      name: "Earth",
      radiusEarth: 1,
      massEarth: 1,
      equilibriumK: 255,
      orbitalPeriodDays: 365.25,
      semiMajorAxisAu: earthOrbit.semiMajorAxisAu,
      densityGcc: 5.51,
      insolationEarth: 1,
      eccentricity: earthOrbit.eccentricity,
      inclinationDeg: earthOrbit.inclinationDeg,
      inclinationReference: "ecliptic",
      longitudeAscendingNodeDeg: earthOrbit.longitudeAscendingNodeDeg,
      argumentPeriastronDeg: earthOrbit.argumentPeriastronDeg,
      meanAnomalyDegAtEpoch: earthOrbit.meanAnomalyDegAtEpoch,
      orbitEpochJd: earthOrbit.orbitEpochJd,
      orbitBasis: "jpl-approx",
      transitDepthPpm: null,
      transitDurationHours: null,
      uncertainty: {
        radiusEarth: measurementBounds(null, null),
        massEarth: measurementBounds(null, null),
        equilibriumK: measurementBounds(null, null),
        periodDays: measurementBounds(null, null),
        semiMajorAxisAu: measurementBounds(null, null),
      },
      discoveryFacility: "Solar System",
      discoveryYear: null,
    }),
    solarPlanet(source, {
      id: "mars",
      name: "Mars",
      radiusEarth: 0.532,
      massEarth: 0.107,
      equilibriumK: 210,
      orbitalPeriodDays: 686.98,
      semiMajorAxisAu: marsOrbit.semiMajorAxisAu,
      densityGcc: 3.93,
      insolationEarth: 0.43,
      eccentricity: marsOrbit.eccentricity,
      inclinationDeg: marsOrbit.inclinationDeg,
      inclinationReference: "ecliptic",
      longitudeAscendingNodeDeg: marsOrbit.longitudeAscendingNodeDeg,
      argumentPeriastronDeg: marsOrbit.argumentPeriastronDeg,
      meanAnomalyDegAtEpoch: marsOrbit.meanAnomalyDegAtEpoch,
      orbitEpochJd: marsOrbit.orbitEpochJd,
      orbitBasis: "jpl-approx",
      transitDepthPpm: null,
      transitDurationHours: null,
      uncertainty: {
        radiusEarth: measurementBounds(null, null),
        massEarth: measurementBounds(null, null),
        equilibriumK: measurementBounds(null, null),
        periodDays: measurementBounds(null, null),
        semiMajorAxisAu: measurementBounds(null, null),
      },
      discoveryFacility: "Solar System",
      discoveryYear: null,
    }),
    solarPlanet(source, {
      id: "jupiter",
      name: "Jupiter",
      radiusEarth: 11.21,
      massEarth: 317.8,
      equilibriumK: 110,
      orbitalPeriodDays: 4332.59,
      semiMajorAxisAu: jupiterOrbit.semiMajorAxisAu,
      densityGcc: 1.33,
      insolationEarth: 0.037,
      eccentricity: jupiterOrbit.eccentricity,
      inclinationDeg: jupiterOrbit.inclinationDeg,
      inclinationReference: "ecliptic",
      longitudeAscendingNodeDeg: jupiterOrbit.longitudeAscendingNodeDeg,
      argumentPeriastronDeg: jupiterOrbit.argumentPeriastronDeg,
      meanAnomalyDegAtEpoch: jupiterOrbit.meanAnomalyDegAtEpoch,
      orbitEpochJd: jupiterOrbit.orbitEpochJd,
      orbitBasis: "jpl-approx",
      transitDepthPpm: null,
      transitDurationHours: null,
      uncertainty: {
        radiusEarth: measurementBounds(null, null),
        massEarth: measurementBounds(null, null),
        equilibriumK: measurementBounds(null, null),
        periodDays: measurementBounds(null, null),
        semiMajorAxisAu: measurementBounds(null, null),
      },
      discoveryFacility: "Solar System",
      discoveryYear: null,
    }),
    solarPlanet(source, {
      id: "saturn",
      name: "Saturn",
      radiusEarth: 9.45,
      massEarth: 95.16,
      equilibriumK: 81,
      orbitalPeriodDays: 10759.22,
      semiMajorAxisAu: saturnOrbit.semiMajorAxisAu,
      densityGcc: 0.69,
      insolationEarth: 0.011,
      eccentricity: saturnOrbit.eccentricity,
      inclinationDeg: saturnOrbit.inclinationDeg,
      inclinationReference: "ecliptic",
      longitudeAscendingNodeDeg: saturnOrbit.longitudeAscendingNodeDeg,
      argumentPeriastronDeg: saturnOrbit.argumentPeriastronDeg,
      meanAnomalyDegAtEpoch: saturnOrbit.meanAnomalyDegAtEpoch,
      orbitEpochJd: saturnOrbit.orbitEpochJd,
      orbitBasis: "jpl-approx",
      transitDepthPpm: null,
      transitDurationHours: null,
      uncertainty: {
        radiusEarth: measurementBounds(null, null),
        massEarth: measurementBounds(null, null),
        equilibriumK: measurementBounds(null, null),
        periodDays: measurementBounds(null, null),
        semiMajorAxisAu: measurementBounds(null, null),
      },
      discoveryFacility: "Solar System",
      discoveryYear: null,
    }),
    solarPlanet(source, {
      id: "uranus",
      name: "Uranus",
      radiusEarth: 4.01,
      massEarth: 14.54,
      equilibriumK: 59,
      orbitalPeriodDays: 30688.5,
      semiMajorAxisAu: uranusOrbit.semiMajorAxisAu,
      densityGcc: 1.27,
      insolationEarth: 0.003,
      eccentricity: uranusOrbit.eccentricity,
      inclinationDeg: uranusOrbit.inclinationDeg,
      inclinationReference: "ecliptic",
      longitudeAscendingNodeDeg: uranusOrbit.longitudeAscendingNodeDeg,
      argumentPeriastronDeg: uranusOrbit.argumentPeriastronDeg,
      meanAnomalyDegAtEpoch: uranusOrbit.meanAnomalyDegAtEpoch,
      orbitEpochJd: uranusOrbit.orbitEpochJd,
      orbitBasis: "jpl-approx",
      transitDepthPpm: null,
      transitDurationHours: null,
      uncertainty: {
        radiusEarth: measurementBounds(null, null),
        massEarth: measurementBounds(null, null),
        equilibriumK: measurementBounds(null, null),
        periodDays: measurementBounds(null, null),
        semiMajorAxisAu: measurementBounds(null, null),
      },
      discoveryFacility: "Solar System",
      discoveryYear: 1781,
    }),
    solarPlanet(source, {
      id: "neptune",
      name: "Neptune",
      radiusEarth: 3.88,
      massEarth: 17.15,
      equilibriumK: 47,
      orbitalPeriodDays: 60182,
      semiMajorAxisAu: neptuneOrbit.semiMajorAxisAu,
      densityGcc: 1.64,
      insolationEarth: 0.0011,
      eccentricity: neptuneOrbit.eccentricity,
      inclinationDeg: neptuneOrbit.inclinationDeg,
      inclinationReference: "ecliptic",
      longitudeAscendingNodeDeg: neptuneOrbit.longitudeAscendingNodeDeg,
      argumentPeriastronDeg: neptuneOrbit.argumentPeriastronDeg,
      meanAnomalyDegAtEpoch: neptuneOrbit.meanAnomalyDegAtEpoch,
      orbitEpochJd: neptuneOrbit.orbitEpochJd,
      orbitBasis: "jpl-approx",
      transitDepthPpm: null,
      transitDurationHours: null,
      uncertainty: {
        radiusEarth: measurementBounds(null, null),
        massEarth: measurementBounds(null, null),
        equilibriumK: measurementBounds(null, null),
        periodDays: measurementBounds(null, null),
        semiMajorAxisAu: measurementBounds(null, null),
      },
      discoveryFacility: "Solar System",
      discoveryYear: 1846,
    }),
  ];

  return {
    id: "sun",
    name: "Sun",
    raDeg: 0,
    decDeg: 0,
    distancePc: 0,
    cartesianPc: { x: 0, y: 0, z: 0 },
    stellar: {
      effectiveTemperatureK: 5772,
      radiusSolar: 1,
      massSolar: 1,
      spectralType: "G2V",
      luminosityLogSolar: 0,
      ageGyr: 4.6,
      metallicityDex: 0,
      surfaceGravityLogCgs: 4.44,
      uncertainty: {
        effectiveTemperatureK: measurementBounds(null, null),
        radiusSolar: measurementBounds(null, null),
        massSolar: measurementBounds(null, null),
      },
      photometry: {
        vMag: -26.74,
        jMag: -26.93,
        hMag: -26.93,
        kMag: -26.93,
        gaiaMag: -26.9,
      },
    },
    planetCount: planets.length,
    planets,
    provenance: [source],
  };
}

export async function getUniverseSnapshot(params?: {
  radiusPc?: number;
  limit?: number;
  search?: string | null;
}) {
  const radiusPc = params?.radiusPc ?? 35;
  const limit = params?.limit ?? 800;
  const search = params?.search ?? null;
  const snapshotCacheKey = JSON.stringify({ radiusPc, limit, search: search ?? "" });
  const cachedSnapshot = universeSnapshotCache.get(snapshotCacheKey);
  if (cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
    return cachedSnapshot.snapshot;
  }

  const [archive, studiedPlanetNames] = await Promise.all([
    fetchNearbyArchivePlanets({ radiusPc, limit, search }),
    getLegacyStudiedPlanetNames(),
  ]);
  const whiteDwarfs = await getWhiteDwarfCatalog();
  const missingStudiedNames = studiedPlanetNames.filter((planetName) => {
    const planetKey = planetName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return !archive.rows.some((row) => row.pl_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") === planetKey);
  });
  const studiedArchive = missingStudiedNames.length
    ? await fetchArchivePlanetsByNames(missingStudiedNames)
    : { rows: [] as ArchivePlanetRow[], source: archive.source };
  const mergedArchiveRows = Array.from(
    [...archive.rows, ...studiedArchive.rows].reduce((map, row) => {
      const key = row.pl_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (!map.has(key)) map.set(key, row);
      return map;
    }, new Map<string, ArchivePlanetRow>()).values(),
  );
  const systems = new Map<string, UniverseSystem>();
  const solarSource: SourceDescriptor = {
    id: "nasa-solar-system-exploration",
    name: "NASA Solar System Exploration",
    kind: "catalog",
    url: "https://solarsystem.nasa.gov/planets/overview/",
    accessedAt: new Date().toISOString(),
    cache: "miss",
  };
  const legacySource = await getLegacyLocalSource();
  // Science-first provenance: the local analysis bundle is only citable when it
  // actually contributed claims to this snapshot. On hosts without the local
  // files (production) this stays 0 and the source is omitted entirely.
  let legacyContributionCount = 0;

  if (matchesSolarSearch(search)) {
    const solarSystem = buildSolarSystem(solarSource);
    const solarSummary = await getLegacySystemSummary(solarSystem.name);
    if (solarSummary) legacyContributionCount += 1;
    solarSystem.localAnalysis = solarSummary;
    solarSystem.provenance = solarSummary ? [...solarSystem.provenance, legacySource] : solarSystem.provenance;
    solarSystem.planets = await Promise.all(
      solarSystem.planets.map(async (planet) => {
        const localAnalysis = await getLegacyPlanetSummary(planet.name);
        if (localAnalysis) legacyContributionCount += 1;
        return {
          ...planet,
          localAnalysis,
          provenance: localAnalysis ? [...planet.provenance, legacySource] : planet.provenance,
        };
      }),
    );
    systems.set(solarSystem.name, solarSystem);
  }

  for (const row of mergedArchiveRows) {
    const key = row.hostname;
    const localSystem = await getLegacySystemEntry(row.hostname);
    const localSystemSummary = await getLegacySystemSummary(row.hostname);
    if (localSystem || localSystemSummary) legacyContributionCount += 1;
    const provenance = localSystemSummary ? [archive.source, legacySource] : [archive.source];
    let system = systems.get(key);

    if (!system) {
      system = {
        id: key.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: row.hostname,
        raDeg: Number(row.ra),
        decDeg: Number(row.dec),
        distancePc: Number(row.sy_dist),
        cartesianPc: equatorialToCartesianPc(Number(row.ra), Number(row.dec), Number(row.sy_dist)),
        stellar: {
          effectiveTemperatureK: row.st_teff ?? localSystem?.star?.temperatureK ?? null,
          radiusSolar: row.st_rad ?? localSystem?.star?.radiusSolar ?? null,
          massSolar: row.st_mass ?? localSystem?.star?.massSolar ?? null,
          spectralType: row.st_spectype ?? localSystem?.star?.spectralType ?? null,
          luminosityLogSolar: row.st_lum ?? (localSystem?.star?.luminositySolar ? Math.log10(localSystem.star.luminositySolar) : null),
          ageGyr: row.st_age ?? localSystem?.star?.ageGyr ?? null,
          metallicityDex: row.st_met ?? localSystem?.star?.metallicityDex ?? null,
          surfaceGravityLogCgs: row.st_logg,
          uncertainty: {
            effectiveTemperatureK: measurementBounds(row.st_tefferr1, row.st_tefferr2),
            radiusSolar: measurementBounds(row.st_raderr1, row.st_raderr2),
            massSolar: measurementBounds(row.st_masserr1, row.st_masserr2),
          },
          photometry: {
            vMag: row.sy_vmag,
            jMag: row.sy_jmag,
            hMag: row.sy_hmag,
            kMag: row.sy_kmag,
            gaiaMag: row.sy_gaiamag,
          },
        },
        planetCount: 0,
        planets: [],
      localAnalysis: localSystemSummary,
      provenance,
    };
      systems.set(key, system);
    }

    const localPlanet = await getLegacyPlanetEntry(row.pl_name);
    const localPlanetSummary = await getLegacyPlanetSummary(row.pl_name);
    if (localPlanet || localPlanetSummary) legacyContributionCount += 1;
    const orbitalPeriodDays = row.pl_orbper ?? localPlanet?.orbital?.periodDays ?? null;
    const semiMajorAxisAu = row.pl_orbsmax ?? localPlanet?.orbital?.semiMajorAxisAu ?? null;
    const eccentricity = row.pl_orbeccen ?? localPlanet?.orbital?.eccentricity ?? null;
    const argumentPeriastronDeg = row.pl_orblper ?? null;
    const transitMidpointJd = row.pl_tranmid ?? null;
    const timePeriastronJd = row.pl_orbtper ?? null;
    const meanAnomalyDegAtEpoch = timePeriastronJd !== null && timePeriastronJd !== undefined
      ? phaseFromPeriodAndEpoch(orbitalPeriodDays, timePeriastronJd, 0)
      : transitMidpointJd !== null && transitMidpointJd !== undefined
        ? phaseFromPeriodAndEpoch(orbitalPeriodDays, transitMidpointJd, inferMeanAnomalyFromTransit(eccentricity ?? 0, argumentPeriastronDeg ?? 0))
        : null;
    const orbitBasis: UniversePlanet["orbitBasis"] =
      argumentPeriastronDeg !== null && meanAnomalyDegAtEpoch !== null
        ? "measured"
        : (eccentricity !== null && eccentricity !== undefined) || (row.pl_orbincl !== null && row.pl_orbincl !== undefined)
          ? "mixed"
          : "inferred";
    const planet: UniversePlanet = {
      id: row.pl_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: row.pl_name,
      radiusEarth: row.pl_rade ?? localPlanet?.physical?.radiusEarth ?? null,
      massEarth: row.pl_bmasse ?? localPlanet?.physical?.massEarth ?? null,
      equilibriumK: row.pl_eqt ?? localPlanet?.temperatures?.equilibriumK ?? null,
      orbitalPeriodDays,
      semiMajorAxisAu,
      densityGcc: row.pl_dens ?? localPlanet?.physical?.densityGcc ?? null,
      insolationEarth: row.pl_insol ?? localPlanet?.radiation?.fluxEarthMultiple ?? null,
      eccentricity,
      inclinationDeg: row.pl_orbincl,
      inclinationReference: row.pl_orbincl !== null && row.pl_orbincl !== undefined ? "sky" : undefined,
      argumentPeriastronDeg,
      longitudeAscendingNodeDeg: null,
      meanAnomalyDegAtEpoch,
      orbitEpochJd: timePeriastronJd ?? transitMidpointJd ?? null,
      orbitBasis,
      transitDepthPpm: row.pl_trandep,
      transitDurationHours: row.pl_trandur,
      uncertainty: {
        radiusEarth: measurementBounds(row.pl_radeerr1, row.pl_radeerr2),
        massEarth: measurementBounds(row.pl_bmasseerr1, row.pl_bmasseerr2),
        equilibriumK: measurementBounds(row.pl_eqterr1, row.pl_eqterr2),
        periodDays: measurementBounds(row.pl_orbpererr1, row.pl_orbpererr2),
        semiMajorAxisAu: measurementBounds(row.pl_orbsmaxerr1, row.pl_orbsmaxerr2),
      },
      propagation: propagateCatalogPlanet({
        planetName: row.pl_name,
        radiusEarth: row.pl_rade ?? localPlanet?.physical?.radiusEarth ?? null,
        massEarth: row.pl_bmasse ?? localPlanet?.physical?.massEarth ?? null,
        equilibriumK: row.pl_eqt ?? localPlanet?.temperatures?.equilibriumK ?? null,
        semiMajorAxisAu: row.pl_orbsmax ?? localPlanet?.orbital?.semiMajorAxisAu ?? null,
        stellarTemperatureK: row.st_teff ?? localSystem?.star?.temperatureK ?? null,
        stellarRadiusSolar: row.st_rad ?? localSystem?.star?.radiusSolar ?? null,
        stellarMassSolar: row.st_mass ?? localSystem?.star?.massSolar ?? null,
        uncertainty: {
          radiusEarth: measurementBounds(row.pl_radeerr1, row.pl_radeerr2),
          massEarth: measurementBounds(row.pl_bmasseerr1, row.pl_bmasseerr2),
          equilibriumK: measurementBounds(row.pl_eqterr1, row.pl_eqterr2),
          semiMajorAxisAu: measurementBounds(row.pl_orbsmaxerr1, row.pl_orbsmaxerr2),
          stellarTemperatureK: measurementBounds(row.st_tefferr1, row.st_tefferr2),
          stellarRadiusSolar: measurementBounds(row.st_raderr1, row.st_raderr2),
          stellarMassSolar: measurementBounds(row.st_masserr1, row.st_masserr2),
        },
        sampleCount: 320,
      }),
      discoveryFacility: row.disc_facility,
      discoveryYear: row.disc_year,
      localAnalysis: localPlanetSummary,
      provenance: localPlanetSummary ? [archive.source, legacySource] : [archive.source],
    };

    system.planets.push(planet);
    system.planetCount = system.planets.length;
  }

  const snapshot: UniverseSnapshot = {
    generatedAt: new Date().toISOString(),
    query: {
      radiusPc,
      limit,
      search,
    },
    sources: [
      ...(matchesSolarSearch(search) ? [solarSource] : []),
      archive.source,
      ...(legacyContributionCount > 0 ? [legacySource] : []),
    ],
    systems: Array.from(systems.values()).sort((a, b) => a.distancePc - b.distancePc),
    whiteDwarfs: {
      summary: whiteDwarfs.summary,
      anchors: whiteDwarfs.anchors,
      sources: whiteDwarfs.sources,
    },
  };

  universeSnapshotCache.set(snapshotCacheKey, {
    expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
    snapshot,
  });

  return snapshot;
}
