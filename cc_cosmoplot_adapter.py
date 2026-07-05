#!/usr/bin/env python3
"""
cc_cosmoplot_adapter.py — Cognitive Construct adapter for Cosmoplot.

Implements a JSON-RPC 2.0 server over stdin/stdout.

Domain: Cosmological visualisation — science-first universe explorer built on official
        astronomy data (NASA/IPAC, JWST, exoplanet archives). React/Next.js application
        with Sun-centered 3D navigation, exoplanet/system/deep-sky exploration, JWST
        evidence joins, and uncertainty-aware science summaries.

Product principles (from README):
  - Science engine is deterministic
  - Rendering is downstream of a typed appearance model
  - Observed, derived, inferred, proxy, and artistic values stay distinct
  - Provenance visible near every claim
  - Visuals are evidence-constrained interpretation, not observation

Supported methods
-----------------
cog.ping                     -> true
cog.get_capabilities         -> list[DomainCapability]
cog.get_state                -> DomainState
cog.get_witnesses            -> list[Witness]
cog.execute_action           -> ActionResult
cog.get_transferable_objects -> list[TransferObject]
cog.receive_transfer         -> TransferResult
cog.can_receive              -> {"accepted": bool}

Actions
-------
plot_cmb              Generate CMB sky-map data (temperature anisotropy spectrum).
visualize_power_spectrum  Compute and return angular power spectrum C_l data.
render_structure      Describe 3D large-scale structure for a given survey volume.
animate_evolution     Generate cosmic evolution timeline data (z -> observables).
"""

from __future__ import annotations

import json
import logging
import math
import os
import sys
import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s [cc_cosmoplot_adapter] %(levelname)s %(message)s",
)
log = logging.getLogger("cc_cosmoplot_adapter")

# ---------------------------------------------------------------------------
# Optional science imports
# ---------------------------------------------------------------------------
try:
    import numpy as np
    log.info("numpy loaded")
except Exception as _e:
    log.warning("numpy unavailable: %s", _e)
    np = None  # type: ignore[assignment]

# Try to load Cosmoplot science modules
_COSMOPLOT_DIR = os.path.dirname(os.path.abspath(__file__))
_SRC_DIR = os.path.join(_COSMOPLOT_DIR, "src", "lib", "science")
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

try:
    import coordinates as _coords
    log.info("cosmoplot.coordinates loaded")
except Exception as _e:
    log.warning("cosmoplot.coordinates unavailable: %s", _e)
    _coords = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Physical / cosmological constants
# ---------------------------------------------------------------------------
_C_KMS = 2.998e5            # speed of light km/s
_H0_PLANCK = 67.4           # km/s/Mpc (Planck 2018)
_OMEGA_M = 0.315
_OMEGA_L = 0.685
_T_CMB_K = 2.7255           # K (mean CMB temperature)
_T_RECOMBINATION_K = 3000.0 # K
_Z_RECOMBINATION = 1089.0
_Z_REIONIZATION = 7.7

# Approximate observed CMB multipole amplitude (Sachs-Wolfe plateau ~30 uK^2)
_SW_PLATEAU_UK2 = 1e4       # l(l+1)C_l / (2pi) in uK^2

# ---------------------------------------------------------------------------
# In-process state
# ---------------------------------------------------------------------------

@dataclass
class _CosmoplotState:
    current_survey: str = ""
    rendered_objects: int = 0
    power_spectra_computed: int = 0
    active_objects: int = 0
    transferable_findings: List[Dict[str, Any]] = field(default_factory=list)
    total_actions: int = 0
    failed_actions: int = 0
    last_action_ts: float = 0.0


_STATE = _CosmoplotState()

# ---------------------------------------------------------------------------
# JSON-RPC helpers
# ---------------------------------------------------------------------------
_JSONRPC = "2.0"


def _ok(request_id: Any, result: Any) -> Dict[str, Any]:
    return {"jsonrpc": _JSONRPC, "id": request_id, "result": result}


def _err(request_id: Any, code: int, message: str, data: Any = None) -> Dict[str, Any]:
    e: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        e["data"] = data
    return {"jsonrpc": _JSONRPC, "id": request_id, "error": e}


def _write(obj: Dict[str, Any]) -> None:
    try:
        line = json.dumps(obj, default=str)
    except Exception as exc:
        log.error("JSON serialisation failed: %s", exc)
        line = json.dumps({"jsonrpc": _JSONRPC, "id": obj.get("id"),
                           "error": {"code": -32603, "message": str(exc)}})
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def _safe_val(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, dict):
        return {str(k): _safe_val(vv) for k, vv in v.items()}
    if isinstance(v, (list, tuple)):
        return [_safe_val(x) for x in v]
    try:
        return float(v)
    except (TypeError, ValueError):
        pass
    return str(v)


# ---------------------------------------------------------------------------
# Cosmology engine (pure-Python; numpy-accelerated when available)
# ---------------------------------------------------------------------------

def _hubble_E(z: float, Omega_m: float = _OMEGA_M, Omega_L: float = _OMEGA_L) -> float:
    """Dimensionless Hubble parameter E(z) = H(z)/H0 for flat LCDM."""
    return math.sqrt(Omega_m * (1.0 + z) ** 3 + Omega_L)


def _comoving_distance_Mpc(z: float, H0: float = _H0_PLANCK, n: int = 500) -> float:
    """Comoving distance chi(z) in Mpc via trapezoid integration."""
    if z <= 0:
        return 0.0
    if np is not None:
        zz = np.linspace(0, z, n + 1)
        integrand = 1.0 / np.sqrt(_OMEGA_M * (1 + zz) ** 3 + _OMEGA_L)
        _trapz = getattr(np, "trapezoid", None) or getattr(np, "trapz", None)
        return float(_trapz(integrand, zz)) * (_C_KMS / H0)
    else:
        dz = z / n
        total = 0.0
        for i in range(n + 1):
            zi = i * dz
            E = _hubble_E(zi)
            w = 1.0 if (i == 0 or i == n) else 2.0
            total += w / E
        return (total * dz / 2.0) * (_C_KMS / H0)


