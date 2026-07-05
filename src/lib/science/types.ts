export type SourceDescriptor = {
  id: string;
  name: string;
  kind: "catalog" | "archive" | "imaging" | "derived";
  url: string;
  accessedAt: string;
  cache: "hit" | "miss";
};

export type Vector3Pc = {
  x: number;
  y: number;
  z: number;
};

export type ArchivePlanetRow = {
  pl_name: string;
  hostname: string;
  ra: number;
  dec: number;
  sy_dist: number;
  pl_rade: number | null;
  pl_radeerr1: number | null;
  pl_radeerr2: number | null;
  pl_bmasse: number | null;
  pl_bmasseerr1: number | null;
  pl_bmasseerr2: number | null;
  pl_eqt: number | null;
  pl_eqterr1: number | null;
  pl_eqterr2: number | null;
  pl_orbper: number | null;
  pl_orbpererr1: number | null;
  pl_orbpererr2: number | null;
  pl_orbsmax: number | null;
  pl_orbsmaxerr1: number | null;
  pl_orbsmaxerr2: number | null;
  pl_dens: number | null;
  pl_insol: number | null;
  pl_orbeccen: number | null;
  pl_orbincl: number | null;
  pl_orblper: number | null;
  pl_orbtper: number | null;
  pl_tranmid: number | null;
  pl_trandep: number | null;
  pl_trandur: number | null;
  st_teff: number | null;
  st_tefferr1: number | null;
  st_tefferr2: number | null;
  st_rad: number | null;
  st_raderr1: number | null;
  st_raderr2: number | null;
  st_mass: number | null;
  st_masserr1: number | null;
  st_masserr2: number | null;
  st_spectype: string | null;
  st_lum: number | null;
  st_age: number | null;
  st_met: number | null;
  st_logg: number | null;
  sy_vmag: number | null;
  sy_jmag: number | null;
  sy_hmag: number | null;
  sy_kmag: number | null;
  sy_gaiamag: number | null;
  disc_facility: string | null;
  disc_year: number | null;
};

export type MeasurementBounds = {
  plus: number | null;
  minus: number | null;
};

export type PlanetPhotometry = {
  vMag: number | null;
  jMag: number | null;
  hMag: number | null;
  kMag: number | null;
  gaiaMag: number | null;
};

export type PlanetMagnetosphere = {
  magneticFactor: number | null;
  stellarWindStress: number | null;
  correctedBindingRatio: number | null;
  surfaceFieldMicroTesla: number | null;
  magnetopauseRadii: number | null;
  protection: "strong" | "moderate" | "weak" | "stressed" | "unresolved";
  protected: boolean | null;
};

export type AtmosphereEvidenceTag = {
  molecule: string;
  status: "detected" | "feature" | "mentioned" | "coverage";
  confidence: "high" | "medium" | "low";
  basis: string;
};

export type AtmosphereEvidence = {
  moleculeTags: AtmosphereEvidenceTag[];
  cloudInterpretation: string;
  cloudCoverFraction: number | null;
  spectralAmplitudePpm: number | null;
  spectralSlopePpmPerUm: number | null;
  wavelengthCoverage: {
    minUm: number | null;
    maxUm: number | null;
  };
};

export type NumericSpectrumSeries = {
  label: string;
  filename: string;
  source: "curated" | "mast-product";
  valueKind: "transit_depth_ppm" | "flux_jy";
  wavelengthUm: number[];
  values: number[];
  uncertainties: number[];
  minUm: number | null;
  maxUm: number | null;
  pointCount: number;
  amplitude: number | null;
  slopePerUm: number | null;
  medianSnr: number | null;
};

export type PropagatedInterval = {
  low: number | null;
  median: number | null;
  high: number | null;
};

export type PropagationMode = "archive-only" | "archive+fallback" | "fallback-only";

export type CatalogPropagation = {
  sampleCount: number;
  inputMode: PropagationMode;
  radiusEarth: PropagatedInterval;
  massEarth: PropagatedInterval;
  equilibriumK: PropagatedInterval;
  semiMajorAxisAu: PropagatedInterval;
  densityGcc: PropagatedInterval;
  surfaceGravityMs2: PropagatedInterval;
  luminositySolar: PropagatedInterval;
  fluxEarthMultiple: PropagatedInterval;
  scaleHeightKm: PropagatedInterval;
  oneScaleHeightSignalPpm: PropagatedInterval;
};

export type TransmissionInference = {
  framework: "scale-height-transmission";
  featureAmplitudePpm: number;
  scaleHeightsAssumed: number;
  impliedScaleHeightKm: number;
  impliedMeanMolecularWeightAmu: number;
  atmosphereClass:
    | "hydrogen-helium-primary"
    | "intermediate"
    | "high-mean-weight-secondary"
    | "very-heavy-or-cloud-muted";
  notes: string[];
};

