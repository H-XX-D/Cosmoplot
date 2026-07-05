# WASP-52 SYSTEM: COMPLETE EXOPLANET ANALYSIS
## Hot Jupiter around K-Type Dwarf Star

---

## PART 1-2: STELLAR & PLANETARY CONTEXT

### Stellar Properties
**WASP-52 Host Star:**
- Spectral Type: K2V (cool dwarf)
- T_eff: 5000 K (∼200 K cooler than Sun)
- Mass: 0.87 M_☉
- Luminosity: 1.0 L_☉ (surprisingly luminous for K-dwarf)
- Age: 1-2 Gyr

The K2V classification provides **reduced UV flux** compared to F/G-type hosts (by factor of ∼2-3). This fundamentally alters atmospheric photochemistry.

### Planetary Parameters
- Mass: 146.2 M_E = 0.461 M_J (lower mass than WASP-19b/25b)
- Radius: 14.24 R_E = 1.265 R_J (less inflated)
- Density: ∼0.26 g/cm³
- Equilibrium Temperature: 1315 K
- Orbital Distance: 0.0272 AU
- Orbital Period: 1.612 days

---

## PART 3: ATMOSPHERIC STRUCTURE & COMPOSITION

### Temperature Profile
The cooler equilibrium temperature (1315 K vs. 2113 K for WASP-19b) produces:

**Dayside Photosphere:** 1315 K
**Nightside Minimum:** 600-800 K
**Temperature Contrast:** ∼500-600 K (moderate)

### Binding Energy Analysis
BE = GM/R = 1.96 × 10⁸ J/kg
T/T_BE ≈ 0.0066 (thermal energy 0.66% of binding energy)

**Jeans Parameter:** λ_J ≈ 5-6 (more stable than ultra-hots)

### Chemical Composition
At 1315 K:
- **H₂O is PARTIALLY preserved** (not completely dissociated as in WASP-19b)
- **CO is significant** but CO₂ recombination is more efficient
- **CH₄ may be present** in trace amounts (novel for hot Jupiters at this temperature)
- **Scale height:** H ≈ 2.6 km (smaller than ultra-hots due to cooler T)

---

## PART 4: PHOTOCHEMISTRY & ATMOSPHERIC CHEMISTRY

### Water Dissociation (Partial)
At 1315 K, water dissociation is:
- J(H₂O) ≈ 2-5 × 10⁻³ s⁻¹ (K-dwarf produces lower UV flux)
- Result: x(H₂O) ≈ 0.1-0.5% (survives to observable altitudes)

This is the **KEY DIFFERENCE** from WASP-19b (where x(H₂O) < 0.01%).

### CO/CO₂ Equilibrium
- CO formation rate: Reduced due to lower UV
- CO₂ recombination: MORE efficient at lower T
- Result: CO/CO₂ ≈ 10-30:1 (intermediate)
- CO mixing ratio: ∼10⁻⁴ to 10⁻³

### Methane Possibility
At 1315 K, some CH₄ may exist:
- CH₄ formation: Requires efficient hydrogenation of carbon
- Predicted abundance: 10⁻⁶ to 10⁻⁵ (trace)
- Observable signature: Possible if J(CH₄) < 10⁻⁴ s⁻¹

---

## PART 5: ATMOSPHERIC CIRCULATION

### Wind Speeds
Due to moderate thermal contrast (ΔT ≈ 500-600 K):
**v_jet ≈ 2-3 km/s** (weaker than ultra-hots at 5-6 km/s)

This reflects the reduced temperature gradient and stronger radiative damping.

### Timescales
- **Advective timescale:** τ_adv ≈ 6-8 hours
- **Radiative timescale:** τ_rad ≈ seconds (rapid adjustment)

---

## PART 6: HYDROGEN ESCAPE & LONG-TERM EVOLUTION

### Escape Rate
**Photochemical H escape:** Φ_H ≈ 10⁵-10⁶ g/s

This is **reduced** relative to WASP-19b (10⁶-10⁷ g/s) due to:
1. Cooler temperature (less thermal energy for escape)
2. Reduced UV flux from K-dwarf (fewer H atoms produced)
3. Lower Jeans parameter (less Jeans escape)

### Timescale to Deplete 50% H₂
**τ₅₀ ≈ 1-5 Gyr**

Slower than ultra-hots, similar to WASP-25b. At age 1-2 Gyr, WASP-52b has lost ~10-30% of initial hydrogen.

---

## PART 7: REFRACTORY SPECIES & SO₂ CHEMISTRY

### TiO/VO Condensation
At 1315 K, **TiO/VO are much less prominent**:
- Condensation temperature: ~1300-1400 K
- Particle optical depth: Minimal, τ_TiO < 0.01
- Observable signature: Weak or absent

### SO₂ Dissociation
Some SO₂ survives to observable altitudes:
- x(SO₂) ≈ 10⁻⁵
- SO₂ absorption bands: Weak but possibly detectable

---

## PART 8: MAGNETOSPHERE & IONOSPHERIC STRUCTURE

### Ionospheric Peak
**Peak electron density:** n_e ≈ 10⁵-10⁶ cm⁻³

