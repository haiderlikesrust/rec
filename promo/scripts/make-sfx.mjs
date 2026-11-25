// Synthesises the film's sound effects into public/sfx/*.wav. Everything is generated here from sine waves and
// filtered noise, so there is nothing to license. The chimes are tuned to the music bed (C sharp major pentatonic).
//   node scripts/make-sfx.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- helpers

let seed = 20261125;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => random() * 2 - 1;
const buffer = (seconds) => ({ l: new Float32Array(Math.ceil(seconds * SR)), r: new Float32Array(Math.ceil(seconds * SR)) });
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

/** A resonant two-pole filter whose centre and width can change every sample. */
function svf() {
  let low = 0;
  let band = 0;
  return (x, freq, q) => {
    const f = 2 * Math.sin((Math.PI * Math.min(freq, SR / 6.5)) / SR);
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    return { low, band, high };
  };
}

/** A small plate-like reverb: a few feedback combs into two all-passes, different on each side. */
function reverb(buf, { mix = 0.25, decay = 0.72, tail = 1.2 } = {}) {
  const n = buf.l.length + Math.ceil(tail * SR);
  const out = { l: new Float32Array(n), r: new Float32Array(n) };
  const run = (src, dst, combs, alls) => {
    const wet = new Float32Array(n);
    for (const ms of combs) {
      const d = Math.round((ms / 1000) * SR);
      const line = new Float32Array(d);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const y = line[i % d];
        lp = lp * 0.55 + y * 0.45;
        line[i % d] = (i < src.length ? src[i] : 0) + lp * decay;
        wet[i] += y / combs.length;
      }
    }
    for (const ms of alls) {
      const d = Math.round((ms / 1000) * SR);
      const line = new Float32Array(d);
      for (let i = 0; i < n; i++) {
        const delayed = line[i % d];
        const x = wet[i] + delayed * 0.5;
        line[i % d] = x;
        wet[i] = delayed - x * 0.5;
      }
    }
    for (let i = 0; i < n; i++) dst[i] = (i < src.length ? src[i] : 0) * (1 - mix * 0.4) + wet[i] * mix;
  };
  run(buf.l, out.l, [29.7, 37.1, 41.1, 43.7], [5.0, 1.7]);
  run(buf.r, out.r, [30.9, 36.3, 42.3, 44.9], [5.3, 1.9]);
  return out;
}

function fadeEdges(buf, inMs = 4, outMs = 60) {
  const a = Math.round((inMs / 1000) * SR);
  const b = Math.round((outMs / 1000) * SR);
  const n = buf.l.length;
  for (const ch of [buf.l, buf.r]) {
    for (let i = 0; i < a && i < n; i++) ch[i] *= i / a;
    for (let i = 0; i < b && i < n; i++) ch[n - 1 - i] *= i / b;
  }
  return buf;
}

function write(name, buf, peakDb = -3) {
  let peak = 0;
  for (const ch of [buf.l, buf.r]) for (const v of ch) peak = Math.max(peak, Math.abs(v));
  const gain = 10 ** (peakDb / 20) / (peak || 1);
  const n = buf.l.length;
  const data = Buffer.alloc(44 + n * 4);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + n * 4, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf.l[i] * gain)) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf.r[i] * gain)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(path.join(outDir, `${name}.wav`), data);
  console.log(`  ${name}.wav  ${(n / SR).toFixed(2)} s`);
}

// ---------------------------------------------------------------- the sounds