export type PlanetInteriorStructure = {
  framework: "mass-radius-composition";
  bulkDensityGcc: number | null;
  composition:
    | "iron-dominated"
    | "rocky-terrestrial"
    | "rock-volatile-mix"
    | "water-ice-rich"
    | "gas-envelope"
    | "giant"
    | "unresolved";
  requiresVolatiles: boolean;
  referenceRadiiRe: {
    iron: number;
    rock: number;
    water50: number;
    water100: number;
  } | null;
  probabilities?: Array<{ composition: string; probability: number }> | null;
  notes: string[];
};

export type ThermalEmission = {
  framework: "thermal-emission";
  daysideTemperatureK: number;
  substellarMaxK: number;
  thermalPeakUm: number;
  referenceWavelengthUm: number;
  secondaryEclipseDepthPpm: number | null;
  notes: string[];
};

export type MassForecast = {
  framework: "empirical-mass-radius";
  massEarth: number;
  lowEarth: number;
  highEarth: number;
  scatterDex: number;
  relation: string;
  notes: string[];
};

export type EarthSimilarityIndex = {
  index: number;
  interiorIndex: number;
  surfaceIndex: number;
  reference: string;
  notes: string[];
};

export type HabitableZoneAssessment = {
  zone: "conservative" | "optimistic" | "too-hot" | "too-cold" | "unresolved";
  insolationEarth: number | null;
  conservativeInnerAu: number | null;
  conservativeOuterAu: number | null;
  optimisticInnerAu: number | null;
  optimisticOuterAu: number | null;
  notes: string[];
};

export type RetentionAudit = {
  framework: "escape-regime-audit";
  escapeVelocityKmS: number | null;
  jeansLambdaH2: number | null;
  jeansLambdaN2: number | null;
  exobaseRadiusRe: number | null;
  irradiationStress: number | null;
  energyLimitedLossProxy: number | null;
  regime:
    | "volatile-rich-retentive"
    | "secondary-atmosphere-retentive"
    | "thermal-escape-transition"
    | "hydrodynamic-loss-risk"
    | "unresolved";
  dominantLossProcess:
    | "jeans-screened"
    | "secondary-atmosphere-window"
    | "irradiation-driven-loss"
    | "hydrodynamic-escape-risk"
    | "unresolved";
  confidence: "low" | "medium" | "high";
  verdict: "retentive" | "mixed" | "vulnerable" | "unresolved";
  notes: string[];
};

export type JwstObservation = {
  obsid: string;
  targetName: string;
  proposalId: string | null;
  proposalPi: string | null;
  instrumentName: string | null;
  filters: string | null;
  dataproductType: string | null;
  wavelengthRegion: string | null;
  obsTitle: string | null;
  approximateWavelengthMinUm: number | null;
  approximateWavelengthMaxUm: number | null;
};

export type JwstProduct = {
  obsid: string;
  productFilename: string;
  productType: string | null;
  productGroupDescription: string | null;
  productSubGroupDescription: string | null;
  calibLevel: number | null;
  size: number | null;
  dataUri: string | null;
};

export type LocalAnalysisReport = {
  label: string;
  filename: string;
  path: string;
};

export type LocalAnalysisSummary = {
  sourceLabel: string;
  registryVersion: string | null;
  systemName: string | null;
  studied: boolean;
  studiedPlanetCount: number | null;
  interesting: boolean;
  interestingReason: string | null;
  habitability: string | null;
  activityLevel: string | null;
  compositionType: string | null;
  atmosphereType: string | null;
  moleculeTags: string[];
  jwstInstrumentLabels: string[];
  spectralCoverage: {
    minUm: number | null;
    maxUm: number | null;
  };
  fluxEarthMultiple: number | null;
  surfaceFieldMicroTesla: number | null;
  magnetopauseRadii: number | null;
};

export type LocalAnalysisBundle = LocalAnalysisSummary & {
  reports: LocalAnalysisReport[];
  narrative: string | null;
  caveats: string[];
};

export type PlanetScienceBundle = {
  fetchedAt: string;
  planetName: string;
  hostName: string | null;
  stellar: {
    effectiveTemperatureK: number | null;
    radiusSolar: number | null;
    massSolar: number | null;
    spectralType: string | null;
    luminositySolar: number | null;
    ageGyr: number | null;
    metallicityDex: number | null;
    surfaceGravityLogCgs: number | null;
    photometry: PlanetPhotometry;
  };
  physical: {
    radiusEarth: number | null;
    massEarth: number | null;
    densityGcc: number | null;
    surfaceGravityMs2: number | null;
  };
  orbital: {
    periodDays: number | null;
    semiMajorAxisAu: number | null;
    eccentricity: number | null;
    inclinationDeg: number | null;
    transitDepthPpm: number | null;
    transitDurationHours: number | null;
    tidallyLocked: boolean;
  };
  temperatures: {
    equilibriumK: number | null;
    daysideK: number | null;
    nightsideK: number | null;
  };
  radiation: {
    fluxEarthMultiple: number | null;
    fluxWm2: number | null;
  };
  magnetosphere: PlanetMagnetosphere;
  spectrum: {
    hasSpectra: boolean;
    fileCount: number;
    files: string[];
    moleculeTags: string[];
    jwstObservations: JwstObservation[];
    jwstProducts: JwstProduct[];
    curatedTransmissionFiles: string[];
    numericSeries: NumericSpectrumSeries[];
  };
  atmosphere: AtmosphereEvidence;
  propagation: CatalogPropagation;
  interior: PlanetInteriorStructure;
  transmission: TransmissionInference | null;
  earthSimilarity: EarthSimilarityIndex | null;
  habitableZone: HabitableZoneAssessment | null;
  massForecast: MassForecast | null;
  emission: ThermalEmission | null;
  retention: RetentionAudit;
  references: Array<{
    label: string;
    url: string;
  }>;
  sources: SourceDescriptor[];
  localAnalysis?: LocalAnalysisBundle | null;
  researchNarrative?: string | null;
  spectrumPoints?: Array<[number, number]> | null;
  uncertainty: {
    radiusEarth: MeasurementBounds;
    massEarth: MeasurementBounds;
    equilibriumK: MeasurementBounds;
    periodDays: MeasurementBounds;
    semiMajorAxisAu: MeasurementBounds;
    stellarTemperatureK: MeasurementBounds;
    stellarRadiusSolar: MeasurementBounds;
    stellarMassSolar: MeasurementBounds;
  };
};

