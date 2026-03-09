import { promises as fs } from "node:fs";
import path from "node:path";
import { equatorialToCartesianPc } from "@/lib/science/coordinates";
import type { SourceDescriptor, WhiteDwarfAnchor, WhiteDwarfCatalog, WhiteDwarfRecord, WhiteDwarfSummary } from "@/lib/science/types";

const G = 6.6743e-11;
const SOLAR_MASS_KG = 1.98847e30;
const SOLAR_RADIUS_M = 6.957e8;
const C = 299792458;

const ROOT = "/Users/hendrixx./Desktop/jwst_exoplanets";
const SYNTHETIC_CSV = path.join(ROOT, "synthetic_wd_sample.csv");
const TREMBLAY_CSV = path.join(ROOT, "white_dwarf_data", "tremblay2019_sample.csv");

const CURATED_WHITE_DWARFS: Array<Omit<WhiteDwarfAnchor, "cartesianPc" | "provenance"> & { sourceUrl: string }> = [
  {
    id: "sirius-b",
    name: "Sirius B",
    raDeg: 101.2872,
    decDeg: -16.7161,
    distancePc: 2.64,
    spectralType: "DA2",
    effectiveTemperatureK: 25200,
    massSolar: 1.02,
    radiusSolar: 0.0084,
    gravitationalRedshiftKmS: 80.7,
    tags: ["nearby", "white dwarf", "companion"],
    sourceUrl: "https://science.nasa.gov/universe/stars/sirius/",
  },
  {
    id: "procyon-b",
    name: "Procyon B",
    raDeg: 114.8255,
    decDeg: 5.225,
    distancePc: 3.51,
    spectralType: "DQZ",
    effectiveTemperatureK: 7740,
    massSolar: 0.592,
    radiusSolar: 0.0123,
    gravitationalRedshiftKmS: 30.5,
    tags: ["nearby", "white dwarf", "companion"],
    sourceUrl: "https://science.nasa.gov/universe/stars/procyon-the-little-dog-star/",
  },
  {
    id: "40-eridani-b",
    name: "40 Eridani B",
    raDeg: 63.8179,
    decDeg: -7.6528,
    distancePc: 5.04,
    spectralType: "DA4.9",
    effectiveTemperatureK: 16500,
    massSolar: 0.573,
    radiusSolar: 0.0131,
    gravitationalRedshiftKmS: 27.8,
    tags: ["nearby", "white dwarf", "binary"],
    sourceUrl: "https://science.nasa.gov/universe/stars/40-eridani/",
  },
  {
    id: "van-maanens-star",
    name: "van Maanen's Star",
    raDeg: 12.9855,
    decDeg: 5.7016,
    distancePc: 4.31,
    spectralType: "DZ7.5",
    effectiveTemperatureK: 6030,
    massSolar: 0.68,
    radiusSolar: 0.011,
    gravitationalRedshiftKmS: 39.3,
    tags: ["nearby", "white dwarf", "single"],
    sourceUrl: "https://simbad.cds.unistra.fr/simbad/sim-id?Ident=van%20Maanen%27s%20star",
  },
];

let cache:
  | {
      key: string;
      catalog: WhiteDwarfCatalog;
    }
  | null = null;

function localSource(id: string, name: string, url: string): SourceDescriptor {
  return {
    id,
    name,
    kind: "catalog",
    url,
    accessedAt: new Date().toISOString(),
    cache: "hit",
  };
}

function toNumber(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((value) => value.trim());
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {});
  });
}

function median(values: Array<number | null>) {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 === 0 ? (usable[middle - 1] + usable[middle]) / 2 : usable[middle];
}

function gravitationalRedshiftKmS(massSolar: number | null, radiusSolar: number | null) {
  if (!massSolar || !radiusSolar) return null;
  return (G * massSolar * SOLAR_MASS_KG) / (radiusSolar * SOLAR_RADIUS_M * C) / 1000;
}

function maybeRepairVelocity(raw: number | null, fallback: number | null) {
  if (raw === null || raw === undefined || Number.isNaN(raw)) {
    return { value: fallback, repaired: fallback !== null };
  }
  if (Math.abs(raw) > 1000) {
    return { value: fallback, repaired: fallback !== null };
  }
  return { value: raw, repaired: false };
}

function syntheticRecord(row: Record<string, string>, source: SourceDescriptor): WhiteDwarfRecord {
  return {
    id: row.WD_ID || `synthetic-${Math.random().toString(36).slice(2, 8)}`,
    sample: "synthetic",
    massSolar: toNumber(row.Mass_Msun),
    massErrorSolar: null,
    radiusSolar: toNumber(row.Radius_Rsun),
    radiusErrorSolar: null,
    structureDepth: toNumber(row.S_structure_depth),
    gravitationalRedshiftKmS: toNumber(row.v_GR_kms),
    observedVelocityKmS: toNumber(row.v_obs_kms),
    deltaVelocityKmS: toNumber(row.delta_v_kms),
    sigmaVelocityKmS: toNumber(row.sigma_v_kms),
    velocityRepairApplied: false,
    provenance: [source],
  };
}

