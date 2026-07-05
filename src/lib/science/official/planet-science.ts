import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { readThroughJsonCache } from "@/lib/cache/file-cache";
import {
  getLegacyLocalSource,
  getLegacyPlanetBundle,
  getLegacyPlanetEntry,
} from "@/lib/science/local/legacy-analysis";
import { fetchArchivePlanetByName } from "@/lib/science/official/exoplanet-archive";
import { deriveRetentionAudit, inferInteriorStructure, propagateCatalogPlanet } from "@/lib/science/physics";
import { measurementBounds } from "@/lib/utils";
import type {
  AtmosphereEvidence,
  AtmosphereEvidenceTag,
  JwstObservation,
  JwstProduct,
  NumericSpectrumSeries,
  PlanetMagnetosphere,
  PlanetPhotometry,
  PlanetScienceBundle,
  SourceDescriptor,
} from "@/lib/science/types";

const EXOMAST_BASE = "https://exo.mast.stsci.edu/api/v0.1";
const MAST_API = "https://mast.stsci.edu/api/v0/invoke";
const MAST_DOCS = "https://mast.stsci.edu/api/v0/";
const EARTH_FLUX_WM2 = 1361;
const G = 6.674e-11;
const KB = 1.381e-23;
const EV = 1.602e-19;
const M_EARTH = 5.972e24;
const R_EARTH = 6.371e6;
const R_SUN = 6.957e8;
const AMU = 1.6605390666e-27;
const execFileAsync = promisify(execFile);
const FITS_EXTRACTOR_SCRIPT = path.join(process.cwd(), "scripts", "extract_jwst_fits_spectrum.py");
const FITS_EXTRACTOR_RUNNER = path.join(process.cwd(), "scripts", "run_fits_extractor.sh");
const REMOTE_FETCH_TIMEOUT_MS = 12000;
const FITS_EXTRACT_TIMEOUT_MS = 15000;
const MAST_API_TOKEN = process.env.MAST_API_TOKEN ?? process.env.MAST_TOKEN ?? null;

type ExoMastProperty = Record<string, unknown>;
type MastApiRow = Record<string, unknown>;
type ParsedSpectrum = {
  wavelengthsUm: number[];
  depthsPpm: number[];
  uncertaintiesPpm: number[];
  minUm: number | null;
  maxUm: number | null;
  amplitudePpm: number | null;
  slopePpmPerUm: number | null;
};

type MastRetrievePayload = Record<string, unknown>;

type DerivedSpectrumSummary = {
  medianSnr: number | null;
};

const MOLECULE_WINDOWS: Array<{ molecule: string; centerUm: number; widthUm: number }> = [
  { molecule: "Na", centerUm: 0.589, widthUm: 0.03 },
  { molecule: "K", centerUm: 0.77, widthUm: 0.05 },
  { molecule: "H2O", centerUm: 1.4, widthUm: 0.12 },
  { molecule: "CH4", centerUm: 1.7, widthUm: 0.12 },
  { molecule: "H2O", centerUm: 1.9, widthUm: 0.14 },
  { molecule: "CO2", centerUm: 2.0, widthUm: 0.15 },
  { molecule: "CH4", centerUm: 2.3, widthUm: 0.14 },
  { molecule: "H2O", centerUm: 2.7, widthUm: 0.18 },
  { molecule: "CH4", centerUm: 3.3, widthUm: 0.18 },
  { molecule: "SO2", centerUm: 4.05, widthUm: 0.18 },
  { molecule: "CO2", centerUm: 4.3, widthUm: 0.2 },
  { molecule: "CO", centerUm: 4.6, widthUm: 0.18 },
  { molecule: "H2O", centerUm: 6.3, widthUm: 0.28 },
  { molecule: "SO2", centerUm: 7.3, widthUm: 0.24 },
  { molecule: "CH4", centerUm: 7.7, widthUm: 0.28 },
  { molecule: "SO2", centerUm: 8.7, widthUm: 0.28 },
  { molecule: "NH3", centerUm: 10.5, widthUm: 0.4 },
];

const TITLE_KEYWORDS: Array<{ pattern: RegExp; molecule: string; status: AtmosphereEvidenceTag["status"]; confidence: AtmosphereEvidenceTag["confidence"] }> = [
  { pattern: /\bSO2\b|sulfur dioxide/i, molecule: "SO2", status: "mentioned", confidence: "high" },
  { pattern: /\bCO2\b|carbon dioxide/i, molecule: "CO2", status: "mentioned", confidence: "high" },
  { pattern: /\bCO\b|carbon monoxide/i, molecule: "CO", status: "mentioned", confidence: "medium" },
  { pattern: /\bCH4\b|methane/i, molecule: "CH4", status: "mentioned", confidence: "high" },
  { pattern: /\bH2O\b|water/i, molecule: "H2O", status: "mentioned", confidence: "high" },
  { pattern: /\bNH3\b|ammonia/i, molecule: "NH3", status: "mentioned", confidence: "medium" },
  { pattern: /\bhaze\b/i, molecule: "haze", status: "mentioned", confidence: "medium" },
  { pattern: /\bcloud\b/i, molecule: "cloud", status: "mentioned", confidence: "medium" },
];

