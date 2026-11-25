import { loadFont } from "@remotion/google-fonts/Figtree";

/** The site's soft dark palette (web/app/globals.css). */
export const c = {
  bg: "#0E0F12",
  panel: "#15161A",
  raise: "#1C1D22",
  rule: "rgba(255,255,255,0.07)",
  ruleStrong: "rgba(255,255,255,0.12)",
  ink: "#EDEEF0",
  ink2: "#A1A4AD",
  ink3: "#858892",
  inkInverse: "#0E0F12",
  signal: "#A7A9FF",
  gain: "#5DD39E",
  loss: "#F2777A",
  shield: "#6FD3E0",
  desk: "#B7A6FF",
  pearl: "#F3EEF9",
  pink: "#F3B2D8",
  peach: "#FFC9A4",
} as const;

/** "#rrggbb" as "rgba(r,g,b,a)". */
export const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const figtree = loadFont("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
export const fontFamily = figtree.fontFamily;

export const W = 1920;
export const H = 1080;
export const FPS = 30;

/** Shared text styles. Nothing on screen is set smaller than `small`. */
export const type = {
  headline: { fontFamily, fontWeight: 600, letterSpacing: "-0.032em", lineHeight: 1.04, color: c.ink },
  body: { fontFamily, fontWeight: 500, letterSpacing: "-0.012em", lineHeight: 1.2, color: c.ink2 },
  num: { fontFamily, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" as const, color: c.ink },
  small: 44,
} as const;

/** The site's one shadow, scaled up for film. */
export const floatShadow = "0 40px 110px -28px rgba(0,0,0,0.7), 0 4px 14px rgba(0,0,0,0.22)";
export const cardRadius = 28;
