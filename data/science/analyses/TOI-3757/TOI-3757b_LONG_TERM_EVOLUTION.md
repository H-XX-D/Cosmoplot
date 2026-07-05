# TOI-3757b Long-Term Evolution Projection

## 1. Current State Summary

### Planetary Parameters and Classification

TOI-3757b is a Neptune-like with distinctive characteristics that shape its evolutionary trajectory. With a mean density of 0.580 g/cm³, it occupies a unique position in the density-temperature phase space of exoplanet atmospheres, directly influencing how stellar radiation impacts its long-term atmospheric stability.

**Fundamental Properties:**
- **Mass**: 0.268 M_J (equivalently 85.3 M_E)
- **Radius**: 1.070 R_J (12.00 R_E)
- **Mean Density**: ρ = 0.580 g/cm³
- **Equilibrium Temperature**: T_eq = 759 K
- **Orbital Period**: 3.55 days
- **Semi-major Axis**: a = 0.0384 AU
- **Host Star**: M0V dwarf (T_eff = 3913 K, L★ = 0.087 L☉)
- **Stellar XUV Flux**: F_XUV ≈ 95 erg/s/cm²
- **Atmospheric Scale Height**: H ≈ 2.3 km

### Current Atmospheric Characteristics

TOI-3757b's current atmosphere represents the primordial or evolved state depending on its age and history. The planet maintains a hydrogen-dominated envelope with trace heavier species that provide valuable spectroscopic signatures.

**Atmospheric Composition:**
- **Primary**: H₂/He (95-99% by mass)
- **Secondary**: Water vapor (H₂O), carbon monoxide (CO)
- **Trace**: Carbon dioxide (CO₂), methane (CH₄), sulfur-bearing species
- **Atmospheric Mass Fraction**: 0.50% of total planetary mass
- **Estimated Atmospheric Mass**: ≈ 0.0013 M_J

**Atmospheric Dynamics:**
- **Scale Height**: 2.3 km (determines transit spectroscopy depth)
- **Escape Status**: Actively eroding - significant atmospheric loss
- **Mach Number** (at exobase): 0.7-1.5 (controls flow regime)

### Atmospheric Escape Parameter (Jeans and energy-limited)

Atmospheric retention is set by the standard balance between gravitational binding and thermal / XUV-driven escape, i.e. how easily stellar XUV radiation can strip hydrogen from the atmosphere.

**Escape Parameter Calculations:**

Surface gravity at 1.070 R_J: g = 6.1 m/s²

Escape velocity: v_esc = √(2GM/R) = **30.13 km/s**

Thermal velocity at 759 K: v_th = √(3k_B T/m_H) = **4.338 km/s**

**Escape Parameter**: λ = v_esc / v_th = **6.9**

The physically meaningful thermal-escape diagnostic is the Jeans parameter lambda_J = (3/2)(v_esc/v_th)^2 = **72**. Jeans escape is negligible for lambda_J >~ 15 (thermally bound) and only becomes hydrodynamic blow-off for lambda_J <~ 2-3. Close-in giants therefore lose mass mainly through XUV-driven energy-limited escape, not thermal Jeans escape.

**Escape energy per H atom**: E_b = 1/2 m_H v_esc^2 = **4739 meV** (4.74 eV)

For comparison the mean thermal energy is E_th = 3k_B T = 196 meV, far below the escape energy, confirming the atmosphere is thermally bound.

TOI-3757b's Jeans escape parameter is lambda_J = (3/2)(v_esc/v_th)^2 = 72 (>> 15), so thermal (Jeans) escape is negligible and the planet retains its hydrogen envelope; any loss proceeds through XUV-driven energy-limited escape and is modest over Gyr timescales.

---

## 2. One Gigayear Evolution (0-1 Gyr)

### Atmospheric Loss Mechanisms

Over the first billion years, TOI-3757b experiences atmospheric erosion primarily through XUV photoevaporation. The dominant mechanism depends on the planet's balance between stellar heating and gravitational binding.

**XUV Photoevaporation Regime:**

The planet operates in a gravity-limited photoevaporation regime. In this regime:

1. **Ionization**: Stellar EUV photons (10-100 nm) ionize neutral hydrogen atoms
   - Ionization efficiency: ε ≈ 0.07 (dimensionless efficiency)
   - XUV flux received: F_XUV = 95 erg/s/cm²

2. **Heating**: Photoelectrons heat the upper atmosphere
   - Temperature boost: ΔT ≈ 35-105 K
   - Energy partition: Partial heating, partial escape

3. **Escape**: Hydrogen atoms with velocities exceeding v_esc evaporate
   - Escape rate depends on: Temperature, gravity, atmospheric density
   - Flow type: Hydrodynamic escape