function slug(input: string) {
  return String(input || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function asString(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
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

function spectralClassBucket(spectralType: string | null) {
  const letter = String(spectralType || "").trim().charAt(0).toUpperCase();
  return /[OBAFGKM]/.test(letter) ? letter : "G";
}

function inferTidalLock(semiMajorAxisAu: number | null, orbitalPeriodDays: number | null) {
  return !!semiMajorAxisAu && !!orbitalPeriodDays && semiMajorAxisAu < 0.08 && orbitalPeriodDays < 12;
}

function estimateMeanMolecularWeightKg(massEarth: number | null, densityGcc: number | null, equilibriumK: number | null) {
  if ((massEarth ?? 0) > 60) return 2.3 * AMU;
  if ((densityGcc ?? 0) < 2.2) return 2.8 * AMU;
  if ((equilibriumK ?? 0) > 900) return 20 * AMU;
  if ((densityGcc ?? 5.5) > 5.3) return 28 * AMU;
  return 18 * AMU;
}

function deriveSurfaceGravityMs2(massEarth: number | null, radiusEarth: number | null) {
  if (!massEarth || !radiusEarth) return null;
  return 9.80665 * (massEarth / (radiusEarth * radiusEarth));
}

function deriveDensityGcc(massEarth: number | null, radiusEarth: number | null) {
  if (!massEarth || !radiusEarth) return null;
  return 5.51 * (massEarth / Math.pow(radiusEarth, 3));
}

function deriveLuminositySolar(logLuminosity: number | null, radiusSolar: number | null, teffK: number | null) {
  if (logLuminosity !== null && logLuminosity !== undefined) return 10 ** logLuminosity;
  if (!radiusSolar || !teffK) return null;
  return radiusSolar * radiusSolar * Math.pow(teffK / 5772, 4);
}

function deriveRadiationFlux(luminositySolar: number | null, semiMajorAxisAu: number | null, archiveFluxEarth: number | null) {
  const fluxEarthMultiple =
    archiveFluxEarth
    ?? (luminositySolar && semiMajorAxisAu ? luminositySolar / Math.pow(semiMajorAxisAu, 2) : null);
  return {
    fluxEarthMultiple,
    fluxWm2: fluxEarthMultiple !== null ? fluxEarthMultiple * EARTH_FLUX_WM2 : null,
  };
}

function deriveMagnetosphere(input: {
  massEarth: number | null;
  radiusEarth: number | null;
  densityGcc: number | null;
  equilibriumK: number | null;
  orbitalPeriodDays: number | null;
  semiMajorAxisAu: number | null;
  fluxEarthMultiple: number | null;
  spectralType: string | null;
  tidallyLocked: boolean;
}): PlanetMagnetosphere {
  const massEarth = input.massEarth;
  const radiusEarth = input.radiusEarth;
  const equilibriumK = input.equilibriumK ?? 280;
  const densityGcc = input.densityGcc;
  const orbitalPeriodDays = input.orbitalPeriodDays ?? 30;
  const semiMajorAxisAu = input.semiMajorAxisAu;
  const fluxEarthMultiple = input.fluxEarthMultiple ?? null;
  const tidallyLocked = input.tidallyLocked;

  if (!massEarth || !radiusEarth) {
    return {
      magneticFactor: null,
      stellarWindStress: fluxEarthMultiple,
      correctedBindingRatio: null,
      surfaceFieldMicroTesla: null,
      magnetopauseRadii: null,
      protection: "unresolved",
      protected: null,
    };
  }

  const rotationProxyDays = tidallyLocked ? orbitalPeriodDays : Math.max(0.3, orbitalPeriodDays * 0.2);
  const fRot =
    rotationProxyDays < 3 ? 0.3 : rotationProxyDays < 10 ? 0.5 : rotationProxyDays < 30 ? 0.7 : 1.0;

  const coreFrac =
    densityGcc !== null && densityGcc !== undefined
      ? densityGcc >= 5.4
        ? 0.62
        : densityGcc >= 4.0
          ? 0.48
          : massEarth > 20
            ? 0.2
            : 0.34
      : massEarth > 10
        ? 0.2
        : 0.5;
  const fCore = Math.max(0.25, Math.min(1, 0.35 + coreFrac));
  const magneticFactor = fRot * fCore;

  const starStressFactor = { O: 6, B: 4.5, A: 2.5, F: 1.4, G: 1, K: 1.7, M: 3.6 }[spectralClassBucket(input.spectralType)] ?? 1;
  const stellarWindStress = semiMajorAxisAu ? starStressFactor / (semiMajorAxisAu * semiMajorAxisAu) : Math.max(fluxEarthMultiple ?? 1, 1);
  const swPenalty = 1 + Math.log10(Math.max(stellarWindStress, 1));

  const mu = estimateMeanMolecularWeightKg(massEarth, densityGcc, equilibriumK);
  const massKg = massEarth * M_EARTH;
  const radiusM = radiusEarth * R_EARTH;
  const particleBindingEv = (G * massKg * mu / radiusM) / EV;
  const thermalEv = (KB * equilibriumK) / EV;
  const bindingRatio = thermalEv > 0 ? particleBindingEv / thermalEv : null;
  const correctedBindingRatio =
    bindingRatio === null ? null : bindingRatio * (0.7 + 0.6 * magneticFactor) / Math.sqrt(swPenalty);

  const dynamoScale = Math.pow(Math.max(massEarth / (radiusEarth * radiusEarth), 0.08), 0.38);
  const irradiationPenalty = Math.pow(Math.max(fluxEarthMultiple ?? stellarWindStress, 0.12), 0.18);
  const surfaceFieldMicroTesla = 50 * magneticFactor * dynamoScale * (tidallyLocked ? 0.72 : 1) / irradiationPenalty;
  const magnetopauseRadii = 10 * Math.pow(Math.max(surfaceFieldMicroTesla, 0.08) / 50, 1 / 3) / Math.pow(Math.max(swPenalty, 1), 0.48);

  let protection: PlanetMagnetosphere["protection"] = "stressed";
  if (magnetopauseRadii > 14 && (correctedBindingRatio ?? 0) > 28) protection = "strong";
  else if (magnetopauseRadii > 7 && (correctedBindingRatio ?? 0) > 16) protection = "moderate";
  else if (magnetopauseRadii > 3 && (correctedBindingRatio ?? 0) > 8) protection = "weak";

  return {
    magneticFactor,
    stellarWindStress,
    correctedBindingRatio,
    surfaceFieldMicroTesla,
    magnetopauseRadii,
    protection,
    protected: protection === "strong" || protection === "moderate",
  };
}

function extractReferences(properties: ExoMastProperty) {
  const refs = new Map<string, { label: string; url: string }>();

  for (const [key, value] of Object.entries(properties)) {
    if (!key.endsWith("_url")) continue;
    const url = asString(value);
    if (!url) continue;
    const baseKey = key.slice(0, -4);
    const label = asString(properties[`${baseKey}_ref`]) ?? baseKey.replaceAll("_", " ");
    refs.set(url, { label, url });
  }

  return Array.from(refs.values()).slice(0, 20);
}

async function fetchWithTimeout(input: string, init: RequestInit & { next?: { revalidate?: number } } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers ?? {});
    if (MAST_API_TOKEN && /mast\.stsci\.edu|archive\.stsci\.edu/i.test(input)) {
      headers.set("Authorization", `token ${MAST_API_TOKEN}`);
    }
    return await fetch(input, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildSourceDescriptor(id: string, name: string, url: string, accessedAt: string, cache: "hit" | "miss"): SourceDescriptor {
  return {
    id,
    name,
    kind: "archive",
    url,
    accessedAt,
    cache,
  };
}

function buildMissSourceDescriptor(id: string, name: string, url: string) {
  return buildSourceDescriptor(id, name, url, new Date().toISOString(), "miss");
}

function buildMastDownloadUrl(dataUri: string | null, filename: string) {
  const uri = asString(dataUri) ?? `mast:JWST/product/${filename}`;
  return `https://mast.stsci.edu/api/v0.1/Download/file?uri=${encodeURIComponent(uri)}`;
}

function mergeUniqueTags(current: AtmosphereEvidenceTag[], extra: AtmosphereEvidenceTag[]) {
  const merged = new Map<string, AtmosphereEvidenceTag>();
  for (const tag of [...current, ...extra]) {
    const key = `${tag.molecule}:${tag.status}`;
    if (!merged.has(key)) merged.set(key, tag);
  }
  return Array.from(merged.values());
}

function referencesFromDocs(docs?: Record<string, string>) {
  return Object.entries(docs ?? {})
    .map(([label, url]) => ({
      label: label.replaceAll("_", " "),
      url,
    }))
    .filter((entry) => !!entry.url);
}

function classifyLegacyProtection(input: {
  protectedFlag: boolean | null | undefined;
  surfaceFieldMicroTesla: number | null | undefined;
  magnetopauseRadii: number | null | undefined;
}): PlanetMagnetosphere["protection"] {
  if (input.protectedFlag === true) {
    if ((input.magnetopauseRadii ?? 0) > 12 || (input.surfaceFieldMicroTesla ?? 0) > 45) return "strong";
    return "moderate";
  }
  if ((input.magnetopauseRadii ?? 0) > 4 || (input.surfaceFieldMicroTesla ?? 0) > 8) return "weak";
  if (input.surfaceFieldMicroTesla === null && input.magnetopauseRadii === null) return "unresolved";
  return "stressed";
}

async function fetchExoMastProperties(planetName: string) {
  const cacheKey = `exomast-properties-${slug(planetName)}`;
  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 12, async () => {
    const url = `${EXOMAST_BASE}/exoplanets/${encodeURIComponent(planetName)}/properties`;
    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent": "Cosmoplot/next-rewrite",
      },
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`exo.MAST properties error ${response.status}: ${text.slice(0, 240)}`);
    }
    const rows = (await response.json()) as ExoMastProperty[];
    return rows[0] ?? null;
  });

  return {
    property: result.payload,
    source: buildSourceDescriptor(
      "exo-mast-properties",
      "STScI exo.MAST",
      "https://exo.mast.stsci.edu/",
      result.createdAt,
      result.cache,
    ),
  };
}