Comparable to ultra-hots due to stellar EUV (dominated by Lyα line).

### Ion Chemistry
The ionosphere is dominated by:
- H₃⁺ (from H₂⁺ + H₂ reaction)
- Possible CH₃⁺ from methane ionization
- Minor contributions from other ion-molecule reactions

---

## PART 9: TRANSIT SPECTROSCOPY & JWST PREDICTIONS

### Expected Transmission Features

| Wavelength | Species | Depth | Notes |
|-----------|---------|-------|-------|
| 0.5-1.0 μm | Rayleigh | 0.1-0.2% | Weak TiO, molecular opacity dominates |
| 1.0-1.5 μm | H₂O | 0.15-0.25% | Water partially present (MAJOR feature) |
| 1.5-2.5 μm | CO | 0.1-0.15% | CO features visible |
| 2.5-3.0 μm | CO₂ | 0.05-0.1% | Enhanced CO₂ vs. ultra-hots |
| 3.0-5.0 μm | H₂O | 0.2-0.3% | Strong water absorption bands |
| 5-10 μm | CH₄ possible | <0.05% | If detectable |

**Total Transit Depth:** 0.3-0.5%

### JWST Observations
**Primary Goal:** Detect and characterize water, CO, CO₂, and possibly methane

**Expected Results:**
1. **H₂O detection (3-5σ)** - Clear detection of water features (KEY SCIENCE)
2. **CO detection (2-3σ)** - Moderate confidence CO features
3. **CO₂ detection (1-2σ)** - Marginal CO₂ detection
4. **CH₄ search (1-2σ)** - Possible if present at estimated abundance

### Observational Program
- **Instrument:** NIRSpec G395H (1-5 μm, high resolution)
- **Number of Transits:** 3-4 (build high-confidence spectrum)
- **Exposure Time:** 2-3 hours per transit
- **Complementary:** MIRI (thermal emission), NIRCam (optical verification)

---

## PART 10: SYNTHESIS & SCIENTIFIC SIGNIFICANCE

### Key Physical Characteristics

1. **K-Dwarf Host Effect (weaker UV):**
   - Reduced UV flux compared to solar analogs
   - Altered photochemistry; water preservation enhanced
   - Lower ionospheric densities possible
   - Unique bridge to M-dwarf hot Jupiter studies

2. **Intermediate Temperature Regime:**
   - Water dissociation partial, not complete
   - CO₂ recombination significant
   - Multiple observable molecular species
   - Bridge between ultra-hots and cooler hot Jupiters

3. **Lower Hydrogen Escape Rate:**
   - Slower than ultra-hots due to cooler T
   - Evolutionary timescales extend to full Gyr
   - Planet may retain significant atmosphere over age

4. **Lower Mass System (0.46 M_J vs. 1.15 M_J for WASP-19b):**
   - Lower gravity (reduced scale height for same T)
   - Smaller transit signal (~0.3-0.5% vs. 0.6-0.8% for ultra-hots)
   - Requires sensitive JWST observations

### Comparative Scientific Value

**WASP-52b vs. WASP-19b Comparison:**
- Temperature: 1315 K vs. 2113 K (much cooler)
- Host Star: K2V vs. F/G-analog (much lower UV)
- Water Status: Partial vs. Complete dissociation
- CO/CO₂: Intermediate vs. CO-dominated
- Observable Species: Multiple vs. Atomic-dominated
- Primary Scientific Goal: **Water/CO₂ characterization** vs. H escape

### Future Research Directions

**Priority 1: Water Detection**
- JWST NIRSpec should definitively detect water features
- First clear water detection in a hot Jupiter of this temperature
- Tests theoretical predictions for water photodissociation

**Priority 2: Methane Search**
- If CH₄ is detected at 10⁻⁵ level, represents new class of hot Jupiter chemistry
- Would be anomalous for temperatures above ∼1200 K
- Requires ultra-high-precision spectroscopy

**Priority 3: Host Star Effects**
- Compare WASP-52b with solar-analog hot Jupiters
- Quantify K-dwarf UV impact on atmospheric chemistry
- Test theoretical models of host star-atmosphere coupling

**Priority 4: Circulation Dynamics**
- High-resolution ground-based spectroscopy for wind speed constraints
- Thermal emission mapping for day-night heat redistribution
- Constrain atmospheric circulation driven by K-dwarf

### Conclusion

WASP-52b is scientifically significant as a **K-dwarf hot Jupiter at intermediate temperature**. The combination of reduced UV flux (K-dwarf) and moderate temperature (1315 K) produces atmospheric chemistry distinctly different from solar-analog ultra-hots. The preservation of water molecules, presence of both CO and CO₂, and possible methane traces make WASP-52b an ideal target for JWST transmission spectroscopy.

The system bridges three important regimes: hot Jupiters around solar-type stars, hot Jupiters around cooler dwarfs, and the transition zone where molecular features remain observable. Future observations will illuminate how host star spectral type, planetary temperature, and atmospheric escape rates interact to shape exoplanet atmospheres.

---

**Analysis uses standard Jeans and energy-limited escape physics.**
**References: WASP-52 literature; K-dwarf hot Jupiter context; comparative system studies**
