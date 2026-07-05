# WASP-52b: MAGNETOSPHERE, RADIATION ENVIRONMENT & ATMOSPHERIC CHEMISTRY
## K-Dwarf Hot Jupiter Chemistry

---

## PART 1: STELLAR RADIATION ENVIRONMENT

### 1.1 K-Dwarf UV & EUV Flux Characterization

**Stellar Parameters:**
- T_eff = 5000 K (K2V, ∼200 K cooler than Sun)
- L_* = 1.0 L_☉
- Orbital Distance: 0.0272 AU
- Unexpectedly luminous for spectral type (possibly evolved)

**Solar-Normalized Fluxes:**
Using distance scaling and K-dwarf temperature correction:

F_total ≈ 1-2 × 10⁶ W/m² (1000-1500× Earth irradiance)
F_UV ≈ 0.5-1.5 × 10⁴ W/m² (500-1000× Earth UV)
F_EUV ≈ 0.5-1.5 × 10¹ W/m² (500-1000× Earth EUV)

These are **∼50% lower** than F/G-dwarf systems at comparable orbital distances.

### 1.2 Impact of Lower UV Flux on Photochemistry

**Critical Implications:**
- Reduced H₂O photodissociation rate
- Lower atomic hydrogen production
- Slower photochemical cycles
- Enhanced molecular species preservation

**Ionizing Photon Flux (E > 13.6 eV):**
n_ion ≈ 10⁴-10⁵ photons/cm²/s (10-100× solar ionizing flux)

This is 10-100× lower than F/G-dwarf systems.

---

## PART 2: UPPER ATMOSPHERIC STRUCTURE & IONIZATION

### 2.1 Thermospheric Temperature Profile

**Temperature Structure:**
```
Altitude (km)   Temperature (K)   Density (cm⁻³)
   +200            1000-1100       ~10⁶
   +150            1050             ~10⁷
   +100            1100-1150        ~10⁹
    +50            1100-1200        ~10¹¹
     0             1050-1100        ~10¹²
```

Notably cooler than WASP-19b or WASP-25b due to lower stellar EUV flux.

### 2.2 Ionospheric Layers & Ion Densities

**Peak Electron Density:**
n_e,max ≈ 10⁵-10⁶ cm⁻³ (comparable to hotter systems, surprisingly)

The reason: Although K-dwarf produces lower UV flux, the **integrated effect of Lyα resonance line** still creates significant ionization.

**Ion Species Hierarchy:**
1. **H₃⁺** - Dominant ion (from H₂⁺ + H₂ rapid cascade)
2. **He⁺** - Secondary ion
3. **H⁺** - Minor contribution
4. **CH₃⁺** - Possible if CH₄ present (novel for hot Jupiters)

---

## PART 3: RADIATION HEATING & THERMAL BALANCE

### 3.1 EUV Absorption & Heat Deposition

