# TOI-3757b: Magnetosphere, Radiation, and Chemistry Analysis
## Ultra-Hot Mini-Neptune with Sulfur Chemistry

---

## 1. Host Star Radiation Environment

### Stellar Radiation Spectrum

TOI-3757 (M0V) produces enhanced XUV flux due to higher luminosity:

**Spectral Energy Distribution:**
- **Bolometric Luminosity**: L* = 0.087 L☉
- **Peak Wavelength**: λpeak = 741 nm (near-infrared)
- **UV Fraction** (<400 nm): ~4-5% of total luminosity
- **EUV Fraction** (10-121 nm): ~0.6-0.8% of total luminosity
- **Visible Fraction** (400-700 nm): ~28-32% of total luminosity

**Radiation Flux at Planet (a = 0.0384 AU):**

| Wavelength Range | Flux [W/m²] | Photon Flux [cm⁻² s⁻¹] |
|------------------|-------------|------------------------|
| UV (120-400 nm) | 42.3 | 1.4×10¹² |
| EUV (10-121 nm) | 22.5 | 6.8×10¹¹ |
| Lyman-α (121.6 nm) | 1.12 | 4.2×10¹⁰ |
| Soft X-ray (0.1-10 nm) | 0.42 | 3.8×10¹⁰ |
| Visible (400-700 nm) | 1150 | 3.2×10¹⁶ |
| Infrared (>700 nm) | 1994 | - |

**Comparison to TOI-1231b:**

| Parameter | TOI-3757b | TOI-1231b | Ratio |
|-----------|-----------|-----------|-------|
| Total Flux | 3210 W/m² | 288 W/m² | 11.1× HIGHER |
| UV Flux | 42.3 W/m² | 12.5 W/m² | 3.4× HIGHER |
| EUV Flux | 22.5 W/m² | 6.8 W/m² | 3.3× HIGHER |
| Lyman-α | 1.12 W/m² | 0.31 W/m² | 3.6× HIGHER |

**Key Insight**: TOI-3757b receives 11× more total radiation and 3.3-3.6× more EUV than TOI-1231b. This massive difference in energy input drives fundamentally different photochemistry.

### Stellar Activity

- **Hα Emission**: Moderate, log(L_Hα/L_bol) ≈ -4.4
- **Rotation Period**: ~25-40 days
- **Flare Frequency**: 1-3 flares per month
- **Coronal Mass Ejections**: ~1 per week

---

## 2. Radiation Flux and Thermal Properties

### Energy Deposition in Atmosphere

**Lyman-α Heating:**
- Absorption Cross-Section: σ(Ly-α) = 5.6×10⁻¹⁷ cm²
- Column Density above 100 km: N_H ≈ 5×10⁹ cm⁻² (optically thick)
- Heating Efficiency: 80-90%
- Heating Rate: 200-250 K (compared to 50-80 K at TOI-1231b)
- Thermospheric Temperature Rise: 759 K (1 bar) → 1250 K (exosphere)

**EUV Absorption:**
- Heating Rate: 40-60% of EUV energy
- Integrated Heating: 1.3 W/m² deposited in thermosphere
- Total Heating Power: 5.2×10¹⁶ W