async function fetchExoMastSpectraFileList(planetName: string) {
  const cacheKey = `exomast-spectra-filelist-${slug(planetName)}`;
  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 12, async () => {
    const url = `${EXOMAST_BASE}/spectra/${encodeURIComponent(planetName)}/filelist/`;
    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent": "Cosmoplot/next-rewrite",
      },
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) return [] as string[];
    const payload = (await response.json()) as unknown;
    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { filenames?: unknown }).filenames)
        ? (payload as { filenames: Array<Record<string, unknown> | string> }).filenames
        : [];
    return entries
      .map((entry) => {
        if (typeof entry === "string") return entry;
        return asString(entry.filename) ?? asString(entry.productFilename) ?? asString(entry.dataURI) ?? null;
      })
      .filter((entry): entry is string => !!entry);
  });

  return {
    files: result.payload,
    source: buildSourceDescriptor(
      "exo-mast-spectra",
      "STScI exo.MAST Spectra",
      "https://exo.mast.stsci.edu/docs/",
      result.createdAt,
      result.cache,
    ),
  };
}

async function fetchExoMastCuratedSpectrumText(planetName: string, filename: string) {
  const cacheKey = `exomast-spectrum-file-${slug(planetName)}-${slug(filename)}`;
  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 24, async () => {
    const url = `${EXOMAST_BASE}/spectra/${encodeURIComponent(planetName)}/file/${encodeURIComponent(filename)}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent": "Cosmoplot/next-rewrite",
      },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`exo.MAST curated spectrum error ${response.status}: ${text.slice(0, 240)}`);
    }
    return await response.text();
  });

  return {
    text: result.payload,
    source: buildSourceDescriptor(
      "exo-mast-curated-spectrum",
      "STScI exo.MAST Curated Spectrum",
      `${EXOMAST_BASE}/spectra/${encodeURIComponent(planetName)}/file/${encodeURIComponent(filename)}`,
      result.createdAt,
      result.cache,
    ),
  };
}

async function fetchMastJson(service: string, params: Record<string, unknown>, pageSize = 50) {
  const payload = {
    service,
    format: "json",
    params,
    pagesize: pageSize,
    page: 1,
    removenullcolumns: true,
    timeout: 30,
  };

  const response = await fetchWithTimeout(MAST_API, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/plain",
      "user-agent": "Cosmoplot/next-rewrite",
    },
    body: `request=${encodeURIComponent(JSON.stringify(payload))}`,
    next: { revalidate: 60 * 60 * 12 },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MAST API error ${response.status}: ${text.slice(0, 240)}`);
  }

  return (await response.json()) as { data?: MastApiRow[] };
}

function approximateWavelengthRange(instrumentName: string | null, filters: string | null) {
  const key = `${String(instrumentName || "").toUpperCase()} ${String(filters || "").toUpperCase()}`;
  if (key.includes("G395H")) return { minUm: 2.87, maxUm: 5.27 };
  if (key.includes("G395M")) return { minUm: 2.87, maxUm: 5.14 };
  if (key.includes("G235H")) return { minUm: 1.66, maxUm: 3.17 };
  if (key.includes("G235M")) return { minUm: 1.66, maxUm: 3.17 };
  if (key.includes("G140H")) return { minUm: 0.97, maxUm: 1.89 };
  if (key.includes("G140M")) return { minUm: 0.97, maxUm: 1.89 };
  if (key.includes("PRISM") || key.includes("CLEAR")) return { minUm: 0.6, maxUm: 5.3 };
  if (key.includes("GR700XD") || key.includes("SOSS")) return { minUm: 0.6, maxUm: 2.8 };
  if (key.includes("P750L")) return { minUm: 5, maxUm: 12 };
  return { minUm: null, maxUm: null };
}

async function fetchMastJwstObservations(hostName: string | null) {
  const targetName = asString(hostName);
  if (!targetName) {
    return {
      observations: [] as JwstObservation[],
      source: buildSourceDescriptor("mast-jwst-observations", "MAST JWST Observations", MAST_DOCS, new Date().toISOString(), "miss"),
    };
  }

  const cacheKey = `mast-jwst-observations-${slug(targetName)}`;
  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 12, async () => {
    const payload = await fetchMastJson("Mast.Caom.Filtered", {
      columns: "obsid,obs_collection,target_name,instrument_name,proposal_id,proposal_pi,filters,wavelength_region,dataproduct_type,obs_title",
      filters: [
        { paramName: "obs_collection", values: ["JWST"] },
        { paramName: "target_name", values: [targetName] },
      ],
    }, 100);

    const rows = payload.data ?? [];
    return rows
      .filter((row) => ["timeseries", "spectrum"].includes(String(row.dataproduct_type || "").toLowerCase()))
      .map((row) => {
        const range = approximateWavelengthRange(asString(row.instrument_name), asString(row.filters));
        return {
          obsid: String(row.obsid),
          targetName: asString(row.target_name) ?? targetName,
          proposalId: asString(row.proposal_id),
          proposalPi: asString(row.proposal_pi),
          instrumentName: asString(row.instrument_name),
          filters: asString(row.filters),
          dataproductType: asString(row.dataproduct_type),
          wavelengthRegion: asString(row.wavelength_region),
          obsTitle: asString(row.obs_title),
          approximateWavelengthMinUm: range.minUm,
          approximateWavelengthMaxUm: range.maxUm,
        } satisfies JwstObservation;
      });
  });

  return {
    observations: result.payload,
    source: buildSourceDescriptor("mast-jwst-observations", "MAST JWST Observations", MAST_DOCS, result.createdAt, result.cache),
  };
}

function keepInterestingProduct(row: MastApiRow) {
  const subgroup = String(row.productSubGroupDescription || "").toUpperCase();
  const filename = String(row.productFilename || "").toLowerCase();
  if (["X1D", "X1DINTS", "S3D", "I2D", "WHTLT", "ASN", "POOL"].includes(subgroup)) return true;
  if (String(row.productType || "").toUpperCase() === "PREVIEW" && /(x1d|s3d|i2d|whtlt)/.test(filename)) return true;
  return false;
}

async function fetchMastProducts(obsids: string[]) {
  const uniqueObsids = Array.from(new Set(obsids)).slice(0, 8);
  if (!uniqueObsids.length) {
    return {
      products: [] as JwstProduct[],
      source: buildSourceDescriptor("mast-jwst-products", "MAST JWST Products", MAST_DOCS, new Date().toISOString(), "miss"),
    };
  }

  const cacheKey = `mast-jwst-products-${uniqueObsids.join("-")}`;
  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 12, async () => {
    const nested = await Promise.all(
      uniqueObsids.map(async (obsid) => {
        const payload = await fetchMastJson("Mast.Caom.Products", { obsid }, 200);
        return (payload.data ?? [])
          .filter(keepInterestingProduct)
          .map((row) => ({
            obsid,
            productFilename: String(row.productFilename || ""),
            productType: asString(row.productType),
            productGroupDescription: asString(row.productGroupDescription),
            productSubGroupDescription: asString(row.productSubGroupDescription),
            calibLevel: asNumber(row.calib_level),
            size: asNumber(row.size),
            dataUri: asString(row.dataURI),
          }) satisfies JwstProduct);
      }),
    );
    return nested.flat();
  });

  return {
    products: result.payload,
    source: buildSourceDescriptor("mast-jwst-products", "MAST JWST Products", MAST_DOCS, result.createdAt, result.cache),
  };
}