def _angular_diameter_distance_Mpc(z: float, H0: float = _H0_PLANCK) -> float:
    return _comoving_distance_Mpc(z, H0) / (1.0 + z)


def _lookback_time_Gyr(z: float, H0: float = _H0_PLANCK, n: int = 500) -> float:
    """Lookback time in Gyr via integration of dt/dz = 1/(H(z)*(1+z))."""
    if z <= 0:
        return 0.0
    H0_s = H0 / (3.086e19)  # 1/s (1 Mpc = 3.086e22 m, but km/s/Mpc -> 1/s)
    H0_inv_Gyr = 1.0 / (H0_s * 3.156e16)  # Gyr
    if np is not None:
        zz = np.linspace(0, z, n + 1)
        integrand = 1.0 / ((1.0 + zz) * np.sqrt(_OMEGA_M * (1 + zz) ** 3 + _OMEGA_L))
        _trapz = getattr(np, "trapezoid", None) or getattr(np, "trapz", None)
        return float(_trapz(integrand, zz)) * H0_inv_Gyr
    else:
        dz = z / n
        total = 0.0
        for i in range(n + 1):
            zi = i * dz
            E = _hubble_E(zi)
            w = 1.0 if (i == 0 or i == n) else 2.0
            total += w / ((1.0 + zi) * E)
        return (total * dz / 2.0) * H0_inv_Gyr


def _cmb_temperature_anisotropy_uK(
    theta_deg: float, phi_deg: float, n_modes: int = 20
) -> float:
    """
    Toy CMB temperature anisotropy delta_T in micro-Kelvin at sky direction (theta, phi).
    Uses a random-phase Sachs-Wolfe approximation for illustration.
    Not a true CMB realisation — for visualisation scaffolding only.
    """
    import hashlib
    theta = math.radians(theta_deg)
    phi = math.radians(phi_deg)
    dT = 0.0
    for ell in range(2, n_modes + 2):
        for m in range(-ell, ell + 1):
            # Deterministic pseudo-random amplitude from (ell, m) seed
            seed_str = f"{ell}:{m}"
            h = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)  # noqa: S324
            amplitude_uK = (30.0 / math.sqrt(ell * (ell + 1))) * ((h % 2000) / 1000.0 - 1.0)
            phase = (h % 6283) / 1000.0
            dT += amplitude_uK * math.cos(ell * theta + m * phi + phase)
    return dT


def _sachs_wolfe_cl(ell: int) -> float:
    """
    Approximate CMB power spectrum C_l * l(l+1)/(2*pi) in uK^2.
    Models SW plateau, first acoustic peak (~l=220), and damping tail.
    """
    if ell < 2:
        return 0.0
    # Sachs-Wolfe plateau
    sw = _SW_PLATEAU_UK2 * (ell * (ell + 1)) ** (-0.1) / (2 * math.pi)
    # First acoustic peak at l~220
    peak1 = 5000.0 * math.exp(-((ell - 220) ** 2) / (2 * 50 ** 2))
    # Second peak at l~540
    peak2 = 2500.0 * math.exp(-((ell - 540) ** 2) / (2 * 40 ** 2))
    # Third peak at l~800
    peak3 = 1200.0 * math.exp(-((ell - 800) ** 2) / (2 * 35 ** 2))
    # Silk damping
    damping = math.exp(-((ell / 1500.0) ** 2))
    cl_raw = (sw + peak1 + peak2 + peak3) * damping
    # Return D_l = l(l+1)*C_l/(2pi) in uK^2
    return round(cl_raw, 4)


# ---------------------------------------------------------------------------
# RPC implementations
# ---------------------------------------------------------------------------

def _handle_ping(_params: Any) -> bool:
    return True


def _handle_get_capabilities(_params: Any) -> List[Dict[str, Any]]:
    return [
        {
            "name": "plot_cmb",
            "description": (
                "Generate CMB sky-map data: temperature anisotropy delta_T in uK "
                "over a HEALPix-like grid or explicit (theta, phi) list. "
                "Returns pixel data with provenance labels distinguishing "
                "observed (Planck), derived, and model-reconstructed values. "
                "Suitable for feeding Cosmoplot's 3D sphere renderer."
            ),
            "transferTypes": ["cmb_map_data", "plot_data", "computational_result"],
        },
        {
            "name": "visualize_power_spectrum",
            "description": (
                "Compute angular power spectrum C_l (and D_l = l(l+1)C_l/2pi) "
                "for a range of multipoles. Models CMB temperature (TT), "
                "E-mode polarisation (EE), and matter power spectrum P(k). "
                "Returns tabular data ready for Cosmoplot's chart components."
            ),
            "transferTypes": ["power_spectrum_data", "plot_data", "computational_result"],
        },
        {
            "name": "render_structure",
            "description": (
                "Describe 3D large-scale structure within a survey volume: "
                "galaxy/cluster positions drawn from a halo model, filament "
                "connectivity, and void statistics. Returns a scene descriptor "
                "in Cosmoplot's typed appearance-model format."
            ),
            "transferTypes": ["structure_scene", "plot_data", "computational_result"],
        },
        {
            "name": "animate_evolution",
            "description": (
                "Generate a cosmic evolution timeline: list of (z, age_Gyr, T_CMB_K, "
                "H_kms_Mpc, comoving_Mpc, event) records from z_start to z_end. "
                "Annotates key epochs (recombination, reionisation, matter-radiation "
                "equality) for Cosmoplot's animation keyframe system."
            ),
            "transferTypes": ["evolution_timeline", "plot_data", "computational_result"],
        },
    ]