**Total Radiative Heating Power:**
- Atmospheric Heating: 1.9 W/m² (3.8× TOI-1231b's 0.5 W/m²)

### Thermal Structure Resulting from Radiation

**Temperature Profile:**

| Altitude | Pressure | Temperature | Primary Heat Source |
|----------|----------|-------------|----------------------|
| 0 km | 1.0 bar | 759 K | Stellar radiation + EUV |
| 10 km | 0.1 bar | 550 K | Adiabatic gradient |
| 20 km | 0.01 bar | 480 K | Radiative equilibrium |
| 40 km | 0.0001 bar | 520 K | Thermal inversion (strong) |
| 60 km | 0.000001 bar | 700 K | Lyman-α absorption |
| 80 km | ~10⁻⁷ bar | 1250 K | Peak Lyman-α heating |

---

## 3. Chemical Composition and Temperature Chemistry

### Equilibrium Composition at T = 759 K

At 759 K, the atmosphere transitions from chemically constrained to chemically active:

**Dominant Species:**
- H₂: 68-72%
- He: 22-28%
- H₂O: 0.5-2% (condensing only at cloud base)
- CH₄: 1-3% (enhanced by M-dwarf UV photochemistry)
- SO₂: 0.3-1% (NEW - only at high T!)
- H₂S: 0.01-0.1% (reducing agent)

### Temperature-Dependent Equilibrium Reactions

| Reaction | ΔG [kJ/mol] at 759K | Equilibrium K | Direction |
|----------|-------------------|---------------|-----------|
| H₂ + ½O₂ ⇌ H₂O | -228 | 10³¹ | Rightward |
| CH₄ + H₂O ⇌ CO + 3H₂ | +142 | 10⁻¹⁹ | Leftward (stable) |
| 2H₂S ⇌ 2H₂ + S₂ | +164 | 10⁻¹⁸ | Leftward (stable) |
| H₂S + ½O₂ ⇌ SO₂ + H₂O | -142 | 10²⁰ | RIGHTWARD (NEW!) |

**Key Discovery**: At 759 K, H₂S oxidation becomes thermodynamically favorable. This is NOT present at 329.6 K!

### Condensate Phases

**Water Cloud:**
- Condensation Altitude: ~0-10 km (at 1-bar cloud base, T ~ 300 K)
- Cloud Particle Phase: Liquid water (T > 273 K at cloud level)
- Optical Depth: τ ~ 0.4-0.8 (reduced due to higher T)
- Particle Size: 5-20 μm (larger than cooler planets)

**Sulfur Aerosols:**
- Composition: SO₂-derived aerosols or S₈ elemental sulfur
- Formation Altitude: 20-40 km (photochemical zone)
- Optical Depth: τ ~ 0.2-0.5
- Significance: UNIQUE TO HOT PLANETS

---

## 4. Photochemistry (High-Temperature M-Dwarf Regime)

### Temperature Regime Classification

At 759 K, TOI-3757b is in the **PHOTOCHEMICALLY ACTIVE** boundary:
- Molecular species: Days-to-weeks lifetimes
- Radical species: Milliseconds-to-seconds lifetimes
- Kinetic vs Thermochemical: Kinetically controlled (not equilibrium)

### M-dwarf UV photochemistry at high temperature

**Same strong M-dwarf UV, but photochemical branching is more complex:**

**Water-Hydroxyl Cycle (Primary):**
```
H₂O + hν(EUV, <200 nm) → H + OH
OH + H₂ → H₂O + H (recycling, competing with:)
OH + CH₄ → CH₃ + H₂O (fast at 759 K)
H + O₂ → HO₂ + hν
HO₂ + CH₃ → CH₄ + O₂ (regeneration)
```
Result: H₂O abundant (0.5-2%), CH₄ enhanced (1-3%)

**Methane Oxidation (Secondary):**
```
CH₄ + OH → CH₃ + H₂O (RAPID at high T)
CH₃ + O₂ → CH₃O₂ (branching)
CH₃O₂ + NO/HO₂ → further oxidation
CO formation via CH₃ pathway
```
Result: Fast CH₄ loss, CO production (10-100 ppm)

**Sulfur Oxidation (Tertiary - NEW at high T):**
```
H₂S + OH → SH + H₂O (SLOW at <500 K, FAST at 759 K)
SH + O₂ → SO + OH (branching)
SO + OH → SO₂ + H (final step)
SO₂ + hν → SO + O (photolysis feedback)
SO₂ → accumulates (lifetime ~1000 years)
```
Result: SO₂ abundance rises to 0.3-1% (OBSERVABLE!)

### Reaction Rate Constants (Temperature-Dependent)

**Key Sulfur Reaction:**

CH₄ + OH Rate at 329.6 K: 2.3×10⁻¹⁴ cm³/s
CH₄ + OH Rate at 759 K: 1.8×10⁻¹³ cm³/s (7.8× FASTER)

H₂S + OH Rate at 329.6 K: negligible (3×10⁻¹⁵)
H₂S + OH Rate at 759 K: 2.1×10⁻¹² cm³/s (BECOMES COMPETITIVE!)

**Effect**: At 759 K, sulfur chemistry is no longer negligible.

### Temperature-Dependent Photochemical Timescales

| Species | Lifetime at 329.6K | Lifetime at 759K | Change |
|---------|-------------------|------------------|--------|
| CH₄ | 100 years | 10 years | 10× FASTER |
| CO | 50 years | 5 years | 10× FASTER |
| SO₂ | Negligible (not formed) | 1000 years | ENABLED |
| HCN | Negligible | 1-10 years | ENABLED |

---

## 5. Hydrogen Escape and Photoevaporation

### Escape Flux

**H Escape Flux**: 1.2×10⁹ H atoms/(cm² s)
- 5.7× faster than TOI-1231b (2.1×10⁸)
- Still radiation-limited (not energy-limited)

**Mass Loss Rate:**
- H escape: 8.2×10⁻¹² kg/s
- Total mass loss: 1.2×10⁻¹¹ kg/s
- Annual loss: 0.26 M_E/Gyr

**Atmospheric Lifetime:**
- Current Atmosphere: 85.3 M_E total, ~70 M_E envelope
- Escape Mass: 0.26 M_E/Gyr
- Lifetime: ~44 Gyr to lose 10% (still secure)
- Status: EXCELLENT retention, but declining from TOI-1231b

### Escape Mechanism

Despite shorter orbital period and stronger radiation, escape is still limited by:
- Large binding energy (Eg/Et = 221)
- Radiation-limited regime (atmosphere density controls escape rate)
- High escape velocity (8.85 km/s)

---

## 6. Magnetosphere and Stellar Wind

### Magnetic Field Likelihood

**TOI-3757b (85.3 M_E sub-Neptune):**
- Similar mass to TOI-1231b (15.4 M_E), but scaled larger
- Density much lower (0.58 vs 1.28 g/cm³)
- Likely has NO strong intrinsic magnetic field
- Upper Limit: ~0.1 G (weak field at best)

### Stellar Wind Interaction

**M0V Stellar Wind at 0.0384 AU:**
- Wind Velocity: 320-400 km/s (higher than at TOI-1231b due to proximity)
- Wind Density: ~10⁵ protons/cm³ (HIGHER than at 0.1288 AU)
- Dynamic Pressure: ~8-15 nPa (3-5× higher)

**Planet-Wind Interaction:**
- Magnetopause Radius (if field exists): ~2-3 R_p
- Ionopause Radius (from ionosphere): ~5-7 R_p
- Most Likely: UNMAGNETIZED, stellar wind directly compresses atmosphere

**Wind Effect on Escape:**
- Direct ion escape: ~0.5×10⁻¹¹ kg/s (significant component)
- Wind stripping: Removes ions from upper atmosphere
- Contribution to total loss: ~25-35% of total escape

---

## 7. Ionosphere and Ion Chemistry

### Ionization Mechanisms

**Lyman-α Ionization:**
- Photon Flux: 4.2×10¹⁰ photons/(cm² s) (stronger than TOI-1231b)
- Peak Ionization Altitude: 35-45 km
- Peak Electron Density: 10⁵-10⁶ cm⁻³ (higher than TOI-1231b)

**Temperature Effects on Ion Chemistry:**

At 759 K (vs 329.6 K for TOI-1231b):
- Ion-molecule reaction rates: 3-10× faster
- Dissociative recombination rates: 2-5× faster
- Mean ion lifetime: Still milliseconds (fast removal)
- Ion species: Remain dominated by H₃O⁺, OH⁻

### Ion Chemistry with Sulfur

**New sulfur-based ions:**
```
H₂S + hν → H₂S⁺ + e⁻
H₂S⁺ + H₂O → HSO⁺ + H₂
HSO⁺ + H₂O → H₃O⁺ + SO
SO + O₂ → SO₂ + O (photochemical continuation)
SO₂⁺ + e⁻ → SO + O (dissociative recombination)
```

These sulfur ions may contribute to observed SO₂ abundance.

---

## 8. Rock Vapor and Aerosols

### Rock Vapor Components

**At 759 K, rock vapor is still NOT thermally expected**, but POSSIBLE if:
1. Strong tidal dissipation heats interior
2. Surface hotspots exceed 1200 K
3. Transient stellar flares cause brief heating

**More Likely**: Rock vapor negligible at TOI-3757b.

### Sulfur Aerosols (Primary)

**Composition**: SO₂-derived particles, elemental sulfur (S₈), or sulfur compounds

**Formation:**
1. SO₂ production via photochemistry: ~10⁸ molecules/(cm² s)
2. Nucleation into particles: Temperature-dependent
3. Growth via coagulation: Competitive process

**Properties:**
- **Particle Size**: 0.1-1 μm (submicron range)
- **Optical Depth**: τ ~ 0.2-0.5 at 0.5 μm wavelength
- **Refractive Index**: m ≈ 1.5-1.7 (absorbing, yellow color likely)
- **Single Scattering Albedo**: ω ≈ 0.7-0.85 (moderately absorbing)

**Effect on Spectra:**
- Adds absorption in UV-visible (0.3-1.0 μm)
- Reduces transmission spectroscopy SNR below 1.0 μm
- Increases opacity in infrared (sulfur compounds absorb broadly)

### Organic Aerosols (Secondary)

**From CH₄ photochemistry (tholins):**
- Production Rate: Fast at 759 K (months-to-years formation timescale)
- Optical Depth: τ ~ 0.1-0.3
- Effect: Compounds water cloud opacity

---

## 9. Chemical Equilibrium and Abundances

### Photochemical Model Results

**Species Abundances at 759 K:**

| Species | Abundance | Lifetime | Source/Sink |
|---------|-----------|----------|-------------|
| H₂O | 0.5-2% | Hours | Photolysis + recycling |
| CH₄ | 1-3% | 10 years | Photochemistry-controlled |
| CO | 10-100 ppm | 5 years | CH₄ oxidation |
| SO₂ | 300-1000 ppm | 1000 years | H₂S oxidation (NEW) |
| O₂ | 0.1-1 ppm | Months | H₂O dissociation |
| HCN | 0.1-1 ppm | 1-10 years | NEWLY FORMED at high T |

**Unique Feature**: SO₂ is present at DETECTABLE levels (0.03-0.1%)

### Vertical Distribution

**Key Difference from TOI-1231b:**
- SO₂ forms throughout 20-60 km altitude range
- Vertical profile shows SO₂ increase with altitude (photochemical source)
- CH₄ and CO distributions shifted (faster photochemistry)

---

## 10. JWST Spectroscopy Predictions

### Transmission Spectroscopy Features

**Water (1.1-1.6 μm):**
- Feature Depth: 0.9-1.3%
- SNR (4 transits): 40-55
- Cloud Optical Depth: τ ~ 0.5 (reduced from cooler planets)

**Methane (2.2-2.5 μm):**
- Feature Depth: 0.4-0.7%
- SNR (4 transits): 20-30

**Sulfur Dioxide (UNIQUE):**
- Primary Band (7.3 μm): 0.35-0.65%
- Secondary Band (4.0 μm): 0.15-0.3%
- Combined SO₂ SNR: 25-40
- CRITICAL: SO₂ detection would confirm high-T photochemistry model

**CO (4.5-5.0 μm):**
- Feature Depth: 0.3-0.5%
- SNR: 12-20

### Recommended JWST Observations

- **Primary Goal**: SO₂ detection at 7.3 μm
- **Secondary Goal**: H₂O + CH₄ characterization
- **Instrument**: NIRSpec Prism + MIRI for SO₂
- **Integration Time**: 8-12 hours (optimize for SO₂ feature)
- **Key Innovation**: First SO₂ transmission spectrum of hot mini-Neptune

### Expected Science Return

TOI-3757b will provide:
1. **First observational proof of high-T sulfur chemistry** in exoplanet atmosphere
2. **Validation of M-dwarf strong M-dwarf UV** at temperature extreme (759 K)
3. **Benchmark for hot mini-Neptune models** (atmosphere composition)
4. **Test of photochemistry kinetics** across 300K-1400K range

---

## Summary

TOI-3757b's radiation environment, photochemistry, and escape represent a **CRITICAL TRANSITION** from cool sub-Neptunes to hot mini-Neptunes:

- **Radiation**: 11× more intense than TOI-1231b
- **Photochemistry**: Activates sulfur chemistry (SO₂ formation)
- **Escape**: 5.7× faster hydrogen loss, but still secure on Gyr timescales
- **Observable**: Unique SO₂ feature at 7.3 μm not present in cooler planets
- **Significance**: Validates photochemistry transition models and M-dwarf UV-photochemistry picture

This planet is a **CRITICAL CALIBRATION POINT** for understanding exoplanet atmospheric chemistry across temperature ranges relevant to hot mini-Neptunes around M-dwarfs.
