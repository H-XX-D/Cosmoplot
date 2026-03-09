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
import { measurementBounds } from "@/lib/utils";
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

function buildSolarSystem(source: SourceDescriptor): UniverseSystem {
  const planets: UniversePlanet[] = [
    solarPlanet(source, {
      id: "mercury",
      name: "Mercury",
      radiusEarth: 0.383,
      massEarth: 0.055,
      equilibriumK: 440,
      orbitalPeriodDays: 87.97,
      semiMajorAxisAu: 0.387,
      densityGcc: 5.43,
      insolationEarth: 6.67,
      eccentricity: 0.206,
      inclinationDeg: 7.0,
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
      semiMajorAxisAu: 0.723,
      densityGcc: 5.24,
      insolationEarth: 1.91,
      eccentricity: 0.007,
      inclinationDeg: 3.39,
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
      semiMajorAxisAu: 1,
      densityGcc: 5.51,
      insolationEarth: 1,
      eccentricity: 0.017,
      inclinationDeg: 0,
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
      semiMajorAxisAu: 1.524,
      densityGcc: 3.93,
      insolationEarth: 0.43,
      eccentricity: 0.093,
      inclinationDeg: 1.85,
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
      semiMajorAxisAu: 5.203,
      densityGcc: 1.33,
      insolationEarth: 0.037,
      eccentricity: 0.049,
      inclinationDeg: 1.3,
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
      semiMajorAxisAu: 9.537,
      densityGcc: 0.69,
      insolationEarth: 0.011,
      eccentricity: 0.057,
      inclinationDeg: 2.49,
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
      semiMajorAxisAu: 19.191,
      densityGcc: 1.27,
      insolationEarth: 0.003,
      eccentricity: 0.046,
      inclinationDeg: 0.77,
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
      semiMajorAxisAu: 30.07,
      densityGcc: 1.64,
      insolationEarth: 0.0011,
      eccentricity: 0.011,
      inclinationDeg: 1.77,
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

  if (matchesSolarSearch(search)) {
    const solarSystem = buildSolarSystem(solarSource);
    const solarSummary = await getLegacySystemSummary(solarSystem.name);
    solarSystem.localAnalysis = solarSummary;
    solarSystem.provenance = solarSummary ? [...solarSystem.provenance, legacySource] : solarSystem.provenance;
    solarSystem.planets = await Promise.all(
      solarSystem.planets.map(async (planet) => {
        const localAnalysis = await getLegacyPlanetSummary(planet.name);
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
    const planet: UniversePlanet = {
      id: row.pl_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: row.pl_name,
      radiusEarth: row.pl_rade ?? localPlanet?.physical?.radiusEarth ?? null,
      massEarth: row.pl_bmasse ?? localPlanet?.physical?.massEarth ?? null,
      equilibriumK: row.pl_eqt ?? localPlanet?.temperatures?.equilibriumK ?? null,
      orbitalPeriodDays: row.pl_orbper ?? localPlanet?.orbital?.periodDays ?? null,
      semiMajorAxisAu: row.pl_orbsmax ?? localPlanet?.orbital?.semiMajorAxisAu ?? null,
      densityGcc: row.pl_dens ?? localPlanet?.physical?.densityGcc ?? null,
      insolationEarth: row.pl_insol ?? localPlanet?.radiation?.fluxEarthMultiple ?? null,
      eccentricity: row.pl_orbeccen ?? localPlanet?.orbital?.eccentricity ?? null,
      inclinationDeg: row.pl_orbincl,
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
    sources: matchesSolarSearch(search) ? [solarSource, archive.source, legacySource] : [archive.source, legacySource],
    systems: Array.from(systems.values()).sort((a, b) => a.distancePc - b.distancePc),
    whiteDwarfs: {
      summary: whiteDwarfs.summary,
      anchors: whiteDwarfs.anchors,
      sources: whiteDwarfs.sources,
    },
  };

  return snapshot;
}