**Mass Loss Rate Formula:**

$$\dot{M} = \epsilon \frac{F_{XUV}}{E_b} \times 4\pi R_p^2$$

Substituting values:
$$\dot{M} \approx 0.07 \times \frac{95 \times 6.24 \times 10^{11}}{4.7} \times 4\pi \times (1.07 R_J)^2$$

**Estimated Mass Loss Rate**: **0.08% of envelope per Gyr**

### 1 Gyr Evolution Results

After one billion years of evolution:

**Atmospheric Loss Summary:**
- Initial atmospheric mass: 0.0013 M_J
- Percentage lost: 0.08%
- Mass lost: 0.0000 M_J
- Remaining atmosphere: 0.0013 M_J (99.9% retained)

**Radius Evolution:**
- Initial radius: 1.070 R_J
- Radius contraction rate: 0.0000 R_J per Gyr
- Radius after 1 Gyr: 1.070 R_J
- Total contraction: 0.00%

**Compositional Changes:**
The atmospheric composition evolves as hydrogen preferentially escapes:
- H₂ abundance: 95% → 95.0% (hydrogen depletion)
- He abundance: 4% → 4.0% (relative enrichment)
- Metals: 1% → 1.0% (absolute increase from loss)

**Spectroscopic Observables at 1 Gyr:**
- Transit depth: Decreases by 0.0% (from radius contraction + composition change)
- Scale height: Remains approximately 2.3 km (temperature-dependent, not mass-dependent)
- Key features: H₂O, CO absorption bands show modest weakening

---

## 3. Five Gigayear Evolution (0-5 Gyr)

### Cumulative Atmospheric Loss Over 5 Billion Years

Over the longer timescale of 5 Gyr, the escape rate itself declines as the atmosphere loses mass and becomes more difficult to escape from.

**Total Atmospheric Loss by 5 Gyr:**
- Total hydrogen escaped: 0.4% of original envelope
- Remaining envelope: 99.6% of original mass

The escape rate declines over time because:
1. Smaller atmosphere has less total mass to lose (logarithmic decrease)
2. Lower atmospheric density reduces escape efficiency
3. Asymptotic approach to stable equilibrium

**Density Evolution:**
- Current density: 0.580 g/cm³
- Density at 5 Gyr: 0.580 g/cm³ (0.0% increase)
- Reason: Core remains; envelope shrinks → density increases

**Atmosphere-Star Coupling Evolution:**
The coupling between the planet's atmosphere and the star's radiation field evolves:
- Escape parameter now: λ ≈ 6.7 (slight decline from 6.9)
- Optical depth changes: Effective heating decreases with thinner atmosphere
- Thermal profile evolution: Upper atmosphere cools as density drops

**Comparative Evolution Milestones:**
- 1 Gyr: Loss of 0.08%
- 2 Gyr: Loss of 0.16% (cumulative, rate declining)
- 3 Gyr: Loss of 0.24%
- 5 Gyr: Loss of 0.40% (approaching asymptotic limit)

---

## 4. Ten Gigayear Evolution (0-10 Gyr)

### Final State After 10 Billion Years

At 10 billion years, TOI-3757b's atmosphere reaches an approximately equilibrial state. The escape rate becomes negligible and the atmosphere stabilizes.

**Total Cumulative Loss:**
- Total percentage lost: 0.8% of original envelope
- Remaining atmosphere: 99.2% of original mass
- Final atmospheric composition: H₂ (85%), He (13%), metals (2.0%)

**Planetary Evolution Summary:**
- Final radius: 1.070 R_J (down 0.0%)
- Final mass: 0.268 M_J (essentially unchanged)
- Final density: 0.580 g/cm³

**Escape Parameter Evolution:**
- 0 Gyr: λ = 6.9
- 5 Gyr: λ ≈ 6.7
- 10 Gyr: λ ≈ 6.5
- Asymptotic: λ → 6.3

TOI-3757b will **continue active atmospheric loss** beyond 10 Gyr.

### Evolutionary Category and Final Fate

TOI-3757b falls into the **Actively Eroding** evolutionary category.

This classification indicates:
1. **Atmospheric preservation**: 99%-100% of original H₂/He envelope retained
2. **Radius contraction**: 0.0%-0.0% shrinkage over 10 Gyr
3. **Spectroscopic evolution**: Subtle changes in transmission spectrum
4. **Long-term stability**: Will completely strip over ~10 Gyr

---

## 5. Evolution Mechanism: Energy-Limited Atmospheric Escape

### Physical Process: XUV Photoevaporation

The primary mechanism driving atmospheric loss is stellar XUV photoevaporation, which operates as follows:

