import { pointAt } from "./paths";
import { H, W } from "./theme";
import { T, clamp01, cue, ease, lerp, prog, pulse } from "./timing";

/**
 * The film is one continuous move through a flat world. Each scene is a 1920×1080 "board" somewhere in that world;
 * a camera travels from board to board, and the coin, the fee streams and the parallax layers cross the gaps.
 * Everything here is a pure function of the frame, so any frame can be rendered on its own.
 */

export type Pt = { x: number; y: number };

/** Board centres, in world pixels. */
export const boards = {
  open: { x: 0, y: 0 },
  fee: { x: 0, y: 1150 },
  otc: { x: 2100, y: 1850 },
  shield: { x: 0, y: 2800 },
  launch: { x: 2200, y: 3100 },
  end: { x: 2932, y: 1700 },
} as const;
export type BoardName = keyof typeof boards;

/** Where things sit on their board, relative to its centre. Shared by the 2D layers and the 3D coin. */
export const L = {
  open: { coin: { x: 0, y: -150, r: 200 } },
  fee: {
    coin: { x: 290, y: -300, r: 115 },
    split: { x: 290, y: 40 },
    shield: { x: 20, y: 230 },
    reserve: { x: 560, y: 230 },
    raydium: { x: 506, y: -64 },
    orbR: 40,
  },
  otc: {
    vessel: { x: -560, y: 40, w: 280, h: 440 },
    card: { x: -160, y: -100, w: 900, h: 470 },
    coin: { x: 712, y: -96, r: 82 },
  },
  shield: {
    rise: "M-840,210 C-770,210 -748,128 -676,134 S-604,44 -542,28 S-474,62 -432,-36 S-356,-150 -300,-150",
    fall: "M-300,-150 C-236,-150 -214,-4 -150,36 S-66,44 -30,118 S14,186 40,215",
    peak: { x: -300, y: -150 },
    rest: { x: 40, y: 215 },
    coinR: 70,
    wallet: { x: 420, y: -70, w: 400, h: 236 },
  },
  launch: {
    tower: { x: 520, y: 20, size: 420 },
    coin: { x: 732, y: -39, r: 62 },
    bar: { x: -840, y: 116, w: 1060, h: 30 },
  },
  end: { coin: { x: 0, y: -226, r: 166 } },
} as const;

export const onBoard = (board: BoardName, p: Pt): Pt => ({ x: boards[board].x + p.x, y: boards[board].y + p.y });

// ------------------------------------------------------------------ camera

type Move = { to: BoardName; start: number; end: number };
const order: BoardName[] = ["open", "fee", "otc", "shield", "launch", "end"];
export const moves: Move[] = [
  { to: "fee", start: 88, end: 114 },
  { to: "otc", start: 256, end: 286 },
  { to: "shield", start: 436, end: 466 },
  { to: "launch", start: 612, end: 646 },
  { to: "end", start: 722, end: 772 },
];
/** How far the camera creeps during each hold (px), and how much it pushes in. */
const drift: Record<BoardName, { x: number; y: number; zoom: number }> = {
  open: { x: 0, y: 14, zoom: 0.05 },
  fee: { x: 12, y: 8, zoom: 0.035 },
  otc: { x: 14, y: 0, zoom: 0.035 },
  shield: { x: -10, y: 6, zoom: 0.035 },
  launch: { x: 8, y: -10, zoom: 0.03 },
  end: { x: 0, y: -8, zoom: 0.045 },
};

export type Camera = { x: number; y: number; zoom: number };

const hold = (i: number, frame: number): Camera => {
  const name = order[i]!;
  const start = i === 0 ? 0 : moves[i - 1]!.end;
  const end = i < moves.length ? moves[i]!.start : T.total;
  const p = clamp01((frame - start) / (end - start));
  const d = drift[name];
  return { x: boards[name].x + d.x * p, y: boards[name].y + d.y * p, zoom: 1 + d.zoom * p };
};

