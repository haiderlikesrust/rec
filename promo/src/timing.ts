import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./theme";

/**
 * The film's clock. The music bed is 120 BPM and enters one second in, so a beat is 15 frames and its downbeats
 * fall on the odd seconds: 1 s, 3 s, 5 s… Every scene starts on one, and the bed's own section changes
 * (film time 9 s, 17 s, 25 s) are the starts of the reserve scene, the catch and the end card.
 */
export const BEAT = 15;
export const MUSIC_IN = 30;

export const T = {
  open: 0,
  fee: 90,
  otc: 270,
  shield: 450,
  launch: 630,
  end: 750,
  total: 885,
} as const;

/** Moments inside the scenes that more than one layer needs (picture, coin, sound). */
export const cue = {
  // cold open
  sweep: 30,
  markDraw: 20,
  wordmark: 26,
  openLine: 36,
  // fee split
  feeHeadline: 104,
  streamStart: 116,
  streamSplit: 136,
  streamLands: 150,
  noneA: 180,
  noneB: 210,
  // OTC reserve
  pour: 280,
  otcHeadline: 290,
  cardIn: 306,
  sellPress: 348,
  solOut: 358,
  solIn: 390,
  // Heat Shield
  rise: 440,
  peak: 470,
  fall: 482,
  caught: 510,
  shieldHeadline: 518,
  tiers: 524,
  payoutPop: 542,
  payoutFly: 556,
  payoutLands: 570,
  // launch
  towerDraw: 628,
  dock: 650,
  barStart: 648,
  barEnd: 705,
  liftOff: 714,
  // end card
  orbsBack: 760,
  settle: 772,
  endMark: 766,
  endWordmark: 772,
  slogan: 788,
  domain: 804,
  disclaimer: 812,
} as const;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const ease = {
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** a whip: slow out of the hold, fast through the middle, soft landing */
  whip: Easing.bezier(0.76, 0, 0.2, 1),
  out: Easing.bezier(0.16, 1, 0.3, 1),
  outSoft: Easing.bezier(0.25, 0.8, 0.25, 1),
  in: Easing.bezier(0.6, 0, 0.9, 0.4),
} as const;

/** 0 before `from`, 1 after `to`, eased in between. */
export const prog = (frame: number, from: number, to: number, easing: (t: number) => number = ease.inOut) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** A spring that starts at `at`. `soft` has no overshoot, `pop` has a little. */
export const springAt = (frame: number, at: number, kind: "soft" | "pop" | "snap" = "soft") =>
  spring({
    frame: frame - at,
    fps: FPS,
    config:
      kind === "pop" ? { damping: 13, stiffness: 150, mass: 0.7 } : kind === "snap" ? { damping: 22, stiffness: 220, mass: 0.6 } : { damping: 200, stiffness: 120, mass: 0.9 },
  });

/** A bump that rises to 1 at `at` and falls back: `rise` frames up, `fall` frames down. */
export const pulse = (frame: number, at: number, rise = 4, fall = 18) => {
  if (frame <= at - rise || frame >= at + fall) return 0;
  return frame < at ? ease.out((frame - (at - rise)) / rise) : 1 - ease.inOut((frame - at) / fall);
};

/** Deterministic pseudo-random in [0, 1) from an integer seed. */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};
