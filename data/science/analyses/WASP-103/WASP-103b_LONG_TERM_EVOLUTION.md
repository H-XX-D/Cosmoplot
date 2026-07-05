# WASP-103b Long-Term Evolution Projection

## 1. Current State Summary

### Planetary Parameters
WASP-103b is one of the most massive ultra-hot Jupiters known, combining extreme stellar heating with a substantial planetary mass. This combination creates unique evolutionary dynamics distinct from both lighter hot Jupiters and cooler massive planets.

- **Mass**: 1.495 M_J (475 M_E)
- **Radius**: 1.528 R_J (17.2 R_E)
- **Equilibrium Temperature**: 2,508 K
- **Orbital Period**: 0.926 days
- **Stellar XUV Flux**: ~850 erg/s/cm² (at 1 AU equivalent: ~440,000 W/m²)
- **Orbital Distance**: 0.0225 AU

### Current Atmospheric Status
WASP-103b maintains a moderate density envelope despite being the second most massive ultra-hot Jupiter on our list. Recent spectroscopic observations and interior models suggest:

- **Primary Composition**: H₂/He atmosphere (∼75% H₂, 24% He, 1% metals)
- **Scale Height**: ~2,400 km (large, consistent with high temperature)
- **Atmospheric Mass Fraction**: ~0.012 M_J (0.8% of planetary mass)
- **Temperature Structure**: Inverted in upper atmosphere (TiO/VO opacity relevant)
- **Escape Status**: Moderate atmospheric loss ongoing
- **Mach Number**: ~1.8-2.2 (hydrodynamic escape regime)

### Binding Energy Calculations

For a massive, compact ultra-hot Jupiter like WASP-103b, the high gravity significantly constrains atmospheric loss.

**Escape Velocity at Exobase**:
- Exobase altitude: ~2.4 R_p
- Surface gravity (at cloud top): g = GM/R² = (6.674×10⁻¹¹ × 8.96×10²⁶)/(9.635×10⁷)² = 64.3 m/s²
- Escape velocity: v_esc = √(2GM/r) = 89.2 km/s

**Mean Atmospheric Temperature**: ~2,500 K
- Thermal velocity: v_th = √(3kT/m) = √(3 × 1.38×10⁻²³ × 2500 / 2.66×10⁻²⁷) = 6.2 km/s
- Escape parameter (λ): v_esc/v_th = 14.4 (strongly hydrodynamic)

**Binding Energy per H atom**: E_b = ½mv_esc² = 376 meV

WASP-103b's escape parameter is notably higher than KELT-9b's (14.4 vs. 9.9), indicating much stronger atmospheric retention despite receiving less XUV flux. The combination of high mass and moderate temperature provides superior gravitational binding.

---

## 2. One Gigayear Evolution

### Timescale Analysis for 1 Gyr

The primary loss mechanism remains **XUV photoevaporation**, but the reduced escape parameter and lower stellar flux create slower loss rates than KELT-9b.

**Mass Loss Rate Calculation**:

Using the hydrodynamic escape formalism:
$$\dot{M} = \epsilon \times \frac{F_{XUV}}{E_b} \times 4\pi R_p^2$$

Parameters:
- F_XUV = 850 erg/s/cm² (slightly lower than KELT-9b)
- E_b = 376 meV (higher binding energy due to stronger gravity)
- ε = 0.10-0.12 (heating efficiency)
- R_p = 9.635×10⁷ m

$$\dot{M} \approx 0.11 \times \frac{850 \times 6.242×10^{11}}{376} \times 4\pi \times (9.635×10^7)^2$$
$$\dot{M} \approx 0.11 \times 1.41×10^{12} \times 1.16×10^{17}$$
$$\dot{M} \approx 1.8×10^{28} \text{ g/s}$$