function isNumericSpectrumProduct(product: JwstProduct) {
  const subgroup = String(product.productSubGroupDescription || "").toUpperCase();
  const filename = product.productFilename.toLowerCase();
  return (
    subgroup === "X1D"
    || subgroup === "X1DINTS"
    || subgroup === "S3D"
    || /(?:_x1d|_x1dints|_s3d)\.fits$/.test(filename)
  );
}

async function fetchMastSpectralDbSeries(filename: string) {
  const cacheKey = `mast-spectral-series-${slug(filename)}`;
  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 24, async () => {
    const [retrieveResponse, derivedResponse] = await Promise.all([
      fetchWithTimeout(`https://mast.stsci.edu/spectra/api/v0.1/retrieve?filename=${encodeURIComponent(filename)}`, {
        headers: {
          "user-agent": "Cosmoplot/next-rewrite",
          accept: "application/json",
        },
        next: { revalidate: 60 * 60 * 24 },
      }),
      fetchWithTimeout(`https://mast.stsci.edu/spectra/api/v0.1/retrieve/derived?filename=${encodeURIComponent(filename)}`, {
        headers: {
          "user-agent": "Cosmoplot/next-rewrite",
          accept: "application/json",
        },
        next: { revalidate: 60 * 60 * 24 },
      }),
    ]);

    const retrievePayload = retrieveResponse.ok ? await retrieveResponse.json() as MastRetrievePayload : null;
    const derivedPayload = derivedResponse.ok ? await derivedResponse.json() as unknown : null;
    return {
      retrievePayload,
      derivedPayload,
    };
  });

  const arrays = result.payload.retrievePayload ? extractMastSpectrumArrays(result.payload.retrievePayload) : null;
  if (!arrays) return null;

  const derived = parseDerivedSpectrumSummary(result.payload.derivedPayload);
  return {
    series: buildNumericSpectrumSeries({
      label: "JWST product spectrum",
      filename,
      source: "mast-product",
      valueKind: "flux_jy",
      wavelengthUm: arrays.wavelengthUm,
      values: arrays.fluxJy,
      uncertainties: arrays.fluxErrJy,
      medianSnr: derived.medianSnr,
    }),
    source: buildSourceDescriptor(
      `mast-spectraldb-${slug(filename)}`,
      "MAST JWST Spectral DB",
      `https://mast.stsci.edu/spectra/api/v0.1/retrieve?filename=${encodeURIComponent(filename)}`,
      result.createdAt,
      result.cache,
    ),
  };
}

async function fetchMastDirectFitsSeries(product: JwstProduct) {
  if (!existsSync(FITS_EXTRACTOR_SCRIPT) || !existsSync(FITS_EXTRACTOR_RUNNER)) return null;

  const downloadUrl = buildMastDownloadUrl(product.dataUri, product.productFilename);
  const cacheKey = `mast-direct-fits-${slug(product.productFilename)}`;
  const result = await readThroughJsonCache(cacheKey, 1000 * 60 * 60 * 24, async () => {
    try {
      const { stdout } = await execFileAsync(
        FITS_EXTRACTOR_RUNNER,
        [downloadUrl],
        {
          cwd: process.cwd(),
          env: process.env,
          maxBuffer: 32 * 1024 * 1024,
          timeout: FITS_EXTRACT_TIMEOUT_MS,
          killSignal: "SIGKILL",
        },
      );
      return JSON.parse(stdout) as {
        ok?: boolean;
        series?: {
          label?: string | null;
          wavelengthUm?: number[];
          values?: number[];
          uncertainties?: number[];
          valueUnit?: string | null;
        } | null;
      };
    } catch {
      return { ok: false, series: null };
    }
  });

  const payload = result.payload;
  if (!payload?.ok || !payload.series) return null;
  const valueUnit = asString(payload.series.valueUnit)?.toLowerCase() ?? "";
  const valueKind = valueUnit.includes("ppm") ? "transit_depth_ppm" : "flux_jy";
  const series = buildNumericSpectrumSeries({
    label: payload.series.label ?? "JWST direct FITS spectrum",
    filename: product.productFilename,
    source: "mast-product",
    valueKind,
    wavelengthUm: payload.series.wavelengthUm ?? [],
    values: payload.series.values ?? [],
    uncertainties: payload.series.uncertainties ?? [],
  });

  if (!series) return null;
  return {
    series,
    source: buildSourceDescriptor(
      `mast-direct-fits-${slug(product.productFilename)}`,
      "MAST JWST Direct FITS",
      downloadUrl,
      result.createdAt,
      result.cache,
    ),
  };
}

function parseCuratedTransmissionSpectrum(text: string): ParsedSpectrum | null {
  const wavelengthsUm: number[] = [];
  const depthsPpm: number[] = [];
  const uncertaintiesPpm: number[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const numbers = trimmed.split(/[\s,]+/).map((token) => Number(token)).filter((value) => Number.isFinite(value));
    if (numbers.length < 3) continue;
    const wavelength = numbers[0];
    const depthRaw = numbers[2];
    const uncertaintyRaw = numbers[3] ?? 0;
    if (!Number.isFinite(wavelength) || !Number.isFinite(depthRaw)) continue;

    const depthPpm = depthRaw < 1 ? depthRaw * 1e6 : depthRaw;
    const uncertaintyPpm = uncertaintyRaw < 1 ? uncertaintyRaw * 1e6 : uncertaintyRaw;
    wavelengthsUm.push(wavelength);
    depthsPpm.push(depthPpm);
    uncertaintiesPpm.push(uncertaintyPpm);
  }

  if (!wavelengthsUm.length) return null;
  const minUm = Math.min(...wavelengthsUm);
  const maxUm = Math.max(...wavelengthsUm);
  const amplitudePpm = Math.max(...depthsPpm) - Math.min(...depthsPpm);
  const first = 0;
  const last = wavelengthsUm.length - 1;
  const slopePpmPerUm = maxUm > minUm ? (depthsPpm[last] - depthsPpm[first]) / (wavelengthsUm[last] - wavelengthsUm[first]) : null;

  return {
    wavelengthsUm,
    depthsPpm,
    uncertaintiesPpm,
    minUm,
    maxUm,
    amplitudePpm,
    slopePpmPerUm,
  };
}

function downsampleSeries<T>(values: T[], maxPoints = 512) {
  if (values.length <= maxPoints) return values;
  const stride = values.length / maxPoints;
  const sampled: T[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(values[Math.min(values.length - 1, Math.floor(index * stride))]);
  }
  return sampled;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function buildNumericSpectrumSeries(input: {
  label: string;
  filename: string;
  source: "curated" | "mast-product";
  valueKind: NumericSpectrumSeries["valueKind"];
  wavelengthUm: number[];
  values: number[];
  uncertainties: number[];
  medianSnr?: number | null;
}): NumericSpectrumSeries | null {
  if (!input.wavelengthUm.length || !input.values.length || input.wavelengthUm.length !== input.values.length) return null;
  const wavelengthUm = downsampleSeries(input.wavelengthUm);
  const values = downsampleSeries(input.values, wavelengthUm.length);
  const uncertainties = downsampleSeries(
    input.uncertainties.length === input.values.length ? input.uncertainties : new Array(input.values.length).fill(0),
    wavelengthUm.length,
  );
  const minUm = Math.min(...wavelengthUm);
  const maxUm = Math.max(...wavelengthUm);
  const amplitude = Math.max(...values) - Math.min(...values);
  const slopePerUm = maxUm > minUm ? (values[values.length - 1] - values[0]) / (maxUm - minUm) : null;
  return {
    label: input.label,
    filename: input.filename,
    source: input.source,
    valueKind: input.valueKind,
    wavelengthUm,
    values,
    uncertainties,
    minUm,
    maxUm,
    pointCount: input.wavelengthUm.length,
    amplitude: Number.isFinite(amplitude) ? amplitude : null,
    slopePerUm,
    medianSnr: input.medianSnr ?? median(
      input.values
        .map((value, index) => {
          const sigma = Math.abs(input.uncertainties[index] ?? 0);
          return sigma > 0 ? Math.abs(value / sigma) : null;
        })
        .filter((value): value is number => value !== null && Number.isFinite(value)),
    ),
  };
}

function asNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
}