export type UniversePlanet = {
  id: string;
  name: string;
  radiusEarth: number | null;
  massEarth: number | null;
  equilibriumK: number | null;
  orbitalPeriodDays: number | null;
  semiMajorAxisAu: number | null;
  densityGcc: number | null;
  insolationEarth: number | null;
  eccentricity: number | null;
  inclinationDeg: number | null;
  inclinationReference?: "sky" | "ecliptic";
  argumentPeriastronDeg?: number | null;
  longitudeAscendingNodeDeg?: number | null;
  meanAnomalyDegAtEpoch?: number | null;
  orbitEpochJd?: number | null;
  orbitBasis?: "measured" | "jpl-approx" | "mixed" | "inferred";
  transitDepthPpm: number | null;
  transitDurationHours: number | null;
  uncertainty: {
    radiusEarth: MeasurementBounds;
    massEarth: MeasurementBounds;
    equilibriumK: MeasurementBounds;
    periodDays: MeasurementBounds;
    semiMajorAxisAu: MeasurementBounds;
  };
  propagation?: CatalogPropagation | null;
  discoveryFacility: string | null;
  discoveryYear: number | null;
  localAnalysis?: LocalAnalysisSummary | null;
  provenance: SourceDescriptor[];
};

export type UniverseSystem = {
  id: string;
  name: string;
  raDeg: number;
  decDeg: number;
  distancePc: number;
  cartesianPc: Vector3Pc;
  stellar: {
    effectiveTemperatureK: number | null;
    radiusSolar: number | null;
    massSolar: number | null;
    spectralType: string | null;
    luminosityLogSolar: number | null;
    ageGyr: number | null;
    metallicityDex: number | null;
    surfaceGravityLogCgs: number | null;
    uncertainty: {
      effectiveTemperatureK: MeasurementBounds;
      radiusSolar: MeasurementBounds;
      massSolar: MeasurementBounds;
    };
    photometry: PlanetPhotometry;
  };
  planetCount: number;
  planets: UniversePlanet[];
  localAnalysis?: LocalAnalysisSummary | null;
  researched?: boolean;
  researchSummary?: string | null;
  provenance: SourceDescriptor[];
};

export type WhiteDwarfRecord = {
  id: string;
  sample: "synthetic" | "tremblay2019";
  massSolar: number | null;
  massErrorSolar: number | null;
  radiusSolar: number | null;
  radiusErrorSolar: number | null;
  structureDepth: number | null;
  gravitationalRedshiftKmS: number | null;
  observedVelocityKmS: number | null;
  deltaVelocityKmS: number | null;
  sigmaVelocityKmS: number | null;
  velocityRepairApplied: boolean;
  provenance: SourceDescriptor[];
};

export type WhiteDwarfAnchor = {
  id: string;
  name: string;
  raDeg: number;
  decDeg: number;
  distancePc: number;
  cartesianPc: Vector3Pc;
  spectralType: string | null;
  effectiveTemperatureK: number | null;
  massSolar: number | null;
  radiusSolar: number | null;
  theoreticalRadiusSolar: number | null;
  gravitationalRedshiftKmS: number | null;
  tags: string[];
  provenance: SourceDescriptor[];
};

export type WhiteDwarfSummary = {
  sampleCount: number;
  repairedVelocityCount: number;
  medianMassSolar: number | null;
  medianRadiusSolar: number | null;
  medianRedshiftKmS: number | null;
};

export type WhiteDwarfCatalog = {
  generatedAt: string;
  summary: WhiteDwarfSummary;
  records: WhiteDwarfRecord[];
  anchors: WhiteDwarfAnchor[];
  sources: SourceDescriptor[];
};

export type UniverseSnapshot = {
  generatedAt: string;
  query: {
    radiusPc: number;
    limit: number;
    search: string | null;
  };
  sources: SourceDescriptor[];
  systems: UniverseSystem[];
  whiteDwarfs: {
    summary: WhiteDwarfSummary;
    anchors: WhiteDwarfAnchor[];
    sources: SourceDescriptor[];
  };
};
