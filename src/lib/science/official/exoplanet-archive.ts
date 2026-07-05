import { createHash } from "node:crypto";
import { readThroughJsonCache } from "@/lib/cache/file-cache";
import type { ArchivePlanetRow, SourceDescriptor } from "@/lib/science/types";

const NASA_EXOPLANET_ARCHIVE_DOCS = "https://exoplanetarchive.ipac.caltech.edu/docs/program_interfaces.html";
const NASA_EXOPLANET_ARCHIVE_TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
const MAX_ARCHIVE_INPUT_LENGTH = 120;
const ARCHIVE_SAFE_INPUT = /^[A-Za-z0-9 .+\-_'()/]*$/;
const ARCHIVE_COLUMNS = [
  "pl_name",
  "hostname",
  "ra",
  "dec",
  "sy_dist",
  "pl_rade",
  "pl_radeerr1",
  "pl_radeerr2",
  "pl_bmasse",
  "pl_bmasseerr1",
  "pl_bmasseerr2",
  "pl_eqt",
  "pl_eqterr1",
  "pl_eqterr2",
  "pl_orbper",
  "pl_orbpererr1",
  "pl_orbpererr2",
  "pl_orbsmax",
  "pl_orbsmaxerr1",
  "pl_orbsmaxerr2",
  "pl_dens",
  "pl_insol",
  "pl_orbeccen",
  "pl_orbincl",
  "pl_orblper",
  "pl_orbtper",
  "pl_tranmid",
  "pl_trandep",
  "pl_trandur",
  "st_teff",
  "st_tefferr1",
  "st_tefferr2",
  "st_rad",
  "st_raderr1",
  "st_raderr2",
  "st_mass",
  "st_masserr1",
  "st_masserr2",
  "st_spectype",
  "st_lum",
  "st_age",
  "st_met",
  "st_logg",
  "sy_vmag",
  "sy_jmag",
  "sy_hmag",
  "sy_kmag",
  "sy_gaiamag",
  "disc_facility",
  "disc_year",
].join(",");

function normalizeArchiveInput(value: string | null | undefined) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, MAX_ARCHIVE_INPUT_LENGTH);
}

function ensureArchiveSafeInput(value: string, context: string) {
  if (!value) return value;
  if (!ARCHIVE_SAFE_INPUT.test(value)) {
    throw new Error(`Unsupported characters in NASA archive ${context}.`);
  }
  return value;
}

function tapStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function fetchNearbyArchivePlanets(params: {
  radiusPc: number;
  limit: number;
  search?: string | null;
}) {
  const radiusPc = Math.max(1, Math.min(params.radiusPc, 5000));
  const limit = Math.max(10, Math.min(params.limit, 4000));
  const search = ensureArchiveSafeInput(normalizeArchiveInput(params.search), "search term");
  const cacheKey = ["nasa-archive", radiusPc, limit, search.toLowerCase() || "all"].join("-");

  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 12, async () => {
    const clauses = [
      `sy_dist <= ${radiusPc}`,
      "pl_controv_flag = 0",
      "ra IS NOT NULL",
      "dec IS NOT NULL",
      "hostname IS NOT NULL",
      "pl_name IS NOT NULL",
    ];

    if (search) {
      const pattern = tapStringLiteral(`%${search}%`);
      clauses.push(`(LOWER(pl_name) LIKE LOWER(${pattern}) OR LOWER(hostname) LIKE LOWER(${pattern}))`);
    }

    const sql = [
      `select ${ARCHIVE_COLUMNS}`,
      "from pscomppars",
      `where ${clauses.join(" and ")}`,
      "order by sy_dist asc",
    ].join(" ");

    const url = `${NASA_EXOPLANET_ARCHIVE_TAP}?query=${encodeURIComponent(sql)}&format=json`;
    const response = await fetch(url, {
      headers: {
        "user-agent": "Cosmoplot/next-rewrite",
      },
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`NASA Exoplanet Archive error ${response.status}: ${text.slice(0, 240)}`);
    }

    const rows = (await response.json()) as ArchivePlanetRow[];
    return rows.slice(0, limit);
  });

  const source: SourceDescriptor = {
    id: "nasa-exoplanet-archive",
    name: "NASA Exoplanet Archive",
    kind: "catalog",
    url: NASA_EXOPLANET_ARCHIVE_DOCS,
    accessedAt: result.createdAt,
    cache: result.cache,
  };

  return {
    rows: result.payload,
    source,
  };
}