/** Air moving past: band-passed noise whose pitch rises and falls, panned across. `peakAt` is where it is loudest. */
function whoosh(name, { seconds = 0.95, peakAt = 0.5, lo = 260, hi = 2600, pan = 1, q = 0.9 }) {
  const buf = buffer(seconds);
  const fl = svf();
  const fr = svf();
  const n = buf.l.length;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const u = t < peakAt ? t / peakAt : 1 - (t - peakAt) / (1 - peakAt);
    const env = smooth(clamp01(u)) ** 1.6;
    const freq = lo * (hi / lo) ** smooth(clamp01(u));
    const x = noise();
    const y = noise();
    const p = 0.5 + 0.5 * pan * (t * 2 - 1);
    buf.l[i] = fl(x, freq, q).band * env * Math.cos((p * Math.PI) / 2) * 1.4;
    buf.r[i] = fr(x * 0.6 + y * 0.4, freq * 1.04, q).band * env * Math.sin((p * Math.PI) / 2) * 1.4;
  }
  write(name, reverb(fadeEdges(buf), { mix: 0.22, decay: 0.6, tail: 0.5 }));
}

/** A soft bell: a few slightly inharmonic partials with their own decays. `notes` are MIDI numbers, struck `spread` apart. */
function chime(name, notes, { seconds = 2.2, spread = 0.05, bright = 1 } = {}) {
  const buf = buffer(seconds);
  const partials = [
    [1, 1, 1.6],
    [2.0, 0.42, 1.0],
    [3.01, 0.2 * bright, 0.6],
    [4.17, 0.1 * bright, 0.42],
    [5.43, 0.05 * bright, 0.3],
  ];
  notes.forEach((m, k) => {
    const f0 = midi(m);
    const start = Math.round(k * spread * SR);
    const pan = notes.length > 1 ? 0.3 + (0.4 * k) / (notes.length - 1) : 0.5;
    for (const [ratio, amp, decay] of partials) {
      const f = f0 * ratio;
      if (f > SR / 2.4) continue;
      const phase = random() * Math.PI * 2;
      for (let i = start; i < buf.l.length; i++) {
        const t = (i - start) / SR;
        const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / (decay * 0.5));
        const v = Math.sin(2 * Math.PI * f * t + phase) * amp * env;
        buf.l[i] += v * Math.cos((pan * Math.PI) / 2);
        buf.r[i] += v * Math.sin((pan * Math.PI) / 2);
      }
    }
  });
  write(name, reverb(fadeEdges(buf, 2, 200), { mix: 0.34, decay: 0.78, tail: 1.4 }), -4);
}

/** A soft low knock: a sine that drops in pitch, with a little filtered air on top so small speakers hear it too. */
function thud(name, { from = 120, to = 52, seconds = 0.5, air = 0.25 } = {}) {
  const buf = buffer(seconds);
  const f = svf();
  let phase = 0;
  for (let i = 0; i < buf.l.length; i++) {
    const t = i / SR;
    const freq = to + (from - to) * Math.exp(-t / 0.045);
    phase += (2 * Math.PI * freq) / SR;
    const body = Math.sin(phase) * (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.13);
    const top = f(noise(), 900, 1.2).band * Math.exp(-t / 0.03) * air;
    buf.l[i] = body + top;
    buf.r[i] = body + top * 0.9;
  }
  write(name, reverb(fadeEdges(buf, 1, 80), { mix: 0.14, decay: 0.5, tail: 0.4 }));
}

/** A tiny rounded blip for small things appearing. */
function pop(name, m) {
  const buf = buffer(0.22);
  const f0 = midi(m);
  let phase = 0;
  for (let i = 0; i < buf.l.length; i++) {
    const t = i / SR;
    const freq = f0 * (1 + 0.5 * Math.exp(-t / 0.012));
    phase += (2 * Math.PI * freq) / SR;
    const v = Math.sin(phase) * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.05);
    buf.l[i] = v;
    buf.r[i] = v;
  }
  write(name, reverb(fadeEdges(buf, 1, 40), { mix: 0.2, decay: 0.5, tail: 0.3 }), -6);
}