**Heat Deposition Rate:**
Q ≈ 3-8 mW/m² (reduced from WASP-19b's 10-30 mW/m²)

This lower heating rate produces the cooler thermosphere observed.

### 3.2 Radiative Cooling

The cooler atmosphere radiates more efficiently in the infrared, balancing the lower EUV input to reach equilibrium around 1000-1100 K in the thermosphere.

---

## PART 4: PHOTOCHEMICAL REACTION NETWORK

### 4.1 Water Photodissociation (PARTIAL)

**Critical Reaction:**
```
H₂O + hν (100-200 nm) → H + OH    (Channel 1, ∼80%)
H₂O + hν (100-200 nm) → H₂ + O    (Channel 2, ∼20%)
```

**Photodissociation Rate:**
J(H₂O) ≈ 2-5 × 10⁻³ s⁻¹ (∼2-5× lower than F/G-dwarfs)

**Critical Result:** Significant H₂O survives to lower altitudes and becomes observable in transmission spectra.

### 4.2 Atomic Hydrogen Production Rate

**H Atom Production:**
P_H ≈ 10¹⁰-10¹¹ cm⁻³ s⁻¹ (lower than ultra-hots)

**Steady-State H Concentration:**
n(H) ≈ 10⁵-10⁶ cm⁻³ (reduced relative to WASP-19b)

### 4.3 Molecular Hydrogen Formation & Loss

**H + OH Reaction:**
H + OH + M → H₂O + M (k ≈ 6.0 × 10⁻³¹ cm⁶/s)

**Effect:** More H₂O reformation due to:
1. Lower H atom production
2. Higher OH concentration from reduced UV
3. More efficient recombination reactions

**Result:** H₂O mixing ratio ≈ 0.1-0.5% (partially preserved)

---

## PART 5: CARBON & OXYGEN PHOTOCHEMISTRY

### 5.1 CO/CO₂ Equilibrium

**CO Formation Efficiency:**

At lower UV flux and cooler temperature:
- CO₂ photodissociation reduced: J(CO₂) ≈ 5 × 10⁻⁶ s⁻¹
- CO + OH recombination favored: More CO₂ formation

**CO/CO₂ Ratio:**
n(CO) / n(CO₂) ≈ 10-30:1 (intermediate between ultra-hots and cool Jupiters)

**Mixing Ratios:**
- x(CO) ≈ 5 × 10⁻⁴ to 2 × 10⁻³
- x(CO₂) ≈ 1 × 10⁻⁴ to 5 × 10⁻⁴

### 5.2 Atomic Oxygen Chemistry

**Atomic Oxygen Abundance:**
n(O) ≈ 10⁶-10⁷ cm⁻³ (moderate)

Oxygen is recycled efficiently through CO/CO₂ and H₂O chemistry.

### 5.3 Methane Chemistry (Possible)

**CH₄ Formation Pathways:**

At 1315 K, methane formation is suppressed but possible:
```
C + H₂ + H ⇌ CH₃  (slow, requires specific conditions)
CO + H₂ + catalyst → CH₃ + O (unlikely without metallic catalyst)
```

**Predicted CH₄ Abundance:**
x(CH₄) ≈ 10⁻⁶ to 10⁻⁵ (trace if present)

**Novel Aspect:** If CH₄ is detected at these temperatures, it would be anomalous and would suggest:
- Efficient formation pathways not yet understood
- Possible catalytic surfaces (dust grains?)
- Alternative photochemical pathways

---

## PART 6: HYDROGEN ESCAPE MECHANISMS

### 6.1 Jeans Escape

**Jeans Parameter:**
λ_J ≈ 5-6 (marginally stable)

**Jeans Escape Flux:**
Φ_Jeans ≈ 10²-10³ cm⁻² s⁻¹ (minor contributor)

### 6.2 Hydrodynamic Escape

**Outflow Velocity:**
v_out ≈ √(2 × c_p × T_thermosphere) ≈ 7-9 km/s

Lower than WASP-19b (11.6 km/s) due to cooler thermosphere.

**Effect:** Reduced hydrodynamic escape rate.

### 6.3 Photochemical Hydrogen Escape

**Total H Escape Rate:**
Φ_H ≈ 10⁵-10⁶ g/s

This is lower than ultra-hots due to:
1. Reduced H atom production (lower UV)
2. More efficient H₂O reformation
3. Lower outflow velocities

### 6.4 K-Dwarf Wind Interaction

The stellar wind from a K-dwarf is:
- Lower mass-loss rate: Ṁ_wind ≈ 10⁻¹⁴ M_☉/yr (vs. ∼10⁻¹⁴-10⁻¹³ for G/F-dwarfs)
- Lower ram pressure: P_SW ≈ 10⁻¹⁶ dyne/cm²

**Effect:** Stellar wind acceleration of escaping H atoms is negligible.

---

## PART 7: MAGNETOSPHERE & PARTICLE INTERACTIONS

### 7.1 Ionospheric Coupling

**Peak Ionospheric Density:**
n_e ≈ 10⁵-10⁶ cm⁻³

Despite lower EUV flux, the concentrated Lyα photon flux maintains ionospheric densities comparable to hotter systems.

### 7.2 Ion Drift Dynamics

The induced magnetosphere (E × B drift) operates similarly to hotter systems:
- Drift velocity: v_drift ≈ 100-300 km/s
- Scale size: ~R_p

### 7.3 Dayside/Nightside Asymmetry

**Dayside:**
- Peak ionization: n_e ≈ 10⁶ cm⁻³
- Strong UV driving

**Terminator:**
- Gradient-driven currents

**Nightside:**
- Rapid recombination: n_e < 10³ cm⁻³
- Essentially neutral

---

## PART 8: SPECTROSCOPIC DIAGNOSTICS

### 8.1 Hydrogen Lyman-Alpha (Lyα)

**Lyα Absorption Prediction:**
5-15% of stellar Lyα absorbed (less than ultra-hots, more than cool Jupiters)

This reflects the intermediate hydrogen escape rate.

### 8.2 Water Features (PRIMARY DISCOVERY TARGET)

**H₂O Absorption Bands:**

- **2.7 μm band:** Δ(R_p/R_*) ≈ 0.2-0.3% (STRONG, clearly detectable)
- **6.3 μm band:** Δ(R_p/R_*) ≈ 0.15-0.25% (strong in thermal emission)
- **3.0-3.5 μm region:** Δ(R_p/R_*) ≈ 0.1-0.2% (overtone bands)

**Significance:** Water detection would be definitive proof of partial dissociation and validation of K-dwarf chemistry models.

### 8.3 CO Infrared Features

**CO Absorption:**
- **2.3-2.5 μm band:** Δ(R_p/R_*) ≈ 0.1-0.15%
- **4.6-4.8 μm band:** Δ(R_p/R_*) ≈ 0.05-0.1%

Moderate CO features, less dominant than in hotter systems.

### 8.4 CO₂ Features

**CO₂ Absorption (Enhanced vs. ultra-hots):**
- **2.0 μm band:** Δ(R_p/R_*) ≈ 0.05-0.1%
- **4.2-4.3 μm band:** Δ(R_p/R_*) ≈ 0.05-0.15%

Enhanced CO₂ is a clear signature of the K-dwarf cooler photochemistry.

### 8.5 Methane Search

**CH₄ Bands (if present):**
- **3.3 μm band:** Δ(R_p/R_*) ≈ 0.02-0.05% (marginal detection limit)
- **7.7 μm band:** Δ(R_p/R_*) ≈ 0.02-0.05%

Detection would require ultra-high SNR and multiple transits.

### 8.6 Atomic Line Diagnostics

**Weak Atomic Features:**
- Na D lines: Minimal
- Atomic H: Weak (reduced H atom production)
- Atomic O: Possible weak absorption

---

## PART 9: LONG-TERM ATMOSPHERIC EVOLUTION

### 9.1 Hydrogen Depletion Timescale

**Current Loss Rate:** Φ_H ≈ 10⁵-10⁶ g/s

**Timescale to Lose 50% of H₂:**
τ₅₀ ≈ 1-5 Gyr (similar to WASP-25b, slower than WASP-19b)

At age 1-2 Gyr, WASP-52b has lost ~10-30% of initial hydrogen.

### 9.2 Water Preservation

Due to reduced H atom production and efficient H₂O reformation:
- Water abundance increases with age (less dissociation)
- Eventually x(H₂O) may reach ~1% (higher than at current epoch)

### 9.3 Evolution Toward Smaller Radius

**Initial Radius:** 1.265 R_J
**After 50% H loss:** ~1.0 R_J (moderately inflated Neptune-size)
**After 90% H loss:** ~0.6 R_J (sub-Neptune)

Evolutionary timescale to significant radius change: ~5-10 Gyr

---

## PART 10: SYNTHESIS & KEY RESULTS

### 10.1 Dominant Physical Processes

| Process | Magnitude | Importance |
|---------|-----------|-----------|
| EUV heating | 3-8 mW/m² | Creates 1000-1100 K thermosphere |
| H₂O photodissociation | J(H₂O) = 2-5×10⁻³ s⁻¹ | Partial; significant water survives |
| H₂O formation/recombination | Efficient | Produces strong H₂O feature |
| H photochemical escape | 10⁵-10⁶ g/s | Significant but moderate |
| CO/CO₂ chemistry | CO/CO₂ ≈ 10-30:1 | Both species present and detectable |
| K-dwarf UV | 50% of G-dwarf | Fundamental difference from solar analogs |
| CH₄ (if present) | <10⁻⁵ | Novel if detected; constrains chemistry |

### 10.2 Key Scientific Results

**WASP-52b is scientifically unique because:**

1. **K-Dwarf Host System:** First opportunity to study hot Jupiter around K-dwarf in detail with JWST

2. **Preserved Water:** Clearly detectable water features in transmission spectrum (KEY DISCOVERY)

3. **Multiple Molecular Species:** H₂O, CO, CO₂ all observable (complex but rich spectroscopy)

4. **Intermediate Regime:** Tests models at intermediate T where multiple processes compete

5. **Methane Search:** First test of methane detection in hot Jupiter (if present would be anomalous)

6. **Host Star Effects:** Quantifies how K-dwarf chemistry differs from solar analogs

### 10.3 JWST Science Predictions

**Expected High-Confidence Detections (3-5σ):**
- Water (H₂O) features at 2.7 μm and 6.3 μm

**Expected Good-Confidence Detections (2-3σ):**
- Carbon monoxide (CO) features at 2.3-2.5 μm and 4.6-4.8 μm
- Carbon dioxide (CO₂) bands at 2.0 μm and 4.2-4.3 μm

**Expected Marginal Detections (1-2σ):**
- Methane (CH₄) bands at 3.3 μm and 7.7 μm (if present)
- Atomic/ionic species features

### 10.4 Comparative Context

**WASP-52b vs. Other Systems:**

| System | T (K) | Host | Key Feature |
|--------|-------|------|------------|
| WASP-19b | 2113 | F/G | No water, ultra-hot |
| WASP-25b | 1400-1500 | F/G | Partial water, hot |
| WASP-52b | 1315 | K2V | Water + CO₂ + K-dwarf |
| HAT-P-7b | 2000 | F | TiO/VO prominent |

WASP-52b is uniquely positioned as a **K-dwarf hot Jupiter at intermediate temperature**.

### 10.5 Conclusion

WASP-52b represents a new class of exoplanet for detailed study: the **K-dwarf hot Jupiter**. Its cooler host star (relative to solar analogs) produces reduced UV flux that fundamentally alters atmospheric photochemistry compared to hotter systems. The result is a partially preserved water atmosphere with significant CO and CO₂ components.

JWST observations will provide the first high-precision characterization of this class. Detection and measurement of water abundance will test photochemical models and validate predictions for K-dwarf atmospheres. The possible detection of methane traces would indicate chemistry pathways not yet well understood. Combined with observations of solar-analog and F-dwarf systems, WASP-52b will illuminate how stellar spectral type shapes exoplanet atmospheres.

---

**Analysis uses standard Jeans and energy-limited escape physics.**
**References: WASP-52 literature; K-dwarf systems; comparative hot Jupiter studies**