/** The beats that land get a small push-in, so the picture moves with the music. */
const hits = [cue.streamLands, cue.solIn, cue.caught, cue.payoutLands, cue.barEnd];
const bump = (frame: number) => hits.reduce((sum, at) => sum + pulse(frame, at, 2, 16), 0) * 0.012;

/** The camera at a frame: where in the world the centre of the screen is, and how far it is zoomed. */
export function camera(frame: number): Camera {
  const c = path(frame);
  return { x: c.x, y: c.y, zoom: c.zoom + bump(frame) };
}

function path(frame: number): Camera {
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]!;
    if (frame < m.start) return hold(i, frame);
    if (frame <= m.end) {
      const a = hold(i, m.start);
      const b = hold(i + 1, m.end);
      const p = (frame - m.start) / (m.end - m.start);
      const e = ease.whip(p);
      // the camera pulls back a little in the middle of a move, like a crane swinging round
      return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), zoom: lerp(a.zoom, b.zoom, e) - 0.07 * Math.sin(Math.PI * p) };
    }
  }
  return hold(moves.length, frame);
}

/** How far the camera moves over one frame, in screen pixels: drives the motion blur and the parallax streaks. */
export function cameraVelocity(frame: number): Pt {
  const a = camera(frame - 0.5);
  const b = camera(frame + 0.5);
  const z = (a.zoom + b.zoom) / 2;
  return { x: (b.x - a.x) * z, y: (b.y - a.y) * z };
}

export const toScreen = (cam: Camera, p: Pt): Pt => ({ x: (p.x - cam.x) * cam.zoom + W / 2, y: (p.y - cam.y) * cam.zoom + H / 2 });

/** CSS transform that places world coordinates on screen. */
export const worldTransform = (cam: Camera) => `translate(${W / 2 - cam.x * cam.zoom}px, ${H / 2 - cam.y * cam.zoom}px) scale(${cam.zoom})`;

// ------------------------------------------------------------------ the coin

export type CoinState = {
  /** centre in world pixels, and radius in world pixels */
  x: number;
  y: number;
  r: number;
  rotX: number;
  rotY: number;
  /** 0 = unlit (the cold open), 1 = fully lit */
  light: number;
  /** 1 = round; under 1 it is pressed flat for a moment (the catch) */
  squash: number;
  /** 0…1 while the engines are on (lift-off) */
  thrust: number;
};

const stops = {
  open: onBoard("open", L.open.coin),
  fee: onBoard("fee", L.fee.coin),
  otc: onBoard("otc", L.otc.coin),
  peak: onBoard("shield", L.shield.peak),
  rest: onBoard("shield", L.shield.rest),
  dock: onBoard("launch", L.launch.coin),
  end: onBoard("end", L.end.coin),
};
const radii = { open: L.open.coin.r, fee: L.fee.coin.r, otc: L.otc.coin.r, peak: L.shield.coinR, rest: L.shield.coinR, dock: L.launch.coin.r, end: L.end.coin.r };

/**
 * Flights between stops. `arc` bows the path sideways (px), so the coin swings round instead of sliding. Each flight
 * starts a few frames before the camera move it belongs to and ends a few after: the coin leads, the camera follows,
 * and the coin stays in frame (and fairly sharp) while the world streaks past behind it.
 */
export const flights = {
  toFee: { start: 82, end: 120, arc: 60 },
  toOtc: { start: 250, end: 294, arc: -120 },
  toPeak: { start: 430, end: cue.peak, arc: 150 },
  fall: { start: cue.fall, end: cue.caught },
  toDock: { start: 606, end: cue.dock, arc: -140 },
  lift: { start: cue.liftOff, end: 776 },
} as const;

const arcTo = (a: Pt, b: Pt, t: number, arc: number): Pt => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.sin(Math.PI * t) * arc;
  return { x: lerp(a.x, b.x, t) + (-dy / len) * bow, y: lerp(a.y, b.y, t) + (dx / len) * bow };
};

