import type {
  CatalogPropagation,
  MeasurementBounds,
  PlanetMagnetosphere,
  RetentionAudit,
} from "@/lib/science/types";

const EARTH_FLUX_WM2 = 1361;
const G = 6.674e-11;
const KB = 1.381e-23;
const EV = 1.602e-19;
const M_EARTH = 5.972e24;
const R_EARTH = 6.371e6;
const R_SUN = 6.957e8;
const AMU = 1.6605390666e-27;

type NumericMeasurementInput = {
  value: number | null;
  plus: number | null;
  minus: number | null;
  fallbackFraction: number;
  fallbackAbsolute: number;
  random: () => number;
};

type PropagateInput = {
  planetName: string;
  radiusEarth: number | null;
  massEarth: number | null;
  equilibriumK: number | null;
  semiMajorAxisAu: number | null;
  stellarTemperatureK: number | null;
  stellarRadiusSolar: number | null;
  stellarMassSolar: number | null;
  uncertainty: {
    radiusEarth: MeasurementBounds;
    massEarth: MeasurementBounds;
    equilibriumK: MeasurementBounds;
    semiMajorAxisAu: MeasurementBounds;
    stellarTemperatureK: MeasurementBounds;
    stellarRadiusSolar: MeasurementBounds;
    stellarMassSolar: MeasurementBounds;
  };
  sampleCount?: number;
};

export function estimateMeanMolecularWeightKg(massEarth: number | null, densityGcc: number | null, equilibriumK: number | null) {
  if ((massEarth ?? 0) > 60) return 2.3 * AMU;
  if ((densityGcc ?? 0) < 2.2) return 2.8 * AMU;
  if ((equilibriumK ?? 0) > 900) return 20 * AMU;
  if ((densityGcc ?? 5.5) > 5.3) return 28 * AMU;
  return 18 * AMU;
}

export function spectralClassBucket(spectralType: string | null) {
  const letter = String(spectralType || "").trim().charAt(0).toUpperCase();
  return /[OBAFGKM]/.test(letter) ? letter : "G";
}

export function inferTidalLock(semiMajorAxisAu: number | null, orbitalPeriodDays: number | null) {
  return !!semiMajorAxisAu && !!orbitalPeriodDays && semiMajorAxisAu < 0.08 && orbitalPeriodDays < 12;
}