**Stage 1: Photoionization**
Stellar EUV photons (10-100 nm wavelength) penetrate to the exobase region (~2-3 planetary radii) where neutral hydrogen atoms are abundant. These photons ionize hydrogen at a rate determined by:
- Stellar XUV flux: 95 erg/s/cm²
- Ionization cross-section: σ ≈ 10⁻¹⁷ cm² (XUV-dependent)
- Column density of neutral H: N_H ≈ 10¹⁸ cm⁻² (temperature/gravity-dependent)

**Stage 2: Photoelectron Heating**
Ionization leaves behind energetic photoelectrons that dissipate energy through collisions, heating the local atmosphere from ≈600 K to ≈1259 K. This heating causes thermal expansion.

**Stage 3: Hydrodynamic Expansion**
The heated atmosphere expands, creating a density gradient that drives outflow. The escape velocity 30.13 km/s competes with the thermal velocity 4.338 km/s. Since v_esc >> v_th (escape parameter 6.9), gravity weakly constrains the flow.

**Stage 4: Hydrogen Escape**
Hydrogen atoms with sufficient velocity escape to space, removing 0.08% of the atmospheric envelope per billion years. Heavier elements (He, metals) remain, creating relative composition changes.

### Why Binding Energy Controls Evolution

The binding energy E_b = 1/2 m_H v_esc^2 ≈ 4739 meV represents the gravitational potential well depth per hydrogen atom. This determines how much thermal energy is needed to escape:

**Energy Balance:**
- Thermal energy available: E_th = 3k_B T ≈ 196 meV
- Escape energy per H: E_b = 1/2 m_H v_esc^2 ≈ 4739 meV
- Ratio: E_th/E_b = 0.041 (<<1 strongly bound)

Lower binding energy (less dense planets) → faster evolution
Higher binding energy (denser planets) → slower evolution

---

## 6. Comparative Context

### Evolutionary Peers and Contrasts

**Density Comparison:**
- TOI-3757b: 0.580 g/cm³
- Jupiter: 1.33 g/cm³
- Saturn: 0.687 g/cm³
- Neptune: 1.64 g/cm³
- Earth: 5.52 g/cm³

TOI-3757b's density of 0.580 g/cm³ places it in the low-density category.

**Temperature Comparison:**
- TOI-3757b: 759 K
- Hot Jupiters (typical): 1200-1600 K
- Warm Neptunes: 700-1000 K
- Cool sub-Neptunes: 350-600 K
- Cold sub-Neptunes: <300 K

### Why TOI-3757b Evolves as Predicted

**Key Evolutionary Drivers:**

1. **Escape Parameter**: λ = 6.9
   - Controls atmospheric retention: Poor retention expected

2. **XUV Flux**: 95 erg/s/cm²
   - Determines ionization rate and heating intensity
   - Higher flux → faster loss (but gravity limits how much escapes)

3. **Temperature**: 759 K
   - Controls thermal velocity and expansion rate
   - Moderate T → moderate escape

4. **Density**: 0.580 g/cm³
   - Low density → moderate gravity → moderately vulnerable

### Expected Final State and Observational Consequences

**By 10 Gyr, TOI-3757b will exhibit:**

1. **Radius Change**: 1.070 R_J → 1.070 R_J (0.0% shrinkage)
   - Observable as gradually decreasing transit depth
   - Detectable with decades of monitoring

2. **Composition**: H₂ slightly depleted, He/metals relatively enriched
   - Spectroscopic signatures subtle in transmission spectrum

3. **Stability**: Continued moderate evolution expected

4. **Comparative Evolution**: TOI-3757b's evolution rate is among the slowest in its temperature class

---

## Conclusion

TOI-3757b represents a template for active atmospheric erosion among exoplanet atmospheres. Its 10 billion year trajectory demonstrates how the interplay between stellar heating (95 erg/s/cm²), planetary gravity (λ = 6.9), and initial mass (0.0013 M_J) determines long-term atmospheric fate.

**Key Takeaways:**

1. **Escape Parameter Dominance**: The escape parameter λ = 6.9 is the single best predictor of TOI-3757b's evolutionary path

2. **Asymptotic Stability**: After 5-10 Gyr, the escape rate becomes negligible, and the atmosphere stabilizes

3. **Density-Gravity Coupling**: TOI-3757b's density of 0.580 g/cm³ creates moderate gravitational retention

4. **Observable Evolution**: Subtle radius and composition changes expected over decade-timescales with precision spectroscopy

For exoplanet scientists, TOI-3757b provides a clear example of how vulnerable planets can be to atmospheric erosion. JWST observations over coming years will test these predictions and refine our understanding of long-term exoplanet evolution.
