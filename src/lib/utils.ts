import { clsx, type ClassValue } from "clsx";
import type { MeasurementBounds } from "@/lib/science/types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export type HslLike = {
  h: number;
  s: number;
  l: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function hsla(color: HslLike, alpha: number) {
  return `hsla(${color.h}, ${color.s}%, ${color.l}%, ${alpha})`;
}

export function measurementBounds(plus: number | null | undefined, minus: number | null | undefined): MeasurementBounds {
  return {
    plus: plus === null || plus === undefined ? null : plus,
    minus: minus === null || minus === undefined ? null : Math.abs(minus),
  };
}