export async function fetchArchivePlanetByName(planetName: string) {
  const normalized = ensureArchiveSafeInput(normalizeArchiveInput(planetName), "planet name");
  if (!normalized) {
    throw new Error("Planet name is required for archive detail lookup.");
  }

  const cacheKey = ["nasa-archive-planet", normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-")].join("-");
  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 12, async () => {
    const sql = [
      `select top 1 ${ARCHIVE_COLUMNS}`,
      "from pscomppars",
      `where LOWER(pl_name) = LOWER(${tapStringLiteral(normalized)})`,
    ].join(" ");

    const url = `${NASA_EXOPLANET_ARCHIVE_TAP}?query=${encodeURIComponent(sql)}&format=json`;
    const response = await fetch(url, {
      headers: {
        "user-agent": "Cosmoplot/next-rewrite",
      },
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`NASA Exoplanet Archive detail error ${response.status}: ${text.slice(0, 240)}`);
    }

    const rows = (await response.json()) as ArchivePlanetRow[];
    return rows[0] ?? null;
  });

  const source: SourceDescriptor = {
    id: "nasa-exoplanet-archive",
    name: "NASA Exoplanet Archive",
    kind: "catalog",
    url: NASA_EXOPLANET_ARCHIVE_DOCS,
    accessedAt: result.createdAt,
    cache: result.cache,
  };

  return {
    row: result.payload,
    source,
  };
}

export async function fetchArchivePlanetsByNames(planetNames: string[]) {
  const normalizedNames = Array.from(
    new Set(
      planetNames
        .map((name) => ensureArchiveSafeInput(normalizeArchiveInput(name), "planet name"))
        .filter(Boolean)
        .map((name) => name.toLowerCase()),
    ),
  ).sort();

  if (!normalizedNames.length) {
    return {
      rows: [] as ArchivePlanetRow[],
      source: {
        id: "nasa-exoplanet-archive",
        name: "NASA Exoplanet Archive",
        kind: "catalog" as const,
        url: NASA_EXOPLANET_ARCHIVE_DOCS,
        accessedAt: new Date().toISOString(),
        cache: "hit" as const,
      },
    };
  }

  const cacheDigest = createHash("sha1").update(normalizedNames.join("|")).digest("hex");
  const cacheKey = `nasa-archive-planets-${normalizedNames.length}-${cacheDigest}`;
  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 12, async () => {
    const namesClause = normalizedNames.map((name) => tapStringLiteral(name)).join(", ");
    const sql = [
      `select ${ARCHIVE_COLUMNS}`,
      "from pscomppars",
      `where LOWER(pl_name) IN (${namesClause})`,
      "and pl_controv_flag = 0",
      "and ra IS NOT NULL",
      "and dec IS NOT NULL",
      "and hostname IS NOT NULL",
      "and pl_name IS NOT NULL",
      "order by sy_dist asc",
    ].join(" ");

    const url = `${NASA_EXOPLANET_ARCHIVE_TAP}?query=${encodeURIComponent(sql)}&format=json`;
    const response = await fetch(url, {
      headers: {
        "user-agent": "Cosmoplot/next-rewrite",
      },
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`NASA Exoplanet Archive list error ${response.status}: ${text.slice(0, 240)}`);
    }

    return (await response.json()) as ArchivePlanetRow[];
  });

  const source: SourceDescriptor = {
    id: "nasa-exoplanet-archive",
    name: "NASA Exoplanet Archive",
    kind: "catalog",
    url: NASA_EXOPLANET_ARCHIVE_DOCS,
    accessedAt: result.createdAt,
    cache: result.cache,
  };

  return {
    rows: result.payload,
    source,
  };
}