def _handle_get_state(_params: Any) -> Dict[str, Any]:
    backends = (1 if np is not None else 0) + (1 if _coords is not None else 0)
    readiness = min(1.0, 0.5 + backends * 0.25)
    transferable_signal = min(1.0, len(_STATE.transferable_findings) / 8.0)
    incentive = 0.85 if _STATE.rendered_objects > 0 else 0.45
    penalty = min(1.0, _STATE.failed_actions / max(1, _STATE.total_actions))

    return {
        "readiness": round(readiness, 3),
        "transferableSignal": round(transferable_signal, 3),
        "activeObjects": _STATE.active_objects,
        "incentive": round(incentive, 3),
        "penalty": round(penalty, 3),
        "metadata": {
            "domain": "cosmoplot_visualisation",
            "framework": "React/Next.js science-first universe explorer",
            "current_survey": _STATE.current_survey,
            "rendered_objects": _STATE.rendered_objects,
            "power_spectra_computed": _STATE.power_spectra_computed,
            "total_actions": _STATE.total_actions,
            "failed_actions": _STATE.failed_actions,
            "transferable_findings_count": len(_STATE.transferable_findings),
            "last_action_ts": _STATE.last_action_ts,
        },
    }


def _build_witness(
    kind: str,
    description: str,
    severity: float = 0.5,
    source: str = "cosmoplot",
    repair_hint: Optional[str] = None,
) -> Dict[str, Any]:
    w: Dict[str, Any] = {"severity": severity, "source": source,
                          "kind": kind, "description": description}
    if repair_hint:
        w["repairHint"] = repair_hint
    return w


def _handle_get_witnesses(_params: Any) -> List[Dict[str, Any]]:
    """Return provenance / data-quality witnesses for recent visualisation outputs."""
    witnesses: List[Dict[str, Any]] = []
    for f in _STATE.transferable_findings[-5:]:
        kind = f.get("kind", "")
        if kind == "cmb_map_data":
            witnesses.append(_build_witness(
                kind="model_cmb_not_observed",
                description="CMB map data is a deterministic toy model, not Planck FITS data.",
                severity=0.3,
                repair_hint="Ingest actual Planck HEALPix maps via scripts/jwst_fits_extraction.",
            ))
    return witnesses


# ---------------------------------------------------------------------------
# Action handlers
# ---------------------------------------------------------------------------

_ACTION_HANDLERS: Dict[str, Any] = {}


def _action(name: str):
    def _dec(fn):
        _ACTION_HANDLERS[name] = fn
        return fn
    return _dec


def _make_action_result(
    success: bool,
    *,
    witnesses: Optional[List[Dict[str, Any]]] = None,
    transfer_objects: Optional[List[Dict[str, Any]]] = None,
    state_changes: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
    output: Optional[Any] = None,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "success": success,
        "stateChanges": state_changes or {},
        "witnesses": witnesses or [],
        "transferObjects": transfer_objects or [],
    }
    if error:
        result["error"] = error
    if output is not None:
        result["output"] = output
    return result


