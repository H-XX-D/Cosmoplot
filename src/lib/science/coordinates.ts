import type { Vector3Pc } from "@/lib/science/types";

export const DISPLAY_LOG_SCALE = 28;

export function equatorialToCartesianPc(raDeg: number, decDeg: number, distancePc: number): Vector3Pc {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;

  return {
    x: Math.cos(dec) * Math.cos(ra) * distancePc,
    y: Math.sin(dec) * distancePc,
    z: Math.cos(dec) * Math.sin(ra) * distancePc,
  };
}

export function cartesianDistance(vec: Vector3Pc) {
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
}

export function logScaledVector(vec: Vector3Pc) {
  const length = cartesianDistance(vec);
  if (length <= 1e-9) return { x: 0, y: 0, z: 0 };
  const scaled = Math.log10(1 + length) * DISPLAY_LOG_SCALE;
  return {
    x: (vec.x / length) * scaled,
    y: (vec.y / length) * scaled,
    z: (vec.z / length) * scaled,
  };
}
