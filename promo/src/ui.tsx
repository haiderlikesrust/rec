import { evolvePath } from "@remotion/paths";
import React, { type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { logo } from "./data";
import { lengthOf, pointAtLength } from "./paths";
import { alpha, c, cardRadius, floatShadow, type } from "./theme";
import { clamp01, ease, prog, springAt } from "./timing";
import { boards, type BoardName, type Pt } from "./world";

// ------------------------------------------------------------------ placement

/** A scene's origin in the world: children are positioned relative to the board's centre. */
export const Board: React.FC<{ name: BoardName; children: ReactNode }> = ({ name, children }) => (
  <div style={{ position: "absolute", left: boards[name].x, top: boards[name].y, width: 0, height: 0 }}>{children}</div>
);

/** A box at a point. `anchor` says which part of the box sits on the point. */
export const At: React.FC<{ x: number; y: number; anchor?: "tl" | "center" | "left" | "top" | "right"; style?: CSSProperties; children: ReactNode }> = ({
  x,
  y,
  anchor = "tl",
  style,
  children,
}) => {
  const shift = anchor === "center" ? "translate(-50%, -50%)" : anchor === "left" ? "translate(0, -50%)" : anchor === "top" ? "translate(-50%, 0)" : anchor === "right" ? "translate(-100%, -50%)" : "";
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: shift, whiteSpace: "nowrap", ...style }}>
      {children}
    </div>
  );
};

/** An SVG that draws straight in the coordinates of whatever it sits in, and never clips. */
export const Ink: React.FC<{ children: ReactNode; style?: CSSProperties }> = ({ children, style }) => (
  <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", ...style }}>
    {children}
  </svg>
);

// ------------------------------------------------------------------ type in motion

type WordsProps = {
  text: string;
  /** frame the first word starts */
  at: number;
  /** frames between words */
  stagger?: number;
  size: number;
  color?: string;
  weight?: number;
  /** words (matched exactly, punctuation included) to set in another colour */
  tint?: Record<string, string>;
  /** frame at which the line leaves; omit to keep it */
  out?: number;
  style?: CSSProperties;
};