export function deriveMagnetosphereProxy(input: {
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

  const rotationProxyDays = input.tidallyLocked ? orbitalPeriodDays : Math.max(0.3, orbitalPeriodDays * 0.2);
  const fRot = rotationProxyDays < 3 ? 0.3 : rotationProxyDays < 10 ? 0.5 : rotationProxyDays < 30 ? 0.7 : 1.0;
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
  const surfaceFieldMicroTesla = 50 * magneticFactor * dynamoScale * (input.tidallyLocked ? 0.72 : 1) / irradiationPenalty;
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

export function deriveSurfaceGravityMs2(massEarth: number | null, radiusEarth: number | null) {
  if (!massEarth || !radiusEarth) return null;
  return 9.80665 * (massEarth / (radiusEarth * radiusEarth));
}

export function deriveDensityGcc(massEarth: number | null, radiusEarth: number | null) {
  if (!massEarth || !radiusEarth) return null;
  return 5.51 * (massEarth / Math.pow(radiusEarth, 3));
}

export function deriveLuminositySolar(logLuminosity: number | null, radiusSolar: number | null, teffK: number | null) {
  if (logLuminosity !== null && logLuminosity !== undefined) return 10 ** logLuminosity;
  if (!radiusSolar || !teffK) return null;
  return radiusSolar * radiusSolar * Math.pow(teffK / 5772, 4);
}

export function deriveRadiationFlux(luminositySolar: number | null, semiMajorAxisAu: number | null, archiveFluxEarth: number | null) {
  const fluxEarthMultiple =
    archiveFluxEarth
    ?? (luminositySolar && semiMajorAxisAu ? luminositySolar / Math.pow(semiMajorAxisAu, 2) : null);
  return {
    fluxEarthMultiple,
    fluxWm2: fluxEarthMultiple !== null ? fluxEarthMultiple * EARTH_FLUX_WM2 : null,
  };
}

export function oneScaleHeightSignalPpm(input: {
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

export function deriveEscapeVelocityKmS(massEarth: number | null, radiusEarth: number | null) {
  if (!massEarth || !radiusEarth) return null;
  const massKg = massEarth * M_EARTH;
  const radiusM = radiusEarth * R_EARTH;
  return Math.sqrt((2 * G * massKg) / radiusM) / 1000;
}

function averageMagnitudeBounds(bounds: { plus: number | null; minus: number | null }) {
  const candidates = [bounds.plus, bounds.minus]
    .map((value) => (value === null || value === undefined ? null : Math.abs(value)))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (!candidates.length) return null;
  return candidates.reduce((sum, value) => sum + value, 0) / candidates.length;
}

function createSeededRandom(seedText: string) {
  let seed = 1779033703 ^ seedText.length;
  for (let index = 0; index < seedText.length; index += 1) {
    seed = Math.imul(seed ^ seedText.charCodeAt(index), 3432918353);
    seed = (seed << 13) | (seed >>> 19);
  }
  return () => {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    const value = (seed ^= seed >>> 16) >>> 0;
    return value / 4294967296;
  };
}

function sampleStandardNormal(random: () => number) {
  const u = Math.max(random(), 1e-12);
  const v = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleMeasurement(input: NumericMeasurementInput) {
  if (input.value === null || input.value === undefined || !Number.isFinite(input.value)) {
    return { value: null, usedFallback: false };
  }
  const archiveSigma = averageMagnitudeBounds({ plus: input.plus, minus: input.minus });
  const fallbackSigma = Math.max(Math.abs(input.value) * input.fallbackFraction, input.fallbackAbsolute);
  const sigma = archiveSigma ?? fallbackSigma;
  return {
    value: input.value + sampleStandardNormal(input.random) * sigma,
    usedFallback: archiveSigma === null,
  };
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const mix = index - lower;
  return sorted[lower] * (1 - mix) + sorted[upper] * mix;
}

function summarizeInterval(samples: Array<number | null>) {
  const usable = samples.filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    low: percentile(usable, 0.16),
    median: percentile(usable, 0.5),
    high: percentile(usable, 0.84),
  };
}

export function propagateCatalogPlanet(input: PropagateInput): CatalogPropagation {
  const random = createSeededRandom(input.planetName);
  const sampleCount = input.sampleCount ?? 1200;
  const radiusSamples: Array<number | null> = [];
  const massSamples: Array<number | null> = [];
  const equilibriumSamples: Array<number | null> = [];
  const semiMajorAxisSamples: Array<number | null> = [];
  const densitySamples: Array<number | null> = [];
  const gravitySamples: Array<number | null> = [];
  const luminositySamples: Array<number | null> = [];
  const fluxSamples: Array<number | null> = [];
  const scaleHeightSamples: Array<number | null> = [];
  const scaleSignalSamples: Array<number | null> = [];
  let fallbackCount = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const radius = sampleMeasurement({
      value: input.radiusEarth,
      plus: input.uncertainty.radiusEarth.plus,
      minus: input.uncertainty.radiusEarth.minus,
      fallbackFraction: 0.04,
      fallbackAbsolute: 0.03,
      random,
    });
    const mass = sampleMeasurement({
      value: input.massEarth,
      plus: input.uncertainty.massEarth.plus,
      minus: input.uncertainty.massEarth.minus,
      fallbackFraction: 0.08,
      fallbackAbsolute: 0.08,
      random,
    });
    const equilibrium = sampleMeasurement({
      value: input.equilibriumK,
      plus: input.uncertainty.equilibriumK.plus,
      minus: input.uncertainty.equilibriumK.minus,
      fallbackFraction: 0.05,
      fallbackAbsolute: 8,
      random,
    });
    const semiMajorAxis = sampleMeasurement({
      value: input.semiMajorAxisAu,
      plus: input.uncertainty.semiMajorAxisAu.plus,
      minus: input.uncertainty.semiMajorAxisAu.minus,
      fallbackFraction: 0.02,
      fallbackAbsolute: 0.002,
      random,
    });
    const stellarTemperature = sampleMeasurement({
      value: input.stellarTemperatureK,
      plus: input.uncertainty.stellarTemperatureK.plus,
      minus: input.uncertainty.stellarTemperatureK.minus,
      fallbackFraction: 0.02,
      fallbackAbsolute: 40,
      random,
    });
    const stellarRadius = sampleMeasurement({
      value: input.stellarRadiusSolar,
      plus: input.uncertainty.stellarRadiusSolar.plus,
      minus: input.uncertainty.stellarRadiusSolar.minus,
      fallbackFraction: 0.03,
      fallbackAbsolute: 0.01,
      random,
    });
    const stellarMass = sampleMeasurement({
      value: input.stellarMassSolar,
      plus: input.uncertainty.stellarMassSolar.plus,
      minus: input.uncertainty.stellarMassSolar.minus,
      fallbackFraction: 0.04,
      fallbackAbsolute: 0.02,
      random,
    });

    fallbackCount += [
      radius.usedFallback,
      mass.usedFallback,
      equilibrium.usedFallback,
      semiMajorAxis.usedFallback,
      stellarTemperature.usedFallback,
      stellarRadius.usedFallback,
      stellarMass.usedFallback,
    ].filter(Boolean).length;

    const density = deriveDensityGcc(mass.value, radius.value);
    const gravity = deriveSurfaceGravityMs2(mass.value, radius.value);
    const luminosity = deriveLuminositySolar(null, stellarRadius.value, stellarTemperature.value);
    const radiation = deriveRadiationFlux(luminosity, semiMajorAxis.value, null);
    const meanMolecularWeight = estimateMeanMolecularWeightKg(mass.value, density, equilibrium.value);
    const scaleHeightKm =
      gravity && equilibrium.value
        ? (KB * equilibrium.value / (meanMolecularWeight * gravity)) / 1000
        : null;
    const signal = oneScaleHeightSignalPpm({
      massEarth: mass.value,
      radiusEarth: radius.value,
      stellarRadiusSolar: stellarRadius.value,
      equilibriumK: equilibrium.value,
      densityGcc: density,
    });

    void stellarMass;
    radiusSamples.push(radius.value);
    massSamples.push(mass.value);
    equilibriumSamples.push(equilibrium.value);
    semiMajorAxisSamples.push(semiMajorAxis.value);
    densitySamples.push(density);
    gravitySamples.push(gravity);
    luminositySamples.push(luminosity);
    fluxSamples.push(radiation.fluxEarthMultiple);
    scaleHeightSamples.push(scaleHeightKm);
    scaleSignalSamples.push(signal);
  }

  const intervalCount = sampleCount * 7;
  const inputMode =
    fallbackCount === 0
      ? "archive-only"
      : fallbackCount === intervalCount
        ? "fallback-only"
        : "archive+fallback";

  return {
    sampleCount,
    inputMode,
    radiusEarth: summarizeInterval(radiusSamples),
    massEarth: summarizeInterval(massSamples),
    equilibriumK: summarizeInterval(equilibriumSamples),
    semiMajorAxisAu: summarizeInterval(semiMajorAxisSamples),
    densityGcc: summarizeInterval(densitySamples),
    surfaceGravityMs2: summarizeInterval(gravitySamples),
    luminositySolar: summarizeInterval(luminositySamples),
    fluxEarthMultiple: summarizeInterval(fluxSamples),
    scaleHeightKm: summarizeInterval(scaleHeightSamples),
    oneScaleHeightSignalPpm: summarizeInterval(scaleSignalSamples),
  };
}

export function deriveRetentionAudit(input: {
  massEarth: number | null;
  radiusEarth: number | null;
  densityGcc: number | null;
  equilibriumK: number | null;
  semiMajorAxisAu: number | null;
  fluxEarthMultiple: number | null;
  stellarRadiusSolar: number | null;
}) : RetentionAudit {
  const escapeVelocityKmS = deriveEscapeVelocityKmS(input.massEarth, input.radiusEarth);
  const gravity = deriveSurfaceGravityMs2(input.massEarth, input.radiusEarth);
  const scaleHeightKm =
    gravity && input.equilibriumK
      ? (KB * input.equilibriumK / (estimateMeanMolecularWeightKg(input.massEarth, input.densityGcc, input.equilibriumK) * gravity)) / 1000
      : null;

  let jeansLambdaH2: number | null = null;
  let jeansLambdaN2: number | null = null;
  if (input.massEarth && input.radiusEarth && input.equilibriumK) {
    const massKg = input.massEarth * M_EARTH;
    const radiusM = input.radiusEarth * R_EARTH;
    jeansLambdaH2 = (G * massKg * (2.3 * AMU)) / (KB * input.equilibriumK * radiusM);
    jeansLambdaN2 = (G * massKg * (28 * AMU)) / (KB * input.equilibriumK * radiusM);
  }

  const irradiationStress = input.fluxEarthMultiple;
  const energyLimitedLossProxy =
    input.fluxEarthMultiple !== null && input.massEarth && input.radiusEarth
      ? input.fluxEarthMultiple * Math.pow(input.radiusEarth, 3) / Math.max(input.massEarth, 0.1)
      : null;

  let regime: RetentionAudit["regime"] = "unresolved";
  let dominantLossProcess: RetentionAudit["dominantLossProcess"] = "unresolved";
  let confidence: RetentionAudit["confidence"] = "low";
  let verdict: RetentionAudit["verdict"] = "unresolved";
  if (jeansLambdaH2 !== null && jeansLambdaN2 !== null) {
    const strongHydrodynamicRisk =
      jeansLambdaH2 < 10
      || (irradiationStress ?? 0) > 120
      || (energyLimitedLossProxy ?? 0) > 80;
    const transitionRisk =
      jeansLambdaH2 < 20
      || (irradiationStress ?? 0) > 20
      || (energyLimitedLossProxy ?? 0) > 20;
    const secondaryAtmosphereWindow =
      jeansLambdaN2 >= 80
      && (escapeVelocityKmS ?? 0) >= 8
      && (irradiationStress ?? 0) < 40;

    if (strongHydrodynamicRisk) {
      regime = "hydrodynamic-loss-risk";
      dominantLossProcess =
        (irradiationStress ?? 0) > 120 || (energyLimitedLossProxy ?? 0) > 80
          ? "irradiation-driven-loss"
          : "hydrodynamic-escape-risk";
      verdict = "vulnerable";
      confidence =
        [
          jeansLambdaH2 < 10,
          (irradiationStress ?? 0) > 120,
          (energyLimitedLossProxy ?? 0) > 80,
        ].filter(Boolean).length >= 2
          ? "high"
          : "medium";
    } else if (secondaryAtmosphereWindow && jeansLambdaH2 < 20) {
      regime = "secondary-atmosphere-retentive";
      dominantLossProcess = "secondary-atmosphere-window";
      verdict = "mixed";
      confidence = "medium";
    } else if (transitionRisk) {
      regime = "thermal-escape-transition";
      dominantLossProcess =
        (irradiationStress ?? 0) > 20 || (energyLimitedLossProxy ?? 0) > 20
          ? "irradiation-driven-loss"
          : "hydrodynamic-escape-risk";
      verdict = "mixed";
      confidence = "medium";
    } else if (jeansLambdaH2 >= 20 && jeansLambdaN2 >= 100) {
      regime = jeansLambdaH2 >= 30 && (irradiationStress ?? 1) < 8
        ? "volatile-rich-retentive"
        : "secondary-atmosphere-retentive";
      dominantLossProcess = regime === "volatile-rich-retentive"
        ? "jeans-screened"
        : "secondary-atmosphere-window";
      verdict = "retentive";
      confidence = regime === "volatile-rich-retentive" ? "high" : "medium";
    } else {
      regime = "thermal-escape-transition";
      dominantLossProcess = "hydrodynamic-escape-risk";
      verdict = "mixed";
      confidence = "low";
    }
  }

  const notes = [
    "This is an escape-regime screen, not a direct measurement of whether an atmosphere exists today.",
    "Hydrogen-rich envelope retention and heavier secondary-atmosphere retention are separated here; a world can lose H/He yet still retain or rebuild heavier gases.",
    "Magnetic shielding is not treated as a binary protection switch; stellar-wind coupling and open-field outflow can still permit escape under strong driving.",
  ];
  if (regime === "hydrodynamic-loss-risk") {
    notes.push("Current loading places the planet in a hydrodynamic or irradiation-driven loss-risk regime for light volatiles.");
  } else if (regime === "thermal-escape-transition") {
    notes.push("Current loading places the planet in a transition regime where light-species loss is plausible and conclusions depend strongly on chemistry, age, and stellar history.");
  } else if (regime === "secondary-atmosphere-retentive") {
    notes.push("Current loading favors retention of heavier secondary-atmosphere species even if a primordial H/He envelope would be less secure.");
  } else if (regime === "volatile-rich-retentive") {
    notes.push("Current loading is consistent with a comparatively retentive regime for both light and heavy species, subject to stellar history not modeled here.");
  }
  if (scaleHeightKm !== null) {
    notes.push(`Representative scale height is ${scaleHeightKm.toFixed(0)} km at the loaded equilibrium temperature.`);
  }
  if (energyLimitedLossProxy !== null) {
    notes.push(`Energy-limited loss proxy is ${energyLimitedLossProxy.toFixed(2)} in relative Earth-normalized units.`);
  }

  return {
    framework: "escape-regime-audit",
    escapeVelocityKmS,
    jeansLambdaH2,
    jeansLambdaN2,
    irradiationStress,
    energyLimitedLossProxy,
    regime,
    dominantLossProcess,
    confidence,
    verdict,
    notes,
  };
}