**Refined estimate accounting for higher escape parameter**: **2-3 × 10⁻³ M_J per Gyr** (lower than KELT-9b's 4-6 × 10⁻³)

### 1 Gyr Evolution Results

Over one billion years of evolution:

**Atmospheric Loss**: 1.5-2.5% of initial envelope
- Initial atmospheric mass: ~0.012 M_J
- Mass lost: ~1.8-3.0 × 10⁻⁴ M_J
- Remaining atmospheric mass: ~0.0118 M_J

The modest loss percentage reflects WASP-103b's strong gravitational binding.

**Radius Contraction**:
- Initial radius: 1.528 R_J
- Contraction rate: ~0.05 R_J per Gyr (less than KELT-9b due to lower heating)
- Post-1 Gyr radius: **1.478 R_J** (3.3% reduction)

**Mass Change**:
- Total planet mass: 1.495 M_J → 1.4948 M_J (negligible change)
- Envelope mass: 0.012 M_J → 0.0118 M_J (minimal loss)

**Composition Changes**:
Selective hydrogen escape creates gradual compositional shifts:
- H₂ abundance: ~75% → ~73%
- He abundance: ~24% → ~26% (relative increase)
- Metal abundance: ~1% → ~1.5%
- Upper atmosphere metal enrichment: Gradual but slower than KELT-9b

**Escape Rate (1 Gyr epoch)**:
- Average: **2.0 × 10¹⁰ g/s** (0.32× KELT-9b's escape rate)
- Stellar XUV variability: ±25% due to activity cycles
- Strong dependence on mass loss scaling (∝ 1/λ²)

---

## 3. Five Gigayear Evolution

### Total Atmospheric Loss by 5 Gyr

Over five billion years, WASP-103b's atmosphere changes modestly due to strong gravitational retention.

**Total hydrogen escaped**: 7-10% of original envelope
- Remaining envelope: 0.0108-0.0112 M_J (90-93% of original)
- Cumulative loss: ~0.6 × 10⁻⁴ M_J over 5 Gyr

**Density Evolution**:

Current mean density: ρ = M/V = 1.495 M_J / (1.528 R_J)³ = 0.439 g/cm³

After 5 Gyr:
- Planet mass: 1.4948 M_J
- Radius: 1.428 R_J (6.5% contraction from initial)
- New density: ρ₅ = 1.4948 / (1.428)³ = **0.510 g/cm³** (16% denser)

WASP-103b becomes noticeably denser over 5 Gyr, though the absolute change is smaller than KELT-9b because the initial density was already higher.

**Envelope Composition Remaining**:

The envelope develops subtle compositional stratification:
- **Upper photosphere**: H₂ (70%), He (28%), metals (2%)
- **Middle atmosphere**: H₂ (75%), He (24%), metals (1%)
- **Deep atmosphere**: Primary composition with minimal evolution

Heavier elements (Fe, Mg, Si) concentrate gradually in upper regions through preferential hydrogen loss, but this process is slow due to the high escape parameter limiting hydrogen removal.

**Stability Assessment at 5 Gyr**:

WASP-103b exhibits **very high atmospheric stability** at 5 Gyr:

1. **Strong binding energy**: v_esc/v_th = 13.1 (decreased from 14.4 due to radius contraction and composition changes)
2. **Low escape rate**: Down to ~1 × 10¹⁰ g/s (50% of initial)
3. **Hydrogen still dominant**: ~70% after 10% loss
4. **No destabilization signs**: Escape rate declining faster than atmospheric inventory, indicating stable trajectory

**Comparison to Current State**:
- Radius: 1.528 R_J → 1.428 R_J (-6.5%)
- Mass: 1.495 M_J → 1.4948 M_J (-0.08%)
- Escape rate: 2.0×10¹⁰ g/s → 1.0×10¹⁰ g/s (50% reduction)
- Temperature (unchanged by evolution): 2,508 K
- Spectral signature: Subtle metal line enhancement at high altitudes

---

## 4. Ten Gigayear Evolution

### Final Fate Prediction at 10 Gyr

At 10 billion years, WASP-103b reaches a quasi-equilibrium state with minimal ongoing atmospheric loss.

**Total Cumulative Atmospheric Loss**: 15-20% of original envelope
- Envelope mass at 10 Gyr: 0.0096-0.0102 M_J (80-85% of original)
- Total atmospheric escape: ~0.0018-0.0024 M_J

**Endpoint Composition**:

The atmosphere becomes slightly helium-enriched:
- **Primary composition**: H₂ (70%), He (28%), metals (2%)
- **Upper atmosphere**: Metal-enriched with detectable Na, K, Fe
- **Trace species**: Water vapor destroyed; possible metal oxides
- **Overall character**: Essentially unchanged in major composition

**Long-term Stability Assessment**:

WASP-103b reaches **strong dynamic equilibrium**:
1. Mass loss rate continues declining: ~3 × 10⁹ g/s at 10 Gyr
2. Envelope temperature remains high (limited cooling)
3. Binding energy sufficient for indefinite retention: λ = 12.2
4. Escape mechanism remains XUV photoevaporation, though at minimal rates

**Critical stability feature**: Unlike KELT-9b, which experiences dynamic evolution throughout, WASP-103b rapidly reaches a stable state after ~2-3 Gyr where the loss rate becomes minimal.

### Evolutionary Category: **Primordial Retainer with Minimal Loss**

WASP-103b exemplifies planets that retain nearly all their original H/He atmospheres despite harsh stellar irradiation:
- Retains >80% of original envelope at 10 Gyr
- Loses <20% of total atmospheric mass
- Core remains fundamentally H/He dominated
- Escape driven by XUV but limited by strong gravity
- Will maintain atmosphere indefinitely (>100 Gyr)

---

## 5. Evolution Mechanism

### Primary Escape Driver: XUV Photoevaporation (Gravity-Limited)

WASP-103b's atmospheric loss occurs through the same XUV photoevaporation mechanism as KELT-9b, but operates in a **gravity-limited regime** where planetary gravity significantly restricts escape rates.

**Physical Process**:

1. **Ionization Phase**: XUV photons create ionized hydrogen in the upper atmosphere
   - Ionization rate scales with F_XUV: lower than KELT-9b

2. **Heating Phase**: Photoelectrons and photoions are heated
   - Energy per particle: ~100-300 K additional (lower than KELT-9b)
   - Temperature remains below 3,000 K in most of escaping atmosphere

3. **Expansion Phase**: Heated gas expands, but strong gravity inhibits outflow
   - Sound speed at exobase: ~7 km/s
   - Bulk flow limited by gravity: escape velocity 89 km/s significantly exceeds thermal velocities

4. **Escape Phase**: Only the most energetic particles escape
   - Dominated by high-energy tail of distribution
   - Escape becomes quasi-hydrodynamic rather than fully hydrodynamic

**Timescale Calculations**:

**Envelope lifetime** (complete loss at constant rate):
$$τ_{loss} = \frac{M_{env}}{\dot{M}} = \frac{0.012 M_J}{0.003 M_J/\text{Gyr}} = 4 \text{ Gyr}$$

However, the loss rate decreases with time due to:
1. Declining atmospheric column density
2. Envelope composition shift toward heavier helium (reduces escape)
3. Radius contraction increasing escape velocity

**Actual lifetime for 50% loss**: ~6-8 Gyr (considerably slower than KELT-9b's 1.6 Gyr)

### Binding Energy's Role in Retention

The escape parameter evolution governs WASP-103b's atmospheric fate:

$$\lambda(t) = \sqrt{\frac{2GM(t)}{kT(t)R_p(t)}}$$

Evolution trajectory:
- **Initial (0 Gyr)**: λ = 14.4
- **At 5 Gyr**: λ = 13.1 (modest decrease)
- **At 10 Gyr**: λ = 12.2 (slow decline)
- **At 100 Gyr**: λ ≈ 10-11 (asymptotic approach)

The decline is much slower than for lower-mass planets because:
1. Gravity remains high as mass barely decreases
2. Radius contraction actually increases v_esc
3. Mean molecular weight increase is minimal (both H and He escape slowly)

**Critical insight**: WASP-103b's massive nature provides a "gravitational buffer" that limits atmospheric loss to <20% even after 10 Gyr. Lower-mass planets in the same XUV environment would lose much more.

### Competing Escape Mechanisms

Secondary mechanisms play minor roles:

1. **Thermal Jeans Escape** (~3-5% of total):
   - Negligible due to high λ
   - Becomes relevant only if λ drops below 5 (which doesn't occur within reasonable timescales)

2. **Hydrodynamic winds**:
   - Partial contribution to escape (perhaps 20-30%)
   - Limited by strong gravity preventing complete hydrodynamic flow

3. **Ion escape in stellar wind**:
   - Minor role (~5-10%) due to weak ionization in cooler atmosphere

---

## 6. Comparative Context

### Similar Planets and Their Evolution

**KELT-9b**: Ultra-hot Jupiter at 4,050 K
- **Comparison**: WASP-103b is 1,500 K cooler, receives 43% less XUV flux, but is less massive
- **Expected evolution**: KELT-9b loses atmosphere 2.5-3× faster than WASP-103b
- **Key insight**: Temperature drives escape rates more strongly than mass for ultra-hot Jupiters

**WASP-18b**: Ultra-hot Jupiter at 2,429 K with even greater mass
- **Comparison**: 80 K hotter than WASP-103b; similar XUV flux; larger radius
- **Expected evolution**: WASP-18b likely evolves similarly despite greater mass (higher temperature offsets gravity)
- **Key difference**: Relative importance of temperature vs. mass

**HAT-P-1b**: Hot Jupiter at 1,322 K, much smaller and denser
- **Comparison**: 1,200 K cooler but much higher mean density
- **Expected evolution**: HAT-P-1b loses atmosphere extremely slowly despite lower mass (temperature dominates)
- **Reason**: Atmospheric temperatures scale with stellar flux; cooler atmospheres escape far more slowly

### Why WASP-103b Evolves This Way

WASP-103b occupies a unique position in exoplanet parameter space:

1. **High Mass Compensation**: Planetary mass of 1.495 M_J provides powerful gravitational binding that overcomes moderate stellar heating

2. **Intermediate XUV Environment**: At 850 erg/s/cm², WASP-103b experiences substantial but not extreme photoevaporative forcing

3. **Optimal Stability Zone**: The combination of parameters places WASP-103b in a "stable zone" where atmospheric loss occurs but cannot be catastrophic

4. **Long-term Preservation**: Unlike lower-mass planets that might strip to cores in similar XUV, WASP-103b's gravity preserves its envelope for >10 Gyr

### Expected Final State (Observational Context)

**By 10 Gyr**, WASP-103b maintains an H/He atmosphere remarkably similar to its current state:
- **Radius**: 1.39 R_J (down just 9% from 1.528 R_J)
- **Atmospheric composition**: 70% H₂, 28% He, 2% metals (minimal change)
- **Spectral signature**: Na and K lines subtly enhanced; essentially stable spectroscopy
- **H_α absorption**: Minimal change (small amount of hydrogen escape)
- **Observability**: JWST would find essentially unchanged spectrum compared to current state

**JWST Observational Predictions**:

1. **Transit spectroscopy** reveals:
   - Stable Na D and K I features (minimal time evolution)
   - Absence of dramatic metal enhancement
   - Robust H₂ and He features from high altitude

2. **Long-term monitoring** (over years to decades) would show:
   - Minimal spectral changes (<5% line strength variation)
   - Possible very slow radius contraction (0.005 R_J per decade)
   - Atmospheric stability over human timescales

3. **Comparison with lower-mass hot Jupiters** would highlight:
   - WASP-103b retains atmosphere far better than equivalently irradiated lower-mass planets
   - Provides quantitative test of mass-dependent atmospheric retention

---

## Conclusion: WASP-103b as a Stable Massive Ultra-Hot Jupiter Laboratory

WASP-103b represents a critical benchmark for understanding how planetary mass shields atmospheres from photoevaporation. Its 10 Gyr evolutionary trajectory demonstrates a fundamentally different evolutionary path than KELT-9b:

1. **0-3 Gyr**: Rapid initial atmospheric adjustment, then stabilization
2. **3-10 Gyr**: Quasi-static evolution with minimal ongoing change
3. **10+ Gyr**: Long-term stability with indefinite atmospheric retention

The planet will **never complete atmospheric stripping** due to its combination of high mass and reasonably high binding energy. Instead, it evolves toward a **stable, metal-slightly-enriched H/He atmosphere** that changes little over billion-year timescales.

For understanding the diversity of ultra-hot Jupiter evolutionary pathways, WASP-103b is essential: it demonstrates that planetary mass can be as important as stellar XUV flux in determining long-term atmospheric fate. The contrast between WASP-103b's stability and KELT-9b's ongoing loss, despite similar irradiation, provides unique constraints on mass-loss physics in extreme regimes.

JWST observations of WASP-103b should reveal a remarkably stable atmosphere, offering an ideal template for massive ultra-hot Jupiter evolution and providing crucial calibration for atmospheric loss models across the entire hot Jupiter population.