/** A line that arrives word by word: each word rises, sharpens and settles. */
export const Words: React.FC<WordsProps> = ({ text, at, stagger = 3, size, color = c.ink, weight = 600, tint, out, style }) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  const leave = out === undefined ? 0 : prog(frame, out, out + 12, ease.inOut);
  return (
    <div style={{ ...type.headline, fontSize: size, fontWeight: weight, color, whiteSpace: "nowrap", ...style }}>
      {words.map((word, i) => {
        const p = springAt(frame, at + i * stagger, "snap");
        const o = clamp01(p * 1.5) * (1 - leave);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: i < words.length - 1 ? "0.25em" : 0,
              opacity: o,
              color: tint?.[word],
              transform: `translateY(${(1 - p) * 0.55 - leave * 0.25}em)`,
              filter: o < 0.999 ? `blur(${((1 - p) * 0.1 + leave * 0.08) * size}px)` : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** The same arrival, letter by letter (the wordmark). */
export const Letters: React.FC<{ text: string; at: number; stagger?: number; size: number; color?: string; style?: CSSProperties }> = ({ text, at, stagger = 2, size, color = c.ink, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ ...type.headline, fontSize: size, color, whiteSpace: "nowrap", letterSpacing: "-0.035em", lineHeight: 1, ...style }}>
      {[...text].map((ch, i) => {
        const p = springAt(frame, at + i * stagger, "snap");
        const o = clamp01(p * 1.5);
        return (
          <span key={i} style={{ display: "inline-block", opacity: o, transform: `translateY(${(1 - p) * 0.4}em)`, filter: o < 0.999 ? `blur(${(1 - p) * 0.07 * size}px)` : undefined }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** Something that fades and rises into place. */
export const Rise: React.FC<{ at: number; by?: number; kind?: "soft" | "pop" | "snap"; out?: number; style?: CSSProperties; children: ReactNode }> = ({ at, by = 36, kind = "snap", out, style, children }) => {
  const frame = useCurrentFrame();
  const p = springAt(frame, at, kind);
  const leave = out === undefined ? 0 : prog(frame, out, out + 10);
  const o = clamp01(p * 1.4) * (1 - leave);
  return <div style={{ opacity: o, transform: `translateY(${(1 - p) * by}px) scale(${0.94 + 0.06 * Math.min(p, 1.2)})`, ...style }}>{children}</div>;
};

/** A number that counts from one value to another. */
export const useCount = (from: number, to: number, start: number, end: number) => {
  const frame = useCurrentFrame();
  return from + (to - from) * prog(frame, start, end, ease.out);
};

// ------------------------------------------------------------------ surfaces

/** A card as on the site: a soft fill one step up from the page, a barely visible edge, round corners. */
export const Card: React.FC<{ width?: number; height?: number; style?: CSSProperties; glow?: string; children: ReactNode }> = ({ width, height, style, glow, children }) => (
  <div
    style={{
      width,
      height,
      boxSizing: "border-box",
      background: `linear-gradient(180deg, ${alpha("#FFFFFF", 0.035)}, ${alpha("#FFFFFF", 0)} 42%), ${c.panel}`,
      border: `1.5px solid ${c.rule}`,
      borderRadius: cardRadius,
      boxShadow: glow ? `${floatShadow}, 0 0 90px -18px ${glow}` : floatShadow,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Pill: React.FC<{ tone?: string; style?: CSSProperties; children: ReactNode }> = ({ tone, style, children }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      height: 78,
      padding: "0 30px",
      borderRadius: 999,
      background: tone ? `linear-gradient(${alpha(tone, 0.14)}, ${alpha(tone, 0.14)}), ${c.raise}` : c.raise,
      border: `1.5px solid ${tone ? alpha(tone, 0.34) : c.rule}`,
      ...type.body,
      fontSize: type.small,
      color: tone ?? c.ink,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Dot: React.FC<{ color: string; size?: number }> = ({ color, size = 18 }) => (
  <span style={{ display: "inline-block", width: size, height: size, borderRadius: 999, background: color, boxShadow: `0 0 18px ${alpha(color, 0.7)}`, flex: "none" }} />
);

// ------------------------------------------------------------------ the mark

/** The logo, drawn stroke by stroke: the frame, then the brace, then the service arm. */
export const Mark: React.FC<{ size: number; at: number; color?: string; duration?: number; glow?: boolean }> = ({ size, at, color = c.ink, duration = 26, glow = true }) => {
  const frame = useCurrentFrame();
  const starts = [0, 0.28, 0.56];
  const spans = [0.7, 0.55, 0.44];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${logo.viewBox} ${logo.viewBox}`} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible", flex: "none", filter: glow ? `drop-shadow(0 0 ${size * 0.09}px ${alpha(c.signal, 0.45)})` : undefined }}>
      {logo.paths.map((p, i) => {
        const t = prog(frame, at + duration * starts[i % 3]!, at + duration * (starts[i % 3]! + spans[i % 3]!), ease.inOut);
        if (t <= 0) return null;
        const e = evolvePath(t, p.d);
        return <path key={i} d={p.d} strokeWidth={p.strokeWidth} strokeDasharray={e.strokeDasharray} strokeDashoffset={e.strokeDashoffset} />;
      })}
    </svg>
  );
};

// ------------------------------------------------------------------ streams

type StreamProps = {
  d: string;
  color: string;
  /** colour at the start of the path, when it changes along the way */
  from?: string;
  width: number;
  /** 0…1: how much of the path has been reached */
  reveal: number;
  /** 0…1: how much of the start has run dry */
  drain?: number;
  /** pixels the droplets move per frame */
  speed?: number;
  gap?: number;
  id: string;
  dim?: number;
};

/**
 * A stream of fees: a soft glowing line with bright droplets running along it. It grows from its start as `reveal`
 * goes up, so the eye can follow the head of it.
 */
export const Stream: React.FC<StreamProps> = ({ d, color, from, width, reveal, drain = 0, speed = 7, gap = 34, id, dim = 1 }) => {
  const frame = useCurrentFrame();
  if (reveal <= 0 || drain >= 1) return null;
  const length = lengthOf(d);
  const head = length * reveal;
  const tail = length * drain;
  const shown = Math.max(0, head - tail);
  const dash = { strokeDasharray: `${shown} ${length + 10}`, strokeDashoffset: -tail };
  const a = pointAtLength(d, 0);
  const b = pointAtLength(d, length);
  const stroke = from ? `url(#${id})` : color;
  const count = Math.ceil(length / gap);
  const drops: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const at = (i * gap + frame * speed) % (count * gap);
    if (at > head - 4 || at < tail + 2 || at > length) continue;
    const p = pointAtLength(d, at);
    const edge = Math.min(1, (head - at) / 40, (at - tail) / 24);
    const big = i % 3 === 0 ? 1 : 0.62;
    drops.push(<circle key={i} cx={p.x} cy={p.y} r={width * 0.52 * big} fill="#FFFFFF" opacity={0.85 * edge * dim} />);
  }
  const tip = pointAtLength(d, head);
  return (
    <g>
      {from ? (
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
            <stop offset="0" stopColor={from} />
            <stop offset="0.75" stopColor={color} />
          </linearGradient>
        </defs>
      ) : null}
      <path d={d} fill="none" stroke={stroke} strokeWidth={width * 3.4} strokeLinecap="round" opacity={0.22 * dim} style={{ filter: `blur(${width * 1.5}px)` }} {...dash} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" opacity={0.78 * dim} {...dash} />
      <g style={{ mixBlendMode: "screen" }}>{drops}</g>
      {reveal < 1 ? <circle cx={tip.x} cy={tip.y} r={width * 1.25} fill="#FFFFFF" opacity={0.9 * dim} style={{ filter: `blur(${width * 0.35}px)` }} /> : null}
    </g>
  );
};

// ------------------------------------------------------------------ motion blur

/**
 * Blurs its children along the direction they are moving. The layer is turned so the motion runs along x, blurred
 * on x only, and turned back: a directional blur out of a plain Gaussian. The wrappers stay mounted at rest (with
 * no filter), so a 3D canvas inside is never torn down.
 */
export const MotionBlur: React.FC<{ id: string; velocity: Pt; strength?: number; children: ReactNode }> = ({ id, velocity, strength = 0.13, children }) => {
  const speed = Math.hypot(velocity.x, velocity.y);
  const sigma = Math.min(34, speed * strength);
  const on = sigma > 0.8;
  const angle = on ? (Math.atan2(velocity.y, velocity.x) * 180) / Math.PI : 0;
  return (
    <AbsoluteFill style={{ transform: on ? `rotate(${angle}deg)` : undefined }}>
      {on ? (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <defs>
            <filter id={id} x="-25%" y="-65%" width="150%" height="230%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={`${sigma} 0`} />
            </filter>
          </defs>
        </svg>
      ) : null}
      <AbsoluteFill style={{ filter: on ? `url(#${id})` : undefined }}>
        <AbsoluteFill style={{ transform: on ? `rotate(${-angle}deg)` : undefined }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
