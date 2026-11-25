import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, interpolateColors, useCurrentFrame } from "remotion";
import { alpha, c, H, W } from "../theme";
import { T, cue, lerp, prog, pulse, rand } from "../timing";
import { camera, cameraVelocity, coin, toScreen } from "../world";

/*
 * Everything behind and in front of the scenes that gives the world depth: slow colour, dust at three distances
 * that slides past at different speeds as the camera moves, a soft shaft of light, a vignette and grain.
 */

/** The colour of the air, scene by scene: lavender, then the reserve's lilac, the shield's teal, and back. */
const tintAt = (frame: number) =>
  interpolateColors(
    frame,
    [0, T.fee, T.otc - 14, T.otc + 16, T.shield - 14, T.shield + 16, T.launch - 14, T.launch + 16, T.end, T.end + 40],
    [c.signal, c.signal, c.signal, c.desk, c.desk, c.shield, c.shield, c.signal, c.signal, "#C9A8F0"],
  );

type Speck = { x: number; y: number; size: number; a: number; hue: string; phase: number };
const palette = ["#FFFFFF", "#E7E2FF", c.signal, c.pink, c.shield, "#FFFFFF", c.peach, "#DAD6FF"];
const field = (count: number, seed: number, w: number, h: number, min: number, max: number): Speck[] =>
  Array.from({ length: count }, (_, i) => ({
    x: rand(seed + i * 3.1) * w,
    y: rand(seed + i * 7.7 + 1) * h,
    size: lerp(min, max, rand(seed + i * 1.3 + 2) ** 2),
    a: lerp(0.35, 1, rand(seed + i * 5.9 + 3)),
    hue: palette[Math.floor(rand(seed + i * 2.3 + 4) * palette.length)]!,
    phase: rand(seed + i * 9.1 + 5) * Math.PI * 2,
  }));

const TILE_W = 2700;
const TILE_H = 1800;
const far = field(170, 11, TILE_W, TILE_H, 2, 6);
const mid = field(64, 57, TILE_W, TILE_H, 6, 18);
const bokeh = field(18, 133, TILE_W, TILE_H, 34, 96);
const near = field(9, 91, TILE_W * 1.6, TILE_H * 1.6, 90, 240);

const wrap = (v: number, size: number) => ((v % size) + size) % size;