function extractMastSpectrumArrays(payload: MastRetrievePayload) {
  const root = typeof payload.data === "object" && payload.data !== null ? payload.data as Record<string, unknown> : payload;
  const wavelengthUm = asNumberArray(root.wavelength ?? root.WAVELENGTH);
  const fluxJy = asNumberArray(root.flux ?? root.FLUX ?? root.fluxDensity);
  const fluxErrJy = asNumberArray(root.fluxErr ?? root.FLUX_ERROR ?? root.flux_error);
  if (!wavelengthUm.length || !fluxJy.length || wavelengthUm.length !== fluxJy.length) return null;
  return {
    wavelengthUm,
    fluxJy,
    fluxErrJy: fluxErrJy.length === fluxJy.length ? fluxErrJy : new Array(fluxJy.length).fill(0),
  };
}

function parseDerivedSpectrumSummary(payload: unknown): DerivedSpectrumSummary {
  if (!payload || typeof payload !== "object") return { medianSnr: null };
  const root = payload as Record<string, unknown>;
  return {
    medianSnr:
      asNumber(root.medianSnr)
      ?? asNumber(root.median_snr)
      ?? asNumber(root.snrMedian)
      ?? asNumber(root.snr_median),
  };
}

function oneScaleHeightSignalPpm(input: {
  massEarth: number | null;
  radiusEarth: number | null;
  stellarRadiusSolar: number | null;
  equilibriumK: number | null;
  densityGcc: number | null;
}) {
  if (!input.massEarth || !input.radiusEarth || !input.stellarRadiusSolar || !input.equilibriumK) return null;
  const gravity = deriveSurfaceGravityMs2(input.massEarth, input.radiusEarth);
  if (!gravity) return null;
  const mu = estimateMeanMolecularWeightKg(input.massEarth, input.densityGcc, input.equilibriumK);
  const H = KB * input.equilibriumK / (mu * gravity);
  const Rp = input.radiusEarth * R_EARTH;
  const Rs = input.stellarRadiusSolar * R_SUN;
  return (2 * H * Rp / (Rs * Rs)) * 1e6;
}

function windowFeatureDeltaPpm(spectrum: ParsedSpectrum, centerUm: number, widthUm: number) {
  const windowPoints: number[] = [];
  const baselinePoints: number[] = [];
  for (let i = 0; i < spectrum.wavelengthsUm.length; i += 1) {
    const wavelength = spectrum.wavelengthsUm[i];
    const depth = spectrum.depthsPpm[i];
    if (Math.abs(wavelength - centerUm) <= widthUm) windowPoints.push(depth);
    else if (Math.abs(wavelength - centerUm) <= widthUm * 2.5) baselinePoints.push(depth);
  }
  if (windowPoints.length < 2 || baselinePoints.length < 2) return null;
  const windowMean = windowPoints.reduce((sum, value) => sum + value, 0) / windowPoints.length;
  const baselineMean = baselinePoints.reduce((sum, value) => sum + value, 0) / baselinePoints.length;
  return windowMean - baselineMean;
}

function mergeMoleculeTags(tags: AtmosphereEvidenceTag[]) {
  const ranking = { detected: 4, feature: 3, mentioned: 2, coverage: 1 } as const;
  const confidenceRanking = { high: 3, medium: 2, low: 1 } as const;
  const merged = new Map<string, AtmosphereEvidenceTag>();
  for (const tag of tags) {
    const current = merged.get(tag.molecule);
    if (!current) {
      merged.set(tag.molecule, tag);
      continue;
    }
    const currentRank = ranking[current.status] * 10 + confidenceRanking[current.confidence];
    const nextRank = ranking[tag.status] * 10 + confidenceRanking[tag.confidence];
    if (nextRank > currentRank) merged.set(tag.molecule, tag);
  }
  return Array.from(merged.values());
}

function deriveAtmosphereEvidence(input: {
  planetName: string;
  observations: JwstObservation[];
  curatedSpectra: Array<{ filename: string; spectrum: ParsedSpectrum }>;
  radiusEarth: number | null;
  massEarth: number | null;
  densityGcc: number | null;
  stellarRadiusSolar: number | null;
  equilibriumK: number | null;
}): AtmosphereEvidence {
  const tags: AtmosphereEvidenceTag[] = [];
  const curated = input.curatedSpectra.sort((a, b) => (b.spectrum.maxUm ?? 0) - (a.spectrum.minUm ?? 0) - ((a.spectrum.maxUm ?? 0) - (a.spectrum.minUm ?? 0)))[0] ?? null;
  const oneScalePpm = oneScaleHeightSignalPpm({
    massEarth: input.massEarth,
    radiusEarth: input.radiusEarth,
    stellarRadiusSolar: input.stellarRadiusSolar,
    equilibriumK: input.equilibriumK,
    densityGcc: input.densityGcc,
  });

  let minUm: number | null = curated?.spectrum.minUm ?? null;
  let maxUm: number | null = curated?.spectrum.maxUm ?? null;
  if (minUm === null || maxUm === null) {
    const coverage = input.observations
      .flatMap((observation) => [observation.approximateWavelengthMinUm, observation.approximateWavelengthMaxUm])
      .filter((value): value is number => value !== null && value !== undefined);
    if (coverage.length) {
      minUm = Math.min(...coverage);
      maxUm = Math.max(...coverage);
    }
  }

  if (curated) {
    for (const window of MOLECULE_WINDOWS) {
      if ((curated.spectrum.minUm ?? Infinity) > window.centerUm || (curated.spectrum.maxUm ?? -Infinity) < window.centerUm) continue;
      const delta = windowFeatureDeltaPpm(curated.spectrum, window.centerUm, window.widthUm);
      if (delta === null) continue;
      const thresholdHigh = Math.max(35, (oneScalePpm ?? 60) * 0.5);
      const thresholdLow = Math.max(18, (oneScalePpm ?? 60) * 0.25);
      if (delta > thresholdHigh) {
        tags.push({
          molecule: window.molecule,
          status: "feature",
          confidence: delta > thresholdHigh * 1.6 ? "high" : "medium",
          basis: `${window.centerUm.toFixed(2)} um transmission feature in curated exo.MAST spectrum`,
        });
      } else if (delta > thresholdLow) {
        tags.push({
          molecule: window.molecule,
          status: "coverage",
          confidence: "low",
          basis: `${window.centerUm.toFixed(2)} um window covered with weak modulation`,
        });
      }
    }
  }

  for (const observation of input.observations) {
    const text = `${observation.obsTitle ?? ""} ${observation.instrumentName ?? ""} ${observation.filters ?? ""}`;
    for (const keyword of TITLE_KEYWORDS) {
      if (keyword.pattern.test(text)) {
        tags.push({
          molecule: keyword.molecule,
          status: keyword.status,
          confidence: keyword.confidence,
          basis: `JWST observation title or mode metadata: ${text}`,
        });
      }
    }
    for (const window of MOLECULE_WINDOWS) {
      if (
        observation.approximateWavelengthMinUm !== null
        && observation.approximateWavelengthMaxUm !== null
        && window.centerUm >= observation.approximateWavelengthMinUm
        && window.centerUm <= observation.approximateWavelengthMaxUm
      ) {
        tags.push({
          molecule: window.molecule,
          status: "coverage",
          confidence: "low",
          basis: `${observation.instrumentName ?? "JWST"} ${observation.filters ?? ""} covers ${window.centerUm.toFixed(2)} um`,
        });
      }
    }
  }

  const mergedTags = mergeMoleculeTags(tags).filter((tag) => !["cloud", "haze"].includes(tag.molecule.toLowerCase()));
  const amplitudePpm = curated?.spectrum.amplitudePpm ?? null;
  const slopePpmPerUm = curated?.spectrum.slopePpmPerUm ?? null;
  const scaleHeights = amplitudePpm !== null && oneScalePpm ? amplitudePpm / Math.max(oneScalePpm, 1) : null;

  let cloudInterpretation = "No direct cloud constraint yet; renderer falls back to class and irradiation priors.";
  let cloudCoverFraction: number | null = null;

  if (scaleHeights !== null) {
    if (scaleHeights < 1.5) {
      cloudInterpretation = "Muted transmission amplitude relative to one-scale-height expectation; clouds or haze likely mute spectral features.";
      cloudCoverFraction = 0.82;
    } else if (scaleHeights < 3.5) {
      cloudInterpretation = "Moderate transmission amplitude; partial cloud or haze cover remains plausible.";
      cloudCoverFraction = 0.58;
    } else {
      cloudInterpretation = "Feature-rich transmission amplitude; comparatively clearer upper atmosphere is favored over a fully muted cloud deck.";
      cloudCoverFraction = 0.28;
    }
  } else if (slopePpmPerUm !== null && Math.abs(slopePpmPerUm) > 180) {
    cloudInterpretation = "Strong spectral slope suggests haze or scattering structure in the upper atmosphere.";
    cloudCoverFraction = 0.72;
  }

  if (tags.some((tag) => tag.molecule === "haze")) {
    cloudInterpretation = "JWST observation metadata explicitly references haze-sensitive interpretation; hazes remain part of the active evidence set.";
    cloudCoverFraction = Math.max(cloudCoverFraction ?? 0.7, 0.7);
  }

  return {
    moleculeTags: mergedTags,
    cloudInterpretation,
    cloudCoverFraction,
    spectralAmplitudePpm: amplitudePpm,
    spectralSlopePpmPerUm: slopePpmPerUm,
    wavelengthCoverage: {
      minUm,
      maxUm,
    },
  };
}

