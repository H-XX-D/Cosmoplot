#!/usr/bin/env python3

import io
import json
import math
import os
import sys
import urllib.request
from typing import Any

import numpy as np
from astropy.io import fits


WAVELENGTH_COLUMNS = (
    "WAVELENGTH",
    "WAVELENGTH_MEDIAN",
    "LAMBDA",
    "WAVE",
)
FLUX_COLUMNS = (
    "FLUX",
    "FLUXDENSITY",
    "FLUX_DENSITY",
    "SURF_BRIGHT",
    "SURF_BRIGHTNESS",
)
ERROR_COLUMNS = (
    "ERROR",
    "ERR",
    "FLUX_ERROR",
    "FLUXERR",
    "SIGMA",
    "UNCERTAINTY",
)
MAX_POINTS = 4096


def downsample(values: np.ndarray, max_points: int = MAX_POINTS) -> np.ndarray:
    if values.size <= max_points:
        return values
    indices = np.linspace(0, values.size - 1, max_points).astype(int)
    return values[indices]


def flatten_column(data: Any, column_name: str) -> np.ndarray:
    column = data[column_name]
    chunks: list[np.ndarray] = []

    for row in column:
        values = np.asarray(row, dtype=float).ravel()
        finite = values[np.isfinite(values)]
        if finite.size:
            chunks.append(finite)

    if not chunks:
        return np.array([], dtype=float)

    lengths = {chunk.size for chunk in chunks}
    if len(lengths) == 1 and len(chunks) > 1:
        stacked = np.vstack(chunks)
        return np.nanmedian(stacked, axis=0)

    return max(chunks, key=lambda chunk: chunk.size)


def pick_column(names: set[str], candidates: tuple[str, ...]) -> str | None:
    for candidate in candidates:
        if candidate in names:
            return candidate
    return None


def extract_series(hdul: fits.HDUList) -> dict[str, Any] | None:
    for hdu in hdul:
        columns = getattr(hdu, "columns", None)
        data = getattr(hdu, "data", None)
        if columns is None or data is None:
            continue

        names = {str(name).upper(): str(name) for name in columns.names or []}
        wavelength_key = pick_column(set(names), WAVELENGTH_COLUMNS)
        flux_key = pick_column(set(names), FLUX_COLUMNS)
        if not wavelength_key or not flux_key:
            continue

        wavelength = flatten_column(data, names[wavelength_key])
        flux = flatten_column(data, names[flux_key])
        if wavelength.size == 0 or flux.size == 0:
            continue

        size = min(wavelength.size, flux.size)
        wavelength = wavelength[:size]
        flux = flux[:size]

        error_key = pick_column(set(names), ERROR_COLUMNS)
        if error_key:
            uncertainty = flatten_column(data, names[error_key])[:size]
            if uncertainty.size != size:
                uncertainty = np.zeros(size, dtype=float)
        else:
            uncertainty = np.zeros(size, dtype=float)

        wavelength = downsample(wavelength)
        flux = downsample(flux, wavelength.size)
        uncertainty = downsample(uncertainty, wavelength.size)

        finite_mask = np.isfinite(wavelength) & np.isfinite(flux) & np.isfinite(uncertainty)
        wavelength = wavelength[finite_mask]
        flux = flux[finite_mask]
        uncertainty = uncertainty[finite_mask]
        if wavelength.size == 0 or flux.size == 0:
            continue

        return {
            "label": str(getattr(hdu, "name", "") or "JWST FITS spectrum"),
            "wavelengthUm": [float(value) for value in wavelength.tolist()],
            "values": [float(value) for value in flux.tolist()],
            "uncertainties": [float(value) for value in uncertainty.tolist()],
            "valueUnit": str(getattr(columns[flux_key], "unit", "") or "").strip() or None,
        }

    return None


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: extract_jwst_fits_spectrum.py <url>"}))
        return 1

    url = sys.argv[1]
    try:
        headers = {}
        mast_token = os.environ.get("MAST_API_TOKEN") or os.environ.get("MAST_TOKEN")
        if mast_token:
            headers["Authorization"] = f"token {mast_token}"
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
        with fits.open(io.BytesIO(payload), memmap=False) as hdul:
            series = extract_series(hdul)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 0

    print(json.dumps({"ok": bool(series), "series": series}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