function tremblayRecord(row: Record<string, string>, source: SourceDescriptor): WhiteDwarfRecord {
  const massSolar = toNumber(row.Mass_Msun);
  const radiusSolar = toNumber(row.Radius_Rsun);
  const theoretical = gravitationalRedshiftKmS(massSolar, radiusSolar);
  const deltaVelocityKmS = toNumber(row.delta_v_kms);

  const predicted = maybeRepairVelocity(toNumber(row.v_GR_predicted_kms), theoretical);
  const observedFallback = predicted.value !== null && deltaVelocityKmS !== null ? predicted.value + deltaVelocityKmS : null;
  const observed = maybeRepairVelocity(toNumber(row.v_observed_kms), observedFallback);

  return {
    id: row.ID || `tremblay-${Math.random().toString(36).slice(2, 8)}`,
    sample: "tremblay2019",
    massSolar,
    massErrorSolar: toNumber(row.Mass_err),
    radiusSolar,
    radiusErrorSolar: toNumber(row.Radius_err),
    structureDepth: toNumber(row.S_structure_depth),
    gravitationalRedshiftKmS: predicted.value,
    observedVelocityKmS: observed.value,
    deltaVelocityKmS,
    sigmaVelocityKmS: toNumber(row.v_err_kms),
    velocityRepairApplied: predicted.repaired || observed.repaired,
    provenance: [source],
  };
}

async function loadCsv(filePath: string) {
  return parseCsv(await fs.readFile(filePath, "utf8"));
}

function buildSummary(records: WhiteDwarfRecord[]): WhiteDwarfSummary {
  return {
    sampleCount: records.length,
    repairedVelocityCount: records.filter((record) => record.velocityRepairApplied).length,
    medianMassSolar: median(records.map((record) => record.massSolar)),
    medianRadiusSolar: median(records.map((record) => record.radiusSolar)),
    medianRedshiftKmS: median(records.map((record) => record.gravitationalRedshiftKmS)),
  };
}

function buildAnchors(source: SourceDescriptor): WhiteDwarfAnchor[] {
  return CURATED_WHITE_DWARFS.map((entry) => ({
    id: entry.id,
    name: entry.name,
    raDeg: entry.raDeg,
    decDeg: entry.decDeg,
    distancePc: entry.distancePc,
    cartesianPc: equatorialToCartesianPc(entry.raDeg, entry.decDeg, entry.distancePc),
    spectralType: entry.spectralType,
    effectiveTemperatureK: entry.effectiveTemperatureK,
    massSolar: entry.massSolar,
    radiusSolar: entry.radiusSolar,
    gravitationalRedshiftKmS: entry.gravitationalRedshiftKmS,
    tags: entry.tags,
    provenance: [
      source,
      {
        id: `anchor-${entry.id}`,
        name: `${entry.name} anchor`,
        kind: "catalog",
        url: entry.sourceUrl,
        accessedAt: new Date().toISOString(),
        cache: "miss",
      },
    ],
  }));
}

export async function getWhiteDwarfCatalog(): Promise<WhiteDwarfCatalog> {
  const [syntheticStat, tremblayStat] = await Promise.all([fs.stat(SYNTHETIC_CSV), fs.stat(TREMBLAY_CSV)]);
  const key = `${syntheticStat.mtimeMs}:${tremblayStat.mtimeMs}`;
  if (cache?.key === key) {
    return cache.catalog;
  }

  const syntheticSource = localSource("local-wd-synthetic", "Local synthetic white dwarf sample", SYNTHETIC_CSV);
  const tremblaySource = localSource("local-wd-tremblay", "Local Tremblay white dwarf sample", TREMBLAY_CSV);
  const anchorSource = {
    id: "nearby-white-dwarf-anchors",
    name: "Curated nearby white dwarf anchors",
    kind: "catalog" as const,
    url: "https://science.nasa.gov/universe/stars/white-dwarfs/",
    accessedAt: new Date().toISOString(),
    cache: "miss" as const,
  };

  const [syntheticRows, tremblayRows] = await Promise.all([loadCsv(SYNTHETIC_CSV), loadCsv(TREMBLAY_CSV)]);
  const records = [
    ...syntheticRows.map((row) => syntheticRecord(row, syntheticSource)),
    ...tremblayRows.map((row) => tremblayRecord(row, tremblaySource)),
  ];

  const catalog: WhiteDwarfCatalog = {
    generatedAt: new Date().toISOString(),
    summary: buildSummary(records),
    records,
    anchors: buildAnchors(anchorSource),
    sources: [syntheticSource, tremblaySource, anchorSource],
  };

  cache = { key, catalog };
  return catalog;
}