function propagatePlanetScience(input: {
  planetName: string;
  radiusEarth: number | null;
  massEarth: number | null;
  equilibriumK: number | null;
  semiMajorAxisAu: number | null;
  stellarTemperatureK: number | null;
  stellarRadiusSolar: number | null;
  stellarMassSolar: number | null;
  uncertainty: PlanetScienceBundle["uncertainty"];
}) {
  return propagateCatalogPlanet(input);
}

const SOLAR_FALLBACKS: Record<string, Omit<PlanetScienceBundle, "fetchedAt" | "sources">> = {
  earth: {
    planetName: "Earth",
    hostName: "Sun",
    stellar: {
      effectiveTemperatureK: 5772,
      radiusSolar: 1,
      massSolar: 1,
      spectralType: "G2V",
      luminositySolar: 1,
      ageGyr: 4.6,
      metallicityDex: 0,
      surfaceGravityLogCgs: 4.44,
      photometry: { vMag: -26.74, jMag: -26.93, hMag: -26.93, kMag: -26.93, gaiaMag: -26.9 },
    },
    physical: {
      radiusEarth: 1,
      massEarth: 1,
      densityGcc: 5.51,
      surfaceGravityMs2: 9.81,
    },
    orbital: {
      periodDays: 365.25,
      semiMajorAxisAu: 1,
      eccentricity: 0.017,
      inclinationDeg: 0,
      transitDepthPpm: null,
      transitDurationHours: null,
      tidallyLocked: false,
    },
    temperatures: {
      equilibriumK: 255,
      daysideK: 288,
      nightsideK: 255,
    },
    radiation: {
      fluxEarthMultiple: 1,
      fluxWm2: EARTH_FLUX_WM2,
    },
    magnetosphere: {
      magneticFactor: 1,
      stellarWindStress: 1,
      correctedBindingRatio: 35,
      surfaceFieldMicroTesla: 50,
      magnetopauseRadii: 10,
      protection: "strong",
      protected: true,
    },
    spectrum: {
      hasSpectra: false,
      fileCount: 0,
      files: [],
      moleculeTags: ["N2", "O2", "H2O", "CO2"],
      jwstObservations: [],
      jwstProducts: [],
      curatedTransmissionFiles: [],
      numericSeries: [],
    },
    atmosphere: {
      moleculeTags: [
        { molecule: "H2O", status: "detected", confidence: "high", basis: "Solar-system reference atmosphere/ocean world" },
        { molecule: "O2", status: "detected", confidence: "high", basis: "Solar-system reference atmosphere" },
        { molecule: "CO2", status: "detected", confidence: "medium", basis: "Solar-system reference atmosphere" },
      ],
      cloudInterpretation: "Resolved cloud systems are known from direct solar-system observation.",
      cloudCoverFraction: 0.55,
      spectralAmplitudePpm: null,
      spectralSlopePpmPerUm: null,
      wavelengthCoverage: { minUm: null, maxUm: null },
    },
    propagation: {
      sampleCount: 0,
      inputMode: "fallback-only",
      radiusEarth: { low: 1, median: 1, high: 1 },
      massEarth: { low: 1, median: 1, high: 1 },
      equilibriumK: { low: 255, median: 255, high: 255 },
      semiMajorAxisAu: { low: 1, median: 1, high: 1 },
      densityGcc: { low: 5.51, median: 5.51, high: 5.51 },
      surfaceGravityMs2: { low: 9.81, median: 9.81, high: 9.81 },
      luminositySolar: { low: 1, median: 1, high: 1 },
      fluxEarthMultiple: { low: 1, median: 1, high: 1 },
      scaleHeightKm: { low: 8.5, median: 8.5, high: 8.5 },
      oneScaleHeightSignalPpm: { low: 0, median: 0, high: 0 },
    },
    retention: deriveRetentionAudit({
      massEarth: 1,
      radiusEarth: 1,
      densityGcc: 5.51,
      equilibriumK: 255,
      semiMajorAxisAu: 1,
      fluxEarthMultiple: 1,
      stellarRadiusSolar: 1,
    }),
    interior: inferInteriorStructure({ massEarth: 1, radiusEarth: 1, densityGcc: 5.51 }),
    references: [
      { label: "NASA Solar System Exploration", url: "https://solarsystem.nasa.gov/planets/earth/overview/" },
    ],
    uncertainty: {
      radiusEarth: measurementBounds(null, null),
      massEarth: measurementBounds(null, null),
      equilibriumK: measurementBounds(null, null),
      periodDays: measurementBounds(null, null),
      semiMajorAxisAu: measurementBounds(null, null),
      stellarTemperatureK: measurementBounds(null, null),
      stellarRadiusSolar: measurementBounds(null, null),
      stellarMassSolar: measurementBounds(null, null),
    },
  },
};