export function coin(frame: number): CoinState {
  const sec = frame / 30;
  let pos: Pt = stops.open;
  let r: number = radii.open;
  let spin = 0;
  let tumble = 0;
  let squash = 1;
  let thrust = 0;

  const fly = (f: { start: number; end: number; arc: number }, from: keyof typeof stops, to: keyof typeof stops) => {
    const t = prog(frame, f.start, f.end, ease.inOut);
    pos = arcTo(stops[from], stops[to], t, f.arc);
    r = lerp(radii[from], radii[to], t);
    spin = Math.PI * 2 * t;
  };

  if (frame < flights.toFee.start) {
    // the cold open: it comes up out of the dark, a little small and turned away
    const t = prog(frame, 0, 56, ease.out);
    pos = { x: stops.open.x, y: stops.open.y + (1 - t) * 70 };
    r = radii.open * lerp(0.7, 1, t);
    spin = (1 - t) * -1.35;
  } else if (frame < flights.toOtc.start) {
    fly(flights.toFee, "open", "fee");
  } else if (frame < flights.toPeak.start) {
    fly(flights.toOtc, "fee", "otc");
  } else if (frame < flights.fall.start) {
    fly(flights.toPeak, "otc", "peak");
  } else if (frame < flights.toDock.start) {
    // the price drops: the coin rides the tip of the line down, then lands in the shield and settles
    const t = prog(frame, flights.fall.start, flights.fall.end, ease.in);
    const p = pointAt(L.shield.fall, t);
    pos = onBoard("shield", p);
    r = radii.rest;
    tumble = Math.PI * 2 * t;
    const since = frame - flights.fall.end;
    if (since >= 0) {
      const ring = Math.exp(-since / 7) * Math.cos(since * 0.62);
      pos = { x: pos.x, y: pos.y + 15 * ring };
      squash = 1 - 0.1 * Math.exp(-since / 4.5) * Math.cos(since * 0.62);
    }
  } else if (frame < flights.lift.start) {
    fly(flights.toDock, "rest", "dock");
    // the engines light as the bar completes, a moment before it leaves
    thrust = prog(frame, cue.barEnd + 1, flights.lift.start) * 0.55;
  } else {
    // lift-off: a slow start, a long climb, a soft arrival above the end card
    const t = prog(frame, flights.lift.start, flights.lift.end, ease.whip);
    pos = { x: lerp(stops.dock.x, stops.end.x, t), y: lerp(stops.dock.y, stops.end.y, t) };
    r = lerp(radii.dock, radii.end, ease.inOut(clamp01((frame - flights.lift.start - 8) / (flights.lift.end - flights.lift.start - 8))));
    spin = Math.PI * 4 * t;
    thrust = (0.55 + 0.45 * prog(frame, flights.lift.start, flights.lift.start + 8)) * (1 - prog(frame, flights.lift.end - 24, flights.lift.end - 4));
  }

  // it never hangs still: a slow swing, a nod and a small bob
  const swing = Math.sin(sec * 0.85 + 0.5) * 0.5;
  const nod = Math.sin(sec * 0.62 + 1) * 0.1;
  const bob = Math.sin(sec * 1.7) * 6 * (r / 200) * (frame >= flights.fall.start && frame < flights.toDock.start ? 0.35 : 1);

  return {
    x: pos.x,
    y: pos.y + bob,
    r,
    rotX: nod + tumble,
    rotY: swing + spin,
    light: prog(frame, 3, 44, ease.inOut),
    squash,
    thrust,
  };
}

/** The coin's movement over one frame, in screen pixels. */
export function coinVelocity(frame: number): Pt {
  const a = toScreen(camera(frame - 0.5), coin(frame - 0.5));
  const b = toScreen(camera(frame + 0.5), coin(frame + 0.5));
  return { x: b.x - a.x, y: b.y - a.y };
}

/** Which boards are worth drawing at a frame: a board is on from just before the camera leaves for it until it has gone. */
export function boardLive(name: BoardName, frame: number) {
  const i = order.indexOf(name);
  const from = i === 0 ? 0 : moves[i - 1]!.start - 2;
  const until = i < moves.length ? moves[i]!.end + 2 : T.total;
  return frame >= from && frame <= until;
}