/** A rising breath of air and a low swell, for the first second and for lift-off. Loudest at `peakAt`. */
function swell(name, { seconds = 1.5, peakAt = 0.72, lo = 180, hi = 1500, subFrom = 37, subTo = 49, sub = 0.3 } = {}) {
  const buf = buffer(seconds);
  const fl = svf();
  const fr = svf();
  let phase = 0;
  const n = buf.l.length;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const u = t < peakAt ? t / peakAt : 1 - (t - peakAt) / (1 - peakAt);
    const env = smooth(clamp01(u)) ** 2;
    const freq = lo * (hi / lo) ** (t / peakAt > 1 ? 1 : t / peakAt);
    const subFreq = midi(subFrom + (subTo - subFrom) * clamp01(t / peakAt));
    phase += (2 * Math.PI * subFreq) / SR;
    const low = Math.sin(phase) * env * sub;
    buf.l[i] = fl(noise(), freq, 0.8).band * env + low;
    buf.r[i] = fr(noise(), freq * 1.03, 0.8).band * env + low;
  }
  write(name, reverb(fadeEdges(buf, 30, 120), { mix: 0.3, decay: 0.74, tail: 1.0 }));
}

/** A cluster of very quiet high bells scattered over a moment: the shield lighting up. */
function shimmer(name, notes, { seconds = 1.4 } = {}) {
  const buf = buffer(seconds);
  for (let k = 0; k < 14; k++) {
    const f = midi(notes[Math.floor(random() * notes.length)] + 12 * Math.floor(random() * 2));
    const start = Math.round(random() * 0.45 * SR);
    const pan = random();
    const amp = 0.3 + random() * 0.7;
    for (let i = start; i < buf.l.length; i++) {
      const t = (i - start) / SR;
      const v = Math.sin(2 * Math.PI * f * t) * amp * (1 - Math.exp(-t / 0.006)) * Math.exp(-t / 0.22);
      buf.l[i] += v * Math.cos((pan * Math.PI) / 2);
      buf.r[i] += v * Math.sin((pan * Math.PI) / 2);
    }
  }
  write(name, reverb(fadeEdges(buf, 2, 200), { mix: 0.4, decay: 0.8, tail: 1.4 }), -6);
}

// C#5 = 73. The bed sits on C sharp and G sharp; the pentatonic over it is C#, D#, F, G#, A#.
const Cs5 = 73;
const [Ds5, F5, Gs5, As5, Cs6, Ds6, F6, Gs6] = [75, 77, 80, 82, 85, 87, 89, 92];

console.log("writing public/sfx:");
swell("swell", {});
whoosh("whoosh-a", { seconds: 0.95, peakAt: 0.48, pan: 0.6 });
whoosh("whoosh-b", { seconds: 1.05, peakAt: 0.5, lo: 220, hi: 3000, pan: 1 });
whoosh("whoosh-c", { seconds: 1.05, peakAt: 0.5, lo: 240, hi: 2400, pan: -1 });
whoosh("whoosh-d", { seconds: 1.1, peakAt: 0.52, lo: 200, hi: 2800, pan: 1 });
whoosh("flight", { seconds: 0.7, peakAt: 0.5, lo: 500, hi: 3400, pan: 0.5, q: 1.3 });
swell("liftoff", { seconds: 2.3, peakAt: 0.7, lo: 140, hi: 2200, subFrom: 37, subTo: 56, sub: 0.4 });
chime("chime-split", [Gs5, Cs6], { spread: 0.07 });
chime("chime-paid", [As5, Ds6], { spread: 0.07 });
chime("chime-back", [Cs6, F6], { spread: 0.07 });
chime("chime-graduate", [Gs5, Cs6, F6], { spread: 0.06, bright: 1.2 });
chime("chime-end", [Cs5, Gs5, Cs6, F6, Gs6], { spread: 0.045, seconds: 3.2 });
chime("ping", [Cs6], { seconds: 1.2, bright: 0.6 });
thud("thud", {});
thud("catch", { from: 150, to: 46, seconds: 0.7, air: 0.35 });
shimmer("shimmer", [Cs6, Ds6, F6, Gs6]);
pop("pop-1", Gs5);
pop("pop-2", As5);
pop("pop-3", Cs6);
pop("tick", F5 + 12);
void Ds5;