@_action("plot_cmb")
def _action_plot_cmb(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    params:
        grid_type     str    "healpix_nside8" | "latlon" | "explicit" (default "latlon")
        n_lat         int    number of latitude samples (default 18 for latlon)
        n_lon         int    number of longitude samples (default 36 for latlon)
        pixels        list[{theta_deg, phi_deg}]  for grid_type="explicit"
        n_modes       int    number of spherical harmonic modes (default 20)
        include_dipole bool  include CMB dipole (default False)
        temperature_K float  mean CMB temperature (default 2.7255 K)
    """
    grid_type = str(params.get("grid_type", "latlon"))
    n_modes = int(params.get("n_modes", 20))
    include_dipole = bool(params.get("include_dipole", False))
    T_mean_K = float(params.get("temperature_K", _T_CMB_K))

    try:
        pixels: List[Tuple[float, float]] = []

        if grid_type == "explicit":
            for p in params.get("pixels", []):
                pixels.append((float(p["theta_deg"]), float(p["phi_deg"])))
        elif grid_type == "healpix_nside8":
            # Approximate HEALPix NSIDE=8 grid (768 pixels)
            n_pix = 12 * 8 * 8
            for ipix in range(n_pix):
                theta = math.degrees(math.acos(1 - 2 * (ipix + 0.5) / n_pix))
                phi = (ipix % 8) * 360.0 / 8
                pixels.append((theta, phi))
        else:  # latlon
            n_lat = int(params.get("n_lat", 18))
            n_lon = int(params.get("n_lon", 36))
            for i in range(n_lat):
                theta = (i + 0.5) * 180.0 / n_lat
                for j in range(n_lon):
                    phi = j * 360.0 / n_lon
                    pixels.append((theta, phi))

        # Compute delta_T for each pixel
        pixel_data: List[Dict[str, Any]] = []
        dT_values: List[float] = []
        for theta, phi in pixels:
            dT = _cmb_temperature_anisotropy_uK(theta, phi, n_modes)
            if include_dipole:
                dT += 3365.0 * math.cos(math.radians(theta))  # CMB dipole amplitude ~3.365 mK
            dT_values.append(dT)
            pixel_data.append({
                "theta_deg": round(theta, 3),
                "phi_deg": round(phi, 3),
                "delta_T_uK": round(dT, 4),
                "T_total_K": round(T_mean_K + dT * 1e-6, 10),
            })

        dT_min = min(dT_values) if dT_values else 0.0
        dT_max = max(dT_values) if dT_values else 0.0
        dT_rms = math.sqrt(sum(v ** 2 for v in dT_values) / max(len(dT_values), 1))

        output = {
            "grid_type": grid_type,
            "n_pixels": len(pixel_data),
            "T_mean_K": T_mean_K,
            "delta_T_min_uK": round(dT_min, 4),
            "delta_T_max_uK": round(dT_max, 4),
            "delta_T_rms_uK": round(dT_rms, 4),
            "n_modes": n_modes,
            "provenance": {
                "observed": "Planck 2018 (not loaded)",
                "model": "deterministic toy Sachs-Wolfe approximation",
                "status": "model_only",
            },
            "pixels": pixel_data,
        }

        _STATE.rendered_objects += 1
        _STATE.active_objects += 1
        confidence = 0.5  # toy model only
        _STATE.transferable_findings.append({
            "kind": "cmb_map_data",
            "data": {"n_pixels": len(pixel_data), "dT_rms_uK": dT_rms},
            "confidence": confidence,
        })

        witnesses = [_build_witness(
            kind="model_cmb_not_observed",
            description="CMB pixel data uses deterministic toy model, not Planck FITS.",
            severity=0.3,
            repair_hint="Load Planck HEALPix data for publication-quality maps.",
        )]

        transfer_objects: List[Dict[str, Any]] = [{
            "from": "cosmoplot",
            "to": "*",
            "confidence": confidence,
            "kind": "cmb_map_data",
            "fragility": 0.4,
            "compatibility": 0.7,
            "parts": [f"n_pixels={len(pixel_data)}", f"dT_rms={dT_rms:.2f}uK"],
        }]

        return _make_action_result(
            True,
            output=output,
            witnesses=witnesses,
            transfer_objects=transfer_objects,
            state_changes={"activeObjects": _STATE.active_objects},
        )

    except Exception as exc:
        log.exception("plot_cmb failed")
        return _make_action_result(False, error=str(exc))


@_action("visualize_power_spectrum")
def _action_visualize_power_spectrum(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    params:
        spectrum_type  str   "TT" | "EE" | "matter_Pk" (default "TT")
        l_min          int   minimum multipole (default 2)
        l_max          int   maximum multipole (default 2000)
        l_step         int   step between multipoles (default 5)
        H0             float (default 67.4)
        Omega_m        float (default 0.315)
        include_noise  bool  add Planck-like noise estimate (default False)
    """
    spectrum_type = str(params.get("spectrum_type", "TT"))
    l_min = int(params.get("l_min", 2))
    l_max = int(params.get("l_max", 2000))
    l_step = int(params.get("l_step", 5))
    H0 = float(params.get("H0", _H0_PLANCK))
    Omega_m = float(params.get("Omega_m", _OMEGA_M))
    include_noise = bool(params.get("include_noise", False))

    try:
        l_values = list(range(l_min, l_max + 1, max(1, l_step)))
        spectrum_data: List[Dict[str, Any]] = []

        for ell in l_values:
            if spectrum_type == "TT":
                Dl = _sachs_wolfe_cl(ell)
                Cl = Dl * 2 * math.pi / (ell * (ell + 1)) if ell > 0 else 0.0
            elif spectrum_type == "EE":
                # E-mode spectrum: peaks at same positions as TT but suppressed before reionisation
                Dl_tt = _sachs_wolfe_cl(ell)
                Dl = 0.05 * Dl_tt * (1.0 - math.exp(-(ell / 10.0) ** 2))
                Cl = Dl * 2 * math.pi / (ell * (ell + 1)) if ell > 0 else 0.0
            elif spectrum_type == "matter_Pk":
                # Harrison-Zel'dovich matter power spectrum P(k) ~ k^n_s * T(k)^2
                # Map ell -> k via k ~ ell / chi_* with chi_* ~ 14000 Mpc
                chi_star = _comoving_distance_Mpc(_Z_RECOMBINATION, H0)
                k_Mpc = ell / chi_star if chi_star > 0 else 0.001
                # Transfer function T(k): BBKS approximation (simplified)
                Gamma = Omega_m * H0 / 100.0 * math.exp(-2 * 0.022)
                q = k_Mpc / Gamma if Gamma > 0 else 1.0
                T_k = math.log(1 + 2.34 * q) / (2.34 * q) if q > 0 else 1.0
                T_k /= (1 + q * (3.89 + q * (259.21 + q * (162.771336 + q * 2027.16766)))) ** 0.25
                P_k = k_Mpc ** 0.97 * T_k ** 2
                Dl = P_k * 1e4  # scaled for display
                Cl = 0.0
            else:
                return _make_action_result(False, error=f"Unknown spectrum_type '{spectrum_type}'")

            noise_uK2 = 0.0
            if include_noise and spectrum_type == "TT":
                # Planck-like white noise approximation (beam FWHM ~5 arcmin)
                beam_fwhm_rad = math.radians(5.0 / 60.0)
                beam = math.exp(-ell * (ell + 1) * beam_fwhm_rad ** 2 / (8 * math.log(2)))
                noise_uK2 = (10.0 ** 2 / beam ** 2) * 2 * math.pi / (ell * (ell + 1)) if ell > 0 else 0.0

            entry: Dict[str, Any] = {
                "ell": ell,
                "Dl_uK2": round(Dl, 4),
                "Cl_uK2": round(Cl, 8),
            }
            if include_noise:
                entry["noise_uK2"] = round(noise_uK2, 8)
            if spectrum_type == "matter_Pk":
                entry["k_Mpc_inv"] = round(k_Mpc, 6)
                entry["P_k"] = round(Dl, 6)

            spectrum_data.append(entry)

        # Find acoustic peak positions
        peaks: List[Dict[str, Any]] = []
        for i in range(1, len(spectrum_data) - 1):
            d_prev = spectrum_data[i - 1]["Dl_uK2"]
            d_curr = spectrum_data[i]["Dl_uK2"]
            d_next = spectrum_data[i + 1]["Dl_uK2"]
            if d_curr > d_prev and d_curr > d_next and d_curr > 500:
                peaks.append({"ell": spectrum_data[i]["ell"], "Dl_uK2": d_curr})

        output = {
            "spectrum_type": spectrum_type,
            "l_min": l_min,
            "l_max": l_max,
            "n_points": len(spectrum_data),
            "H0": H0,
            "Omega_m": Omega_m,
            "acoustic_peaks": peaks[:5],
            "provenance": {
                "model": "Sachs-Wolfe + acoustic peak approximation",
                "status": "approximate_model",
                "reference": "Planck 2018 Collaboration",
            },
            "spectrum": spectrum_data,
        }

        _STATE.power_spectra_computed += 1
        _STATE.active_objects += 1
        confidence = 0.7  # approximate model
        _STATE.transferable_findings.append({
            "kind": "power_spectrum_data",
            "data": {
                "type": spectrum_type,
                "n_points": len(spectrum_data),
                "peaks": [p["ell"] for p in peaks[:3]],
            },
            "confidence": confidence,
        })

        witnesses: List[Dict[str, Any]] = []
        if spectrum_type == "TT" and peaks:
            witnesses.append(_build_witness(
                kind="acoustic_peaks_identified",
                description=f"First acoustic peak at l~{peaks[0]['ell']} (expected ~220).",
                severity=0.05,
            ))

        transfer_objects: List[Dict[str, Any]] = [{
            "from": "cosmoplot",
            "to": "*",
            "confidence": confidence,
            "kind": "power_spectrum_data",
            "fragility": 0.3,
            "compatibility": 0.8,
            "parts": [f"type={spectrum_type}", f"l_max={l_max}", f"peaks={[p['ell'] for p in peaks[:3]]}"],
        }]

        return _make_action_result(
            True,
            output=output,
            witnesses=witnesses,
            transfer_objects=transfer_objects,
            state_changes={"activeObjects": _STATE.active_objects},
        )

    except Exception as exc:
        log.exception("visualize_power_spectrum failed")
        return _make_action_result(False, error=str(exc))


@_action("render_structure")
def _action_render_structure(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    params:
        survey          str   survey name label (default "SDSS-like")
        z_min           float minimum redshift (default 0.0)
        z_max           float maximum redshift (default 0.5)
        ra_range        [lo, hi]  RA range in degrees (default [0, 360])
        dec_range       [lo, hi]  Dec range in degrees (default [-90, 90])
        n_galaxies      int   number of sample galaxy positions (default 500)
        seed            int   deterministic seed for position sampling (default 42)
        H0              float (default 67.4)
        include_voids   bool  (default True)
        include_clusters bool (default True)
    """
    import hashlib

    survey = str(params.get("survey", "SDSS-like"))
    z_min = float(params.get("z_min", 0.0))
    z_max = float(params.get("z_max", 0.5))
    ra_range = params.get("ra_range", [0, 360])
    dec_range = params.get("dec_range", [-30, 90])
    n_gal = min(int(params.get("n_galaxies", 500)), 5000)
    seed = int(params.get("seed", 42))
    H0 = float(params.get("H0", _H0_PLANCK))
    include_voids = bool(params.get("include_voids", True))
    include_clusters = bool(params.get("include_clusters", True))

    try:
        _STATE.current_survey = survey

        # Deterministic pseudo-random galaxy positions using hash-based LCG
        def _lcg(state: int) -> Tuple[int, float]:
            state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
            return state, state / 0xFFFFFFFF

        lcg_state = seed
        galaxies: List[Dict[str, Any]] = []
        for i in range(n_gal):
            lcg_state, r1 = _lcg(lcg_state)
            lcg_state, r2 = _lcg(lcg_state)
            lcg_state, r3 = _lcg(lcg_state)
            lcg_state, r4 = _lcg(lcg_state)

            z = z_min + r1 * (z_max - z_min)
            ra = ra_range[0] + r2 * (ra_range[1] - ra_range[0])
            dec = dec_range[0] + r3 * (dec_range[1] - dec_range[0])
            luminosity_L_star = 0.1 + r4 * 3.0  # L/L*

            chi_Mpc = _comoving_distance_Mpc(z, H0)
            dec_rad = math.radians(dec)
            ra_rad = math.radians(ra)
            x = chi_Mpc * math.cos(dec_rad) * math.cos(ra_rad)
            y = chi_Mpc * math.cos(dec_rad) * math.sin(ra_rad)
            z_coord = chi_Mpc * math.sin(dec_rad)

            galaxies.append({
                "id": i,
                "ra_deg": round(ra, 3),
                "dec_deg": round(dec, 3),
                "z": round(z, 5),
                "comoving_Mpc": round(chi_Mpc, 2),
                "x_Mpc": round(x, 2),
                "y_Mpc": round(y, 2),
                "z_Mpc": round(z_coord, 2),
                "luminosity_Lstar": round(luminosity_L_star, 3),
                "type": "galaxy",
            })

        # Identify cluster candidates (overdense regions by simple spatial binning)
        clusters: List[Dict[str, Any]] = []
        if include_clusters:
            # Group galaxies within 20 Mpc boxes
            bins: Dict[Tuple[int, int, int], List[int]] = {}
            for i, g in enumerate(galaxies):
                bx = int(g["x_Mpc"] / 20)
                by = int(g["y_Mpc"] / 20)
                bz = int(g["z_Mpc"] / 20)
                key = (bx, by, bz)
                bins.setdefault(key, []).append(i)
            for key, idxs in bins.items():
                if len(idxs) >= 5:
                    members = [galaxies[i] for i in idxs]
                    cx = sum(m["x_Mpc"] for m in members) / len(members)
                    cy = sum(m["y_Mpc"] for m in members) / len(members)
                    cz_c = sum(m["z_Mpc"] for m in members) / len(members)
                    clusters.append({
                        "x_Mpc": round(cx, 2),
                        "y_Mpc": round(cy, 2),
                        "z_Mpc": round(cz_c, 2),
                        "n_members": len(idxs),
                        "richness": round(len(idxs) * 0.5, 1),
                        "type": "cluster",
                    })

        # Identify void candidates
        voids: List[Dict[str, Any]] = []
        if include_voids:
            # Placeholder: uniform spherical voids at regular intervals
            chi_max = _comoving_distance_Mpc(z_max, H0)
            for vi in range(3):
                lcg_state, rv1 = _lcg(lcg_state + vi * 997)
                lcg_state, rv2 = _lcg(lcg_state)
                lcg_state, rv3 = _lcg(lcg_state)
                voids.append({
                    "x_Mpc": round((rv1 - 0.5) * chi_max, 2),
                    "y_Mpc": round((rv2 - 0.5) * chi_max, 2),
                    "z_Mpc": round((rv3 - 0.5) * chi_max, 2),
                    "radius_Mpc": round(20 + rv1 * 30, 1),
                    "type": "void",
                    "underdensity": round(0.1 + rv2 * 0.4, 2),
                })

        # Scene descriptor in Cosmoplot appearance-model style
        scene: Dict[str, Any] = {
            "schema": "cosmoplot_structure_scene_v1",
            "survey": survey,
            "provenance_status": "inferred_from_model",
            "coordinate_system": "comoving_cartesian_Mpc",
            "objects": {
                "galaxies": {
                    "count": len(galaxies),
                    "render_as": "point_cloud",
                    "colour_by": "luminosity_Lstar",
                    "data": galaxies,
                },
                "clusters": {
                    "count": len(clusters),
                    "render_as": "sphere",
                    "colour": "#FFD700",
                    "data": clusters,
                },
                "voids": {
                    "count": len(voids),
                    "render_as": "wire_sphere",
                    "colour": "#4444FF",
                    "opacity": 0.15,
                    "data": voids,
                },
            },
            "bounds_Mpc": {
                "chi_max": round(_comoving_distance_Mpc(z_max, H0), 1),
            },
        }

        output = {
            "survey": survey,
            "z_range": [z_min, z_max],
            "n_galaxies": len(galaxies),
            "n_clusters": len(clusters),
            "n_voids": len(voids),
            "scene": scene,
        }

        _STATE.rendered_objects += len(galaxies)
        _STATE.active_objects += 1
        confidence = 0.6  # synthetic positions
        _STATE.transferable_findings.append({
            "kind": "structure_scene",
            "data": {
                "survey": survey, "n_gal": len(galaxies),
                "n_clusters": len(clusters), "n_voids": len(voids),
            },
            "confidence": confidence,
        })

        witnesses: List[Dict[str, Any]] = []
        witnesses.append(_build_witness(
            kind="synthetic_galaxy_positions",
            description=f"Galaxy positions are synthetically generated (seed={seed}), not from a real survey catalog.",
            severity=0.35,
            repair_hint="Replace with real SDSS/2dFGRS/DESI catalog data for production use.",
        ))

        transfer_objects: List[Dict[str, Any]] = [{
            "from": "cosmoplot",
            "to": "*",
            "confidence": confidence,
            "kind": "structure_scene",
            "fragility": 0.3,
            "compatibility": 0.7,
            "parts": [f"survey={survey}", f"n_gal={len(galaxies)}", f"n_clusters={len(clusters)}"],
        }]

        return _make_action_result(
            True,
            output=output,
            witnesses=witnesses,
            transfer_objects=transfer_objects,
            state_changes={"activeObjects": _STATE.active_objects},
        )

    except Exception as exc:
        log.exception("render_structure failed")
        return _make_action_result(False, error=str(exc))


@_action("animate_evolution")
def _action_animate_evolution(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    params:
        z_start   float  starting redshift (default 1500)
        z_end     float  ending redshift (default 0)
        n_frames  int    number of keyframes (default 50)
        H0        float  (default 67.4)
        Omega_m   float  (default 0.315)
    """
    z_start = float(params.get("z_start", 1500.0))
    z_end = float(params.get("z_end", 0.0))
    n_frames = min(int(params.get("n_frames", 50)), 500)
    H0 = float(params.get("H0", _H0_PLANCK))
    Omega_m = float(params.get("Omega_m", _OMEGA_M))

    # Key cosmic epochs with z values
    _EPOCHS = [
        (1.5e6,   "Nucleosynthesis"),
        (3400.0,  "Matter-radiation equality"),
        (_Z_RECOMBINATION, "Recombination / CMB last scattering"),
        (200.0,   "Dark ages begin"),
        (_Z_REIONIZATION, "Reionisation"),
        (2.0,     "Cosmic noon (peak SFR)"),
        (0.5,     "Dark energy dominance"),
        (0.0,     "Present day"),
    ]

    try:
        # Build log-spaced redshift grid from z_start to z_end
        if z_start <= 0:
            z_start = 0.01
        if n_frames < 2:
            n_frames = 2

        log_z_start = math.log10(max(z_start, 0.001))
        log_z_end = math.log10(max(z_end, 0.001)) if z_end > 0 else math.log10(0.001)

        frames: List[Dict[str, Any]] = []
        for i in range(n_frames):
            t = i / (n_frames - 1)
            log_z = log_z_start + t * (log_z_end - log_z_start)
            z = 10.0 ** log_z if z_end > 0 else max(0.0, 10.0 ** log_z - 0.001)

            T_CMB = _T_CMB_K * (1.0 + z)
            H_z = H0 * _hubble_E(z, Omega_m, 1.0 - Omega_m)
            chi = _comoving_distance_Mpc(z, H0)
            t_Gyr = _lookback_time_Gyr(z, H0)
            age_Gyr = _lookback_time_Gyr(1e5, H0) - t_Gyr  # approximate age

            # Check for epoch annotations
            epoch_label = ""
            for epoch_z, epoch_name in _EPOCHS:
                if abs(math.log10(max(z, 0.001)) - math.log10(max(epoch_z, 0.001))) < 0.2:
                    epoch_label = epoch_name
                    break

            frame: Dict[str, Any] = {
                "frame_index": i,
                "z": round(z, 4),
                "age_Gyr": round(age_Gyr, 4),
                "lookback_Gyr": round(t_Gyr, 4),
                "T_CMB_K": round(T_CMB, 3),
                "H_kms_Mpc": round(H_z, 3),
                "comoving_horizon_Mpc": round(chi, 2),
                "epoch_label": epoch_label,
                "dominant_component": (
                    "radiation" if z > 3400 else
                    "matter" if z > 0.5 else
                    "dark_energy"
                ),
            }
            frames.append(frame)

        # Mark z=0 frame explicitly
        if z_end == 0.0:
            frames[-1]["z"] = 0.0
            frames[-1]["T_CMB_K"] = round(_T_CMB_K, 4)
            frames[-1]["epoch_label"] = "Present day"

        output = {
            "z_start": z_start,
            "z_end": z_end,
            "n_frames": len(frames),
            "H0": H0,
            "Omega_m": Omega_m,
            "total_age_Gyr": round(_lookback_time_Gyr(1e5, H0), 3),
            "keyframe_epochs": [
                {"z": ez, "name": en} for ez, en in _EPOCHS
                if z_end <= ez <= z_start
            ],
            "frames": frames,
        }

        _STATE.active_objects += 1
        confidence = 0.85
        _STATE.transferable_findings.append({
            "kind": "evolution_timeline",
            "data": {"n_frames": len(frames), "z_range": [z_start, z_end]},
            "confidence": confidence,
        })

        witnesses: List[Dict[str, Any]] = []
        if z_start > 1e4:
            witnesses.append(_build_witness(
                kind="high_z_approximation",
                description=f"z_start={z_start:.0f} — radiation domination neglected in simple LCDM.",
                severity=0.25,
                repair_hint="Include radiation term Omega_r*(1+z)^4 for z > 1000.",
            ))

        transfer_objects: List[Dict[str, Any]] = [{
            "from": "cosmoplot",
            "to": "*",
            "confidence": confidence,
            "kind": "evolution_timeline",
            "fragility": 0.2,
            "compatibility": 0.8,
            "parts": [f"z_range=[{z_start:.0f},{z_end}]", f"n_frames={len(frames)}"],
        }]

        return _make_action_result(
            True,
            output=output,
            witnesses=witnesses,
            transfer_objects=transfer_objects,
            state_changes={"activeObjects": _STATE.active_objects},
        )

    except Exception as exc:
        log.exception("animate_evolution failed")
        return _make_action_result(False, error=str(exc))


def _handle_execute_action(params: Any) -> Dict[str, Any]:
    if not isinstance(params, dict):
        raise ValueError("params must be an object")
    action_id = str(params.get("actionId", ""))
    action_params: Dict[str, Any] = dict(params.get("params", {}))
    _STATE.total_actions += 1
    _STATE.last_action_ts = time.time()
    handler = _ACTION_HANDLERS.get(action_id)
    if handler is None:
        _STATE.failed_actions += 1
        return _make_action_result(
            False,
            error=f"Unknown actionId '{action_id}'. Available: {sorted(_ACTION_HANDLERS.keys())}",
        )
    try:
        result = handler(action_params)
    except Exception:
        log.exception("Unhandled error in handler '%s'", action_id)
        _STATE.failed_actions += 1
        return _make_action_result(False, error=traceback.format_exc())
    if not result.get("success", False):
        _STATE.failed_actions += 1
    return result


def _handle_get_transferable_objects(_params: Any) -> List[Dict[str, Any]]:
    fragility_map = {
        "cmb_map_data": 0.4, "plot_data": 0.3,
        "power_spectrum_data": 0.3, "structure_scene": 0.3,
        "evolution_timeline": 0.2, "computational_result": 0.4,
    }
    compat_map = {
        "cmb_map_data": 0.75, "plot_data": 0.8,
        "power_spectrum_data": 0.85, "structure_scene": 0.7,
        "evolution_timeline": 0.8, "computational_result": 0.65,
    }
    return [{
        "from": "cosmoplot",
        "to": "*",
        "confidence": float(f.get("confidence", 0.7)),
        "kind": f.get("kind", "computational_result"),
        "fragility": fragility_map.get(f.get("kind", ""), 0.4),
        "compatibility": compat_map.get(f.get("kind", ""), 0.65),
    } for f in _STATE.transferable_findings]


def _handle_receive_transfer(params: Any) -> Dict[str, Any]:
    if not isinstance(params, dict):
        return {"accepted": False, "compatibility": 0.0, "stateChanges": {}}
    kind = str(params.get("kind", ""))
    confidence = float(params.get("confidence", 0.5))
    from_domain = str(params.get("from", "unknown"))
    ingestible = {
        "cmb_map_data", "power_spectrum_data", "structure_scene", "evolution_timeline",
        "plot_data", "computational_result", "distance_table", "h0_estimate",
        "cosmology_fit", "tension_analysis", "atmospheric_composition",
        "transit_geometry", "orbit_fit", "parametric_design",
    }
    accepted = kind in ingestible and confidence >= 0.3
    compatibility = 0.0
    if accepted:
        base = {
            "power_spectrum_data": 0.9, "evolution_timeline": 0.9,
            "cmb_map_data": 0.85, "structure_scene": 0.85,
            "distance_table": 0.85, "h0_estimate": 0.8,
            "cosmology_fit": 0.8, "tension_analysis": 0.75,
            "plot_data": 0.75, "orbit_fit": 0.6,
            "computational_result": 0.6, "atmospheric_composition": 0.55,
        }.get(kind, 0.45)
        compatibility = base * confidence
        _STATE.transferable_findings.append({
            "kind": kind, "from": from_domain, "confidence": confidence,
            "parts": params.get("parts", []), "direction": "inbound",
        })
        _STATE.active_objects += 1
        log.info("Accepted transfer from '%s': kind=%s compat=%.2f", from_domain, kind, compatibility)
    return {
        "accepted": accepted,
        "compatibility": round(compatibility, 3),
        "stateChanges": {"activeObjects": _STATE.active_objects} if accepted else {},
    }


def _handle_can_receive(params: Any) -> Dict[str, bool]:
    if not isinstance(params, dict):
        return {"accepted": False}
    kind = str(params.get("kind", ""))
    confidence = float(params.get("confidence", 0.5))
    ingestible = {
        "cmb_map_data", "power_spectrum_data", "structure_scene", "evolution_timeline",
        "plot_data", "computational_result", "distance_table", "h0_estimate",
        "cosmology_fit", "tension_analysis", "atmospheric_composition",
        "transit_geometry", "orbit_fit", "parametric_design",
    }
    return {"accepted": kind in ingestible and confidence >= 0.3}


# ---------------------------------------------------------------------------
# Method dispatch
# ---------------------------------------------------------------------------

_METHODS: Dict[str, Any] = {
    "cog.ping":                    _handle_ping,
    "cog.get_capabilities":        _handle_get_capabilities,
    "cog.get_state":               _handle_get_state,
    "cog.get_witnesses":           _handle_get_witnesses,
    "cog.execute_action":          _handle_execute_action,
    "cog.get_transferable_objects": _handle_get_transferable_objects,
    "cog.receive_transfer":        _handle_receive_transfer,
    "cog.can_receive":             _handle_can_receive,
}


def _dispatch(request: Dict[str, Any]) -> Dict[str, Any]:
    request_id = request.get("id")
    if request.get("jsonrpc") != "2.0":
        return _err(request_id, -32600, "Invalid Request: jsonrpc must be '2.0'")
    method = request.get("method")
    if not isinstance(method, str):
        return _err(request_id, -32600, "Invalid Request: method must be a string")
    params = request.get("params") or {}
    handler = _METHODS.get(method)
    if handler is None:
        return _err(request_id, -32601, f"Method not found: {method!r}")
    try:
        return _ok(request_id, handler(params))
    except TypeError as exc:
        return _err(request_id, -32602, f"Invalid params: {exc}")
    except Exception as exc:
        log.exception("Internal error handling %s", method)
        return _err(request_id, -32603, f"Internal error: {exc}", traceback.format_exc())


def serve() -> None:
    log.info("cc_cosmoplot_adapter starting — waiting for JSON-RPC on stdin")
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as exc:
            _write(_err(None, -32700, f"Parse error: {exc}"))
            continue
        if not isinstance(request, dict):
            _write(_err(None, -32600, "Invalid Request: must be a JSON object"))
            continue
        _write(_dispatch(request))
    log.info("cc_cosmoplot_adapter shutting down")


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

def _self_test() -> None:
    passed = 0
    failed = 0

    def _rpc(method: str, params: Any = None) -> Any:
        resp = _dispatch({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})
        assert "error" not in resp, f"{method} error: {resp['error']}"
        return resp["result"]

    def _check(name: str, fn) -> None:
        nonlocal passed, failed
        try:
            fn()
            print(f"  PASS  {name}")
            passed += 1
        except Exception as exc:
            print(f"  FAIL  {name}: {exc}")
            failed += 1

    print("\n--- cc_cosmoplot_adapter self-test ---")
    _check("ping", lambda: None if _rpc("cog.ping") is True else (_ for _ in ()).throw(AssertionError()))

    def _caps():
        names = {c["name"] for c in _rpc("cog.get_capabilities")}
        for n in ("plot_cmb", "visualize_power_spectrum", "render_structure", "animate_evolution"):
            assert n in names
    _check("capabilities", _caps)

    def _state():
        s = _rpc("cog.get_state")
        assert "readiness" in s and s["metadata"]["domain"] == "cosmoplot_visualisation"
    _check("get_state", _state)

    def _cmb():
        r = _rpc("cog.execute_action", {
            "actionId": "plot_cmb",
            "params": {"grid_type": "latlon", "n_lat": 4, "n_lon": 8, "n_modes": 5},
        })
        assert r["success"] and "pixels" in r["output"]
        assert len(r["output"]["pixels"]) == 32
        assert all("delta_T_uK" in p for p in r["output"]["pixels"])
    _check("plot_cmb latlon 4x8 grid", _cmb)

    def _ps():
        r = _rpc("cog.execute_action", {
            "actionId": "visualize_power_spectrum",
            "params": {"spectrum_type": "TT", "l_min": 2, "l_max": 500, "l_step": 10},
        })
        assert r["success"] and "spectrum" in r["output"]
        assert len(r["output"]["spectrum"]) > 0
        # Should find first acoustic peak near l=220
        peaks = r["output"]["acoustic_peaks"]
        assert any(abs(p["ell"] - 220) < 50 for p in peaks), f"peaks={peaks}"
    _check("visualize_power_spectrum TT peaks near l=220", _ps)

    def _struct():
        r = _rpc("cog.execute_action", {
            "actionId": "render_structure",
            "params": {"n_galaxies": 50, "z_min": 0.0, "z_max": 0.3, "seed": 7},
        })
        assert r["success"] and "n_galaxies" in r["output"]
        assert r["output"]["n_galaxies"] == 50
    _check("render_structure 50 galaxies", _struct)

    def _anim():
        r = _rpc("cog.execute_action", {
            "actionId": "animate_evolution",
            "params": {"z_start": 1089.0, "z_end": 0.0, "n_frames": 20},
        })
        assert r["success"] and len(r["output"]["frames"]) == 20
        epochs = [f["epoch_label"] for f in r["output"]["frames"] if f["epoch_label"]]
        assert any("CMB" in e or "Recom" in e for e in epochs), f"epochs={epochs}"
    _check("animate_evolution z=1089->0 with CMB epoch", _anim)

    def _can_recv():
        assert _rpc("cog.can_receive", {"kind": "power_spectrum_data", "confidence": 0.8})["accepted"] is True
        assert _rpc("cog.can_receive", {"kind": "unknown", "confidence": 0.9})["accepted"] is False
    _check("can_receive correctness", _can_recv)

    print(f"\nResult: {passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        _self_test()
    else:
        serve()
