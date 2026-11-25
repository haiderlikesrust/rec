import { getLength, getPointAtLength } from "@remotion/paths";

type Sampled = { length: number; step: number; xs: Float32Array; ys: Float32Array };
const cache = new Map<string, Sampled>();

/** A path sampled once every few pixels, so thousands of point lookups per frame stay cheap. */
export function sampled(d: string): Sampled {
  const hit = cache.get(d);
  if (hit) return hit;
  const length = getLength(d);
  const count = Math.max(2, Math.ceil(length / 3) + 1);
  const step = length / (count - 1);
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = getPointAtLength(d, Math.min(length, i * step)) ?? { x: 0, y: 0 };
    xs[i] = p.x;
    ys[i] = p.y;
  }
  const made = { length, step, xs, ys };
  cache.set(d, made);
  return made;
}

/** The point `at` pixels along the path. */
export function pointAtLength(d: string, at: number) {
  const s = sampled(d);
  const f = Math.min(s.xs.length - 1, Math.max(0, at / s.step));
  const i = Math.min(s.xs.length - 2, Math.floor(f));
  const t = f - i;
  return { x: s.xs[i]! + (s.xs[i + 1]! - s.xs[i]!) * t, y: s.ys[i]! + (s.ys[i + 1]! - s.ys[i]!) * t };
}

/** The point a fraction `t` (0…1) of the way along the path. */
export const pointAt = (d: string, t: number) => pointAtLength(d, sampled(d).length * Math.min(1, Math.max(0, t)));

export const lengthOf = (d: string) => sampled(d).length;