const Dust: React.FC<{ specks: Speck[]; parallax: number; opacity: number; blur: number; rise: number; tileW?: number; tileH?: number }> = ({ specks, parallax, opacity, blur, rise, tileW = TILE_W, tileH = TILE_H }) => {
  const frame = useCurrentFrame();
  const cam = camera(frame);
  const v = cameraVelocity(frame);
  const speed = Math.hypot(v.x, v.y) * parallax;
  const angle = (Math.atan2(v.y, v.x) * 180) / Math.PI;
  const stretch = Math.min(60, speed * 0.55);
  return (
    <AbsoluteFill style={{ opacity, filter: blur ? `blur(${blur}px)` : undefined }}>
      {specks.map((s, i) => {
        const x = wrap(s.x - cam.x * parallax + Math.sin(frame / 90 + s.phase) * 14, tileW) - (tileW - W) / 2;
        const y = wrap(s.y - cam.y * parallax - frame * rise * (0.5 + s.a), tileH) - (tileH - H) / 2;
        if (x < -300 || x > W + 300 || y < -300 || y > H + 300) return null;
        const twinkle = 0.62 + 0.38 * Math.sin(frame / 17 + s.phase * 3);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - s.size / 2 - stretch / 2,
              top: y - s.size / 2,
              width: s.size + stretch,
              height: s.size,
              borderRadius: 999,
              background: s.hue,
              opacity: s.a * twinkle * (stretch > 6 ? 0.7 : 1),
              transform: stretch > 1 ? `rotate(${angle}deg)` : undefined,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = camera(frame);
  const tint = tintAt(frame);
  const hero = toScreen(cam, coin(frame));
  const heroR = coin(frame).r * cam.zoom;
  const lit = prog(frame, 4, 46);
  // the room breathes on the hits
  const hit = 0.5 * pulse(frame, cue.sweep, 8, 40) + 0.6 * pulse(frame, cue.streamLands, 3, 30) + 0.6 * pulse(frame, cue.solIn, 3, 30) + 0.8 * pulse(frame, cue.caught, 2, 34) + 0.6 * pulse(frame, cue.payoutLands, 3, 30) + 0.9 * pulse(frame, cue.settle, 8, 50);
  const px = -cam.x * 0.22;
  const py = -cam.y * 0.22;
  return (
    <AbsoluteFill style={{ backgroundColor: c.bg, overflow: "hidden" }}>
      {/* the site's own glow: a wide soft light from above */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 62% 70% at 50% -8%, ${alpha(c.signal, 0.13 * lit)}, transparent 72%)` }} />
      {/* scene colour, hung in the far distance so it slides slowly */}
      <AbsoluteFill style={{ opacity: lit }}>
        <div style={{ position: "absolute", left: wrap(300 + px, 3200) - 900, top: wrap(160 + py, 2200) - 700, width: 1500, height: 1500, borderRadius: "50%", background: `radial-gradient(closest-side, ${tint}, transparent)`, opacity: 0.1 }} />
        <div style={{ position: "absolute", left: wrap(1900 + px, 3200) - 900, top: wrap(1250 + py, 2200) - 700, width: 1700, height: 1700, borderRadius: "50%", background: `radial-gradient(closest-side, ${c.pink}, transparent)`, opacity: 0.055 }} />
        <div style={{ position: "absolute", left: wrap(2700 + px, 3200) - 900, top: wrap(420 + py, 2200) - 700, width: 1300, height: 1300, borderRadius: "50%", background: `radial-gradient(closest-side, ${c.peach}, transparent)`, opacity: 0.04 }} />
      </AbsoluteFill>
      {/* a slow shaft of light */}
      <div
        style={{
          position: "absolute",
          left: -500 + Math.sin(frame / 140) * 120 + px * 0.4,
          top: -700,
          width: 620,
          height: 2600,
          transform: "rotate(-28deg)",
          transformOrigin: "50% 0",
          marginLeft: 1250,
          background: `linear-gradient(90deg, transparent, ${alpha("#FFFFFF", 0.055)} 45%, ${alpha("#C9C4FF", 0.04)} 62%, transparent)`,
          filter: "blur(50px)",
          opacity: lit * (0.8 + 0.2 * Math.sin(frame / 55)),
        }}
      />
      <Dust specks={far} parallax={0.1} opacity={0.5 * lit} blur={0.6} rise={0.1} />
      <Dust specks={mid} parallax={0.34} opacity={0.24 * lit} blur={3} rise={0.25} />
      <Dust specks={bokeh} parallax={0.62} opacity={0.085 * lit} blur={9} rise={0.32} />
      {/* the coin's own light on the air around it */}
      <div
        style={{
          position: "absolute",
          left: hero.x - heroR * 3.4,
          top: hero.y - heroR * 3.4,
          width: heroR * 6.8,
          height: heroR * 6.8,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, ${alpha("#B9A8FF", 0.3)}, ${alpha("#F3B2D8", 0.1)} 45%, transparent)`,
          opacity: lit * (0.62 + 0.3 * hit),
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 80% at 50% 50%, ${tint}, transparent 75%)`, opacity: 0.05 + 0.07 * hit }} />
    </AbsoluteFill>
  );
};

/** The coin's soft shadow on the sell card it hovers over: a little depth where 3D meets 2D. */
export const CoinShadow: React.FC = () => {
  const frame = useCurrentFrame();
  const on = prog(frame, cue.cardIn + 4, cue.cardIn + 18) * (1 - prog(frame, 426, 438));
  if (on <= 0) return null;
  const cam = camera(frame);
  const state = coin(frame);
  const p = toScreen(cam, state);
  const r = state.r * cam.zoom;
  return (
    <div
      style={{
        position: "absolute",
        left: p.x - r * 1.25 - r * 0.2,
        top: p.y - r * 0.75 + r * 0.42,
        width: r * 2.5,
        height: r * 2.1,
        borderRadius: "50%",
        background: "radial-gradient(closest-side, rgba(0,0,0,0.55), rgba(0,0,0,0.22) 60%, transparent)",
        filter: "blur(10px)",
        opacity: on,
      }}
    />
  );
};

/** A thin horizontal streak of light through the coin on the three moments it catches the light, like a lens would draw. */
export const Flare: React.FC = () => {
  const frame = useCurrentFrame();
  const open = Math.sin(Math.PI * prog(frame, 20, 52)) * 0.55;
  const caught = pulse(frame, cue.caught, 2, 18) * 0.6;
  const settle = pulse(frame, cue.settle, 6, 30) * 0.55;
  const power = Math.max(open, caught, settle);
  if (power <= 0.01) return null;
  const cam = camera(frame);
  const state = coin(frame);
  const p = toScreen(cam, state);
  const r = state.r * cam.zoom;
  const hue = caught > open && caught > settle ? c.shield : "#E9E2FF";
  const width = r * (5 + 4 * power);
  // during the open the streak rides the light across the coin
  const x = p.x + (open > 0 ? (prog(frame, 20, 52) - 0.5) * r * 1.2 : 0);
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen" }}>
      <div style={{ position: "absolute", left: x - width / 2, top: p.y - r * 0.2 - 2, width, height: 4, borderRadius: 9, background: `linear-gradient(90deg, transparent, ${hue} 35%, #FFFFFF 50%, ${hue} 65%, transparent)`, opacity: power, filter: "blur(1.6px)" }} />
      <div style={{ position: "absolute", left: x - width * 0.35, top: p.y - r * 0.2 - 30, width: width * 0.7, height: 60, borderRadius: "50%", background: `radial-gradient(closest-side, ${hue}, transparent)`, opacity: power * 0.35, filter: "blur(14px)" }} />
    </AbsoluteFill>
  );
};

const streaks = Array.from({ length: 16 }, (_, i) => ({
  x: rand(300 + i * 1.7) * (W + 900),
  y: rand(340 + i * 2.9) * (H + 600),
  length: 320 + rand(380 + i * 0.7) * 820,
  width: 2 + rand(420 + i * 1.1) * 4,
  a: 0.35 + 0.65 * rand(460 + i * 3.3),
  hue: palette[Math.floor(rand(500 + i * 4.1) * palette.length)]!,
}));

/** Thin streaks of light along the direction of travel, only while the camera is moving fast. */
export const SpeedLines: React.FC = () => {
  const frame = useCurrentFrame();
  const v = cameraVelocity(frame);
  const speed = Math.hypot(v.x, v.y);
  const k = Math.min(1, Math.max(0, (speed - 28) / 110));
  if (k <= 0) return null;
  const cam = camera(frame);
  const angle = (Math.atan2(v.y, v.x) * 180) / Math.PI;
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen" }}>
      {streaks.map((s, i) => {
        const x = wrap(s.x - cam.x * 0.8, W + 900) - 450;
        const y = wrap(s.y - cam.y * 0.8, H + 600) - 300;
        const length = s.length * (0.35 + 0.65 * k);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - length / 2,
              top: y,
              width: length,
              height: s.width,
              borderRadius: 99,
              background: `linear-gradient(90deg, transparent, ${s.hue}, transparent)`,
              opacity: s.a * k * 0.42,
              transform: `rotate(${angle}deg)`,
              filter: "blur(1.2px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Big soft discs close to the lens: they cross the frame fast when the camera moves, which sells the depth. */
export const Foreground: React.FC = () => {
  const frame = useCurrentFrame();
  return <Dust specks={near} parallax={1.55} opacity={0.085 * prog(frame, 10, 50)} blur={34} rise={0.4} tileW={TILE_W * 1.6} tileH={TILE_H * 1.6} />;
};

/** A tile of fine noise, made once: white or black specks whose strength follows a bell curve. */
let grainTile: HTMLCanvasElement | null = null;
const GRAIN = 512;
function grain() {
  if (grainTile) return grainTile;
  const tile = document.createElement("canvas");
  tile.width = tile.height = GRAIN;
  const ctx = tile.getContext("2d")!;
  const image = ctx.createImageData(GRAIN, GRAIN);
  let seed = 0x9e3779b9;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < GRAIN * GRAIN; i++) {
    const n = (next() + next() + next() + next() - 2) * 4.2;
    const v = n > 0 ? 255 : 0;
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = Math.min(255, Math.round(Math.abs(n)));
  }
  ctx.putImageData(image, 0, 0);
  grainTile = tile;
  return tile;
}

/**
 * The finish over the whole picture: a vignette, and film grain. The grain is painted onto a canvas in a layout
 * effect, so it is in place before the frame is captured, and it also keeps the dark gradients from banding.
 */
export const Finish: React.FC = () => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const ox = Math.floor(rand(frame * 1.7) * GRAIN);
    const oy = Math.floor(rand(frame * 3.1 + 9) * GRAIN);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, -ox, -oy);
    ctx.fillStyle = ctx.createPattern(grain(), "repeat")!;
    ctx.fillRect(0, 0, W + GRAIN, H + GRAIN);
  }, [frame]);
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 78% 78% at 50% 48%, transparent 52%, rgba(4,4,7,0.5) 100%)" }} />
      <canvas ref={ref} width={W} height={H} style={{ position: "absolute", left: 0, top: 0, width: W, height: H }} />
    </>
  );
};