export async function fetchPlanetScienceBundle(planetName: string) {
  const normalized = slug(planetName);
  const solarFallback = SOLAR_FALLBACKS[normalized];
  if (solarFallback) {
    const localAnalysis = await getLegacyPlanetBundle(planetName, solarFallback.hostName);
    const localSource = await getLegacyLocalSource();
    return {
      ...solarFallback,
      fetchedAt: new Date().toISOString(),
      localAnalysis,
      sources: [
        {
          id: "nasa-solar-system-exploration",
          name: "NASA Solar System Exploration",
          kind: "catalog",
          url: "https://solarsystem.nasa.gov/planets/overview/",
          accessedAt: new Date().toISOString(),
          cache: "miss" as const,
        },
        ...(localAnalysis ? [localSource] : []),
      ],
    } satisfies PlanetScienceBundle;
  }

  const [
    { row, source: archiveSource },
    { property, source: mastSource },
    { files: curatedFiles, source: curatedSource },
    localAnalysis,
    localEntry,
    localSource,
  ] =
    await Promise.all([
      fetchArchivePlanetByName(planetName),
      fetchExoMastProperties(planetName).catch(() => ({
        property: null,
        source: buildMissSourceDescriptor("exo-mast-properties", "STScI exo.MAST", "https://exo.mast.stsci.edu/"),
      })),
      fetchExoMastSpectraFileList(planetName).catch(() => ({
        files: [] as string[],
        source: buildMissSourceDescriptor("exo-mast-spectra", "STScI exo.MAST Spectra", "https://exo.mast.stsci.edu/docs/"),
      })),
      getLegacyPlanetBundle(planetName),
      getLegacyPlanetEntry(planetName),
      getLegacyLocalSource(),
    ]);

  if (!row && !property && !localAnalysis && !localEntry) {
    return null;
  }

  const hostName = row?.hostname ?? asString(property?.star_name) ?? localAnalysis?.systemName ?? localEntry?.systemName ?? null;
  const [{ observations, source: observationsSource }, curatedSpectraResults] = await Promise.all([
    fetchMastJwstObservations(hostName).catch(() => ({
      observations: [] as JwstObservation[],
      source: buildMissSourceDescriptor("mast-jwst-observations", "MAST JWST Observations", MAST_DOCS),
    })),
    Promise.all(
      curatedFiles.slice(0, 8).map(async (filename) => {
        try {
          const { text, source } = await fetchExoMastCuratedSpectrumText(planetName, filename);
          return { filename, source, spectrum: parseCuratedTransmissionSpectrum(text) };
        } catch {
          return null;
        }
      }),
    ),
  ]);

  const { products, source: productsSource } = await fetchMastProducts(observations.map((observation) => observation.obsid)).catch(() => ({
    products: [] as JwstProduct[],
    source: buildMissSourceDescriptor("mast-jwst-products", "MAST JWST Products", MAST_DOCS),
  }));
  const numericProductCandidates = products.filter(isNumericSpectrumProduct).slice(0, 6);
  const mastNumericSeriesResults = await Promise.all(
    numericProductCandidates.map(async (product) => {
      try {
        const spectralDbResolved = await fetchMastSpectralDbSeries(product.productFilename);
        if (spectralDbResolved) {
          return { product, ...spectralDbResolved };
        }
        const directFitsResolved = await fetchMastDirectFitsSeries(product);
        return directFitsResolved ? { product, ...directFitsResolved } : null;
      } catch {
        return null;
      }
    }),
  );

  const curatedSpectra = curatedSpectraResults
    .filter((entry): entry is NonNullable<typeof entry> => !!entry && !!entry.spectrum)
    .map((entry) => ({ filename: entry.filename, source: entry.source, spectrum: entry.spectrum! }));
  const numericSeries = [
    ...curatedSpectra
      .map((entry) =>
        buildNumericSpectrumSeries({
          label: "Curated transmission spectrum",
          filename: entry.filename,
          source: "curated",
          valueKind: "transit_depth_ppm",
          wavelengthUm: entry.spectrum.wavelengthsUm,
          values: entry.spectrum.depthsPpm,
          uncertainties: entry.spectrum.uncertaintiesPpm,
        }),
      )
      .filter((entry): entry is NumericSpectrumSeries => !!entry),
    ...mastNumericSeriesResults
      .filter((entry): entry is NonNullable<typeof entry> => !!entry && !!entry.series)
      .map((entry) => entry.series as NumericSpectrumSeries),
  ];

  const stellarTemperatureK = row?.st_teff ?? asNumber(property?.Teff) ?? asNumber(localEntry?.star?.temperatureK);
  const stellarRadiusSolar = row?.st_rad ?? asNumber(property?.Rs) ?? asNumber(localEntry?.star?.radiusSolar);
  const stellarMassSolar = row?.st_mass ?? asNumber(property?.Ms) ?? asNumber(localEntry?.star?.massSolar);
  const stellarLuminosity =
    deriveLuminositySolar(row?.st_lum ?? null, stellarRadiusSolar, stellarTemperatureK)
    ?? asNumber(localEntry?.star?.luminositySolar);
  const radiusEarth = row?.pl_rade ?? asNumber(property?.Rp) ?? asNumber(localEntry?.physical?.radiusEarth);
  const massEarth =
    row?.pl_bmasse
    ?? (() => {
      const mpJupiter = asNumber(property?.Mp);
      return mpJupiter !== null ? mpJupiter * 317.8 : null;
    })()
    ?? asNumber(localEntry?.physical?.massEarth);
  const equilibriumK = row?.pl_eqt ?? asNumber(property?.Tp) ?? asNumber(localEntry?.temperatures?.equilibriumK);
  const semiMajorAxisAu = row?.pl_orbsmax ?? asNumber(property?.orbital_distance) ?? asNumber(localEntry?.orbital?.semiMajorAxisAu);
  const periodDays = row?.pl_orbper ?? asNumber(property?.orbital_period) ?? asNumber(localEntry?.orbital?.periodDays);
  const densityGcc = row?.pl_dens ?? deriveDensityGcc(massEarth, radiusEarth) ?? asNumber(localEntry?.physical?.densityGcc);
  const tidallyLocked = localEntry?.orbital?.tidallyLocked ?? inferTidalLock(semiMajorAxisAu, periodDays);
  const derivedRadiation = deriveRadiationFlux(stellarLuminosity, semiMajorAxisAu, row?.pl_insol ?? null);
  const radiation = {
    fluxEarthMultiple: derivedRadiation.fluxEarthMultiple ?? asNumber(localEntry?.radiation?.fluxEarthMultiple),
    fluxWm2: derivedRadiation.fluxWm2 ?? asNumber(localEntry?.radiation?.fluxWm2),
  };
  const derivedMagnetosphere = deriveMagnetosphere({
    massEarth,
    radiusEarth,
    densityGcc,
    equilibriumK,
    orbitalPeriodDays: periodDays,
    semiMajorAxisAu,
    fluxEarthMultiple: radiation.fluxEarthMultiple,
    spectralType: row?.st_spectype ?? localEntry?.star?.spectralType ?? null,
    tidallyLocked,
  });
  const magnetosphere: PlanetMagnetosphere = {
    ...derivedMagnetosphere,
    surfaceFieldMicroTesla: asNumber(localEntry?.magnetosphere?.surfaceFieldMicroTesla) ?? derivedMagnetosphere.surfaceFieldMicroTesla,
    magnetopauseRadii: asNumber(localEntry?.magnetosphere?.magnetopauseRadii) ?? derivedMagnetosphere.magnetopauseRadii,
    protected: localEntry?.magnetosphere?.protected ?? derivedMagnetosphere.protected,
    protection: classifyLegacyProtection({
      protectedFlag: localEntry?.magnetosphere?.protected ?? derivedMagnetosphere.protected,
      surfaceFieldMicroTesla: asNumber(localEntry?.magnetosphere?.surfaceFieldMicroTesla) ?? derivedMagnetosphere.surfaceFieldMicroTesla,
      magnetopauseRadii: asNumber(localEntry?.magnetosphere?.magnetopauseRadii) ?? derivedMagnetosphere.magnetopauseRadii,
    }),
  };
  const photometry: PlanetPhotometry = {
    vMag: row?.sy_vmag ?? asNumber(property?.Vmag),
    jMag: row?.sy_jmag ?? asNumber(property?.Jmag),
    hMag: row?.sy_hmag ?? asNumber(property?.Hmag),
    kMag: row?.sy_kmag ?? asNumber(property?.Kmag),
    gaiaMag: row?.sy_gaiamag ?? null,
  };
  const references = property ? extractReferences(property) : [];
  const derivedAtmosphere = deriveAtmosphereEvidence({
    planetName,
    observations,
    curatedSpectra,
    radiusEarth,
    massEarth,
    densityGcc,
    stellarRadiusSolar,
    equilibriumK,
  });
  const localAtmosphereTags: AtmosphereEvidenceTag[] = uniqueStrings([
    ...(localEntry?.spectrum?.moleculeTags ?? []),
    ...(localEntry?.atmosphere?.molecules ?? []),
  ]).map((molecule) => ({
    molecule,
    status: "mentioned",
    confidence: "medium",
    basis: "Local EXOPLANET_ANALYSES bundle",
  }));
  const atmosphere: AtmosphereEvidence = {
    ...derivedAtmosphere,
    moleculeTags: mergeUniqueTags(derivedAtmosphere.moleculeTags, localAtmosphereTags),
    cloudInterpretation:
      derivedAtmosphere.cloudInterpretation !== "No direct cloud constraint yet; renderer falls back to class and irradiation priors."
        ? derivedAtmosphere.cloudInterpretation
        : localEntry?.atmosphere?.type
          ? `${localEntry.atmosphere.type} inferred from the local analysis bundle; direct JWST cloud constraint still pending.`
          : derivedAtmosphere.cloudInterpretation,
  };
  const moleculeTagNames = uniqueStrings([
    ...atmosphere.moleculeTags.map((tag) => tag.molecule),
    ...(localAnalysis?.moleculeTags ?? []),
  ]);
  const mergedReferences = [
    ...references,
    ...referencesFromDocs(localEntry?.docs),
  ].filter((entry, index, all) => all.findIndex((candidate) => candidate.url === entry.url) === index);
  const uncertainty = {
    radiusEarth: measurementBounds(asNumber(row?.pl_radeerr1 ?? property?.Rp_upper), asNumber(row?.pl_radeerr2 ?? property?.Rp_lower)),
    massEarth: measurementBounds(
      asNumber(row?.pl_bmasseerr1) ?? (asNumber(property?.Mp_upper) !== null ? asNumber(property?.Mp_upper)! * 317.8 : null),
      asNumber(row?.pl_bmasseerr2) ?? (asNumber(property?.Mp_lower) !== null ? asNumber(property?.Mp_lower)! * 317.8 : null),
    ),
    equilibriumK: measurementBounds(asNumber(row?.pl_eqterr1 ?? property?.Tp_upper), asNumber(row?.pl_eqterr2 ?? property?.Tp_lower)),
    periodDays: measurementBounds(asNumber(row?.pl_orbpererr1 ?? property?.orbital_period_upper), asNumber(row?.pl_orbpererr2 ?? property?.orbital_period_lower)),
    semiMajorAxisAu: measurementBounds(asNumber(row?.pl_orbsmaxerr1 ?? property?.orbital_distance_upper), asNumber(row?.pl_orbsmaxerr2 ?? property?.orbital_distance_lower)),
    stellarTemperatureK: measurementBounds(asNumber(row?.st_tefferr1 ?? property?.Teff_upper), asNumber(row?.st_tefferr2 ?? property?.Teff_lower)),
    stellarRadiusSolar: measurementBounds(asNumber(row?.st_raderr1 ?? property?.Rs_upper), asNumber(row?.st_raderr2 ?? property?.Rs_lower)),
    stellarMassSolar: measurementBounds(asNumber(row?.st_masserr1 ?? property?.Ms_upper), asNumber(row?.st_masserr2 ?? property?.Ms_lower)),
  } satisfies PlanetScienceBundle["uncertainty"];
  const propagation = propagatePlanetScience({
    planetName,
    radiusEarth,
    massEarth,
    equilibriumK,
    semiMajorAxisAu,
    stellarTemperatureK,
    stellarRadiusSolar,
    stellarMassSolar,
    uncertainty,
  });
  const retention = deriveRetentionAudit({
    massEarth,
    radiusEarth,
    densityGcc,
    equilibriumK,
    semiMajorAxisAu,
    fluxEarthMultiple: radiation.fluxEarthMultiple,
    stellarRadiusSolar,
  });
  const interior = inferInteriorStructure({ massEarth, radiusEarth, densityGcc });

  return {
    fetchedAt: new Date().toISOString(),
    planetName: row?.pl_name ?? asString(property?.canonical_name) ?? localEntry?.name ?? planetName,
    hostName,
    stellar: {
      effectiveTemperatureK: stellarTemperatureK,
      radiusSolar: stellarRadiusSolar,
      massSolar: stellarMassSolar,
      spectralType: row?.st_spectype ?? localEntry?.star?.spectralType ?? null,
      luminositySolar: stellarLuminosity,
      ageGyr: row?.st_age ?? asNumber(localEntry?.star?.ageGyr),
      metallicityDex: row?.st_met ?? asNumber(property?.["Fe/H"]) ?? asNumber(localEntry?.star?.metallicityDex),
      surfaceGravityLogCgs: row?.st_logg ?? asNumber(property?.stellar_gravity),
      photometry,
    },
    physical: {
      radiusEarth,
      massEarth,
      densityGcc,
      surfaceGravityMs2: deriveSurfaceGravityMs2(massEarth, radiusEarth),
    },
    orbital: {
      periodDays,
      semiMajorAxisAu,
      eccentricity: row?.pl_orbeccen ?? asNumber(property?.eccentricity),
      inclinationDeg: row?.pl_orbincl ?? asNumber(property?.inclination),
      transitDepthPpm: row?.pl_trandep ?? asNumber(property?.transit_depth),
      transitDurationHours: row?.pl_trandur ?? asNumber(property?.transit_duration),
      tidallyLocked,
    },
    temperatures: {
      equilibriumK,
      daysideK: asNumber(property?.dayside_temperature) ?? asNumber(localEntry?.temperatures?.daysideK),
      nightsideK:
        (tidallyLocked && equilibriumK !== null ? Math.max(40, equilibriumK * 0.58) : null)
        ?? asNumber(localEntry?.temperatures?.nightsideK),
    },
    radiation,
    magnetosphere,
    spectrum: {
      hasSpectra: curatedFiles.length > 0 || products.length > 0,
      fileCount: curatedFiles.length + products.length,
      files: curatedFiles.slice(0, 24),
      moleculeTags: moleculeTagNames,
      jwstObservations: observations,
      jwstProducts: products.slice(0, 80),
      curatedTransmissionFiles: curatedFiles,
      numericSeries,
    },
    atmosphere,
    propagation,
    retention,
    interior,
    references: mergedReferences,
    sources: [
      archiveSource,
      mastSource,
      curatedSource,
      observationsSource,
      productsSource,
      ...curatedSpectra.map((entry) => entry.source),
      ...mastNumericSeriesResults
        .filter((entry): entry is NonNullable<typeof entry> => !!entry)
        .map((entry) => entry.source),
      ...(localAnalysis ? [localSource] : []),
    ],
    localAnalysis,
    uncertainty,
  } satisfies PlanetScienceBundle;
}
