import React from "react";
import { useCurrentFrame } from "remotion";
import { copy, demo, fmt } from "../data";
import { alpha, c, type } from "../theme";
import { cue, ease, lerp, prog, pulse, rand, springAt } from "../timing";
import { At, Board, Card, Dot, Ink, Pill, Stream, Words } from "../ui";
import { L, boards } from "../world";

/**
 * The OTC reserve. The lilac half of the fee runs on from the split and pours into a soft glass vessel, which fills.
 * A sell card comes up: the holder sells, SOL leaves the vessel for the card, and the number counts up. The coins a
 * holder sells are burned, not kept, so nothing flows the other way.
 */

const V = L.otc.vessel;
const K = L.otc.card;
const left = V.x - V.w / 2;
const right = V.x + V.w / 2;
const topY = V.y - V.h / 2;
const bottomY = V.y + V.h / 2;
const R = 70;

// from the reserve's orb on the fee board, in this board's coordinates
const from = { x: boards.fee.x + L.fee.reserve.x - boards.otc.x, y: boards.fee.y + L.fee.reserve.y + L.fee.orbR + 4 - boards.otc.y };
const pourPath = `M${from.x},${from.y} C${from.x},${from.y + 216} ${from.x + 280},${from.y + 276} ${from.x + 520},${from.y + 136} C${from.x + 700},${from.y + 31} ${V.x},${topY - 250} ${V.x},${topY - 70} L${V.x},${topY + 30}`;
const glass = `M${left},${topY} L${left},${bottomY - R} Q${left},${bottomY} ${left + R},${bottomY} L${right - R},${bottomY} Q${right},${bottomY} ${right},${bottomY - R} L${right},${topY}`;

/** How full the vessel is (0…1) and how much SOL it reads. */
const level = (frame: number) => 0.1 + 0.5 * prog(frame, cue.pour + 4, cue.pour + 76, ease.out) + 0.05 * prog(frame, cue.pour + 76, 440) - 0.06 * prog(frame, cue.solOut, cue.solIn, ease.inOut);
const reserveSol = (frame: number) =>
  lerp(demo.reserveBeforeSol - 8.22, demo.reserveBeforeSol, prog(frame, cue.pour + 4, cue.pour + 76, ease.out)) - demo.sellGetsSol * prog(frame, cue.solOut + 2, cue.solIn, ease.inOut);

const surfaceY = (frame: number) => bottomY - level(frame) * V.h;
const wave = (frame: number, phase: number, amp: number) => {
  const y0 = surfaceY(frame);
  const stir = 1 + 1.6 * pulse(frame, cue.pour + 6, 6, 60) + 1.2 * pulse(frame, cue.solOut + 6, 6, 40);
  let d = `M${left - 4},${bottomY + 4} L${left - 4},${y0}`;
  for (let x = left - 4; x <= right + 4; x += 14) {
    const y = y0 + amp * stir * Math.sin(x / 46 + frame * 0.17 + phase) + amp * 0.5 * stir * Math.sin(x / 23 - frame * 0.11 + phase * 2);
    d += ` L${x},${y.toFixed(2)}`;
  }
  return `${d} L${right + 4},${bottomY + 4} Z`;
};

export const OtcUnder: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = prog(frame, 252, cue.pour + 6, ease.inOut);
  const y0 = surfaceY(frame);
  const cardIn = springAt(frame, cue.cardIn, "pop");
  const press = pulse(frame, cue.sellPress, 3, 12);
  const got = prog(frame, cue.solOut + 10, cue.solIn + 2, ease.out) * demo.sellGetsSol;
  const paid = pulse(frame, cue.solIn, 3, 26);
  const filled = prog(frame, cue.pour + 2, cue.pour + 30);
  return (
    <Board name="otc">
      {/* the vessel's light */}
      <div
        style={{
          position: "absolute",
          left: V.x - 420,
          top: V.y - 380,
          width: 840,
          height: 840,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, ${alpha(c.desk, 0.3)}, ${alpha(c.desk, 0.07)} 55%, transparent)`,
          opacity: 0.25 + 0.6 * filled,
        }}
      />
      <Ink>
        <defs>
          <clipPath id="otc-glass">
            <path d={`${glass} Z`} />
          </clipPath>
          <linearGradient id="otc-liquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#CDBFFF" />
            <stop offset="0.45" stopColor={c.desk} />
            <stop offset="1" stopColor="#7C6BE0" />
          </linearGradient>
          <linearGradient id="otc-wall" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
            <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.12" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.26" />
          </linearGradient>
        </defs>
        <Stream id="otc-pour" d={pourPath} from={c.desk} color={c.desk} width={8} reveal={reveal} speed={8} />
        {/* inside the glass the stream falls on to the surface */}
        {reveal >= 1 ? (
          <g opacity={prog(frame, cue.pour + 5, cue.pour + 9)}>
            <line x1={V.x} y1={topY + 24} x2={V.x} y2={y0 + 6} stroke={c.desk} strokeWidth={26} strokeLinecap="round" opacity={0.2} style={{ filter: "blur(10px)" }} />
            <line x1={V.x} y1={topY + 24} x2={V.x} y2={y0 + 6} stroke="#CFC3FF" strokeWidth={8} strokeLinecap="round" opacity={0.85} />
            {Array.from({ length: 5 }, (_, i) => {
              const span = y0 + 6 - (topY + 24);
              const at = ((i * 0.2 + frame * 0.045) % 1) * span;
              return <circle key={i} cx={V.x} cy={topY + 24 + at} r={i % 2 ? 3 : 4.2} fill="#FFFFFF" opacity={0.85} />;
            })}
            <ellipse cx={V.x} cy={y0 + 4} rx={30 + 8 * Math.sin(frame * 0.5)} ry={7} fill="#FFFFFF" opacity={0.3} />
          </g>
        ) : null}
        {/* glass body */}
        <path d={`${glass} Z`} fill={alpha("#FFFFFF", 0.035)} />
        <g clipPath="url(#otc-glass)">
          <path d={wave(frame, 1.7, 7)} fill={c.desk} opacity={0.38} />
          <path d={wave(frame, 0, 5)} fill="url(#otc-liquid)" opacity={0.94} />
          {/* bubbles from where the stream lands */}
          {Array.from({ length: 9 }, (_, i) => {
            const life = ((frame * (0.5 + rand(i) * 0.5) + rand(i + 20) * 90) % 90) / 90;
            const x = V.x + (rand(i + 40) - 0.5) * 150;
            const y = lerp(bottomY - 20, y0 + 14, life);
            return <circle key={i} cx={x + Math.sin(frame / 9 + i) * 5} cy={y} r={3 + rand(i + 60) * 5} fill="#FFFFFF" opacity={0.22 * filled * Math.sin(Math.PI * life)} />;
          })}
          <rect x={left + 26} y={topY + 30} width={16} height={V.h - 110} rx={8} fill="#FFFFFF" opacity={0.1} />
        </g>
        <path d={glass} fill="none" stroke="url(#otc-wall)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        <path d={glass} fill="none" stroke={c.desk} strokeWidth={22} strokeLinecap="round" opacity={0.12 + 0.1 * paid} style={{ filter: "blur(14px)" }} />
      </Ink>

      {/* what the vessel is, and what is in it */}
      <At x={V.x} y={bottomY + 34} anchor="top" style={{ opacity: prog(frame, cue.pour - 4, cue.pour + 12) }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, ...type.body, fontSize: type.small, color: c.ink }}>
            <Dot color={c.desk} />
            {copy.otc.vessel}
          </div>
          <div style={{ ...type.num, fontSize: 60, color: c.desk }}>{fmt.sol(reserveSol(frame))} SOL</div>
        </div>
      </At>

      {/* the sell card */}
      <At x={K.x} y={K.y} style={{ opacity: Math.min(1, cardIn * 1.6), transform: `translateY(${(1 - cardIn) * 130}px) scale(${(0.95 + 0.05 * Math.min(cardIn, 1.1)) * (1 - 0.012 * press)})`, transformOrigin: "50% 100%" }}>
        <Card width={K.w} glow={alpha(c.desk, 0.22 + 0.25 * paid)} style={{ padding: "46px 52px 48px", display: "flex", flexDirection: "column", gap: 30 }}>
          <div style={{ ...type.headline, fontSize: 46, letterSpacing: "-0.022em" }}>{copy.otc.cardTitle}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "22px 30px", borderRadius: 20, background: `linear-gradient(${alpha(c.signal, 0.1 * press)}, ${alpha(c.signal, 0.1 * press)}), ${c.raise}` }}>
              <span style={{ ...type.body, fontSize: type.small }}>{copy.otc.youSell}</span>
              <span style={{ ...type.num, fontSize: 54 }}>
                {fmt.int(demo.sellAmount)} <span style={{ color: c.ink2, fontWeight: 500 }}>{copy.otc.coins}</span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "22px 30px", borderRadius: 20, background: `linear-gradient(${alpha(c.desk, 0.07 + 0.12 * paid)}, ${alpha(c.desk, 0.07 + 0.12 * paid)}), ${c.raise}` }}>
              <span style={{ ...type.body, fontSize: type.small }}>{copy.otc.youGet}</span>
              <span style={{ ...type.num, fontSize: 80, lineHeight: 1 }}>
                {fmt.sol(got)} <span style={{ color: c.desk }}>SOL</span>
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            <Pill>{copy.otc.chips[0]}</Pill>
            <div style={{ opacity: prog(frame, cue.solIn - 4, cue.solIn + 2), transform: `scale(${0.8 + 0.2 * springAt(frame, cue.solIn - 4, "pop")})`, transformOrigin: "0 50%" }}>
              <Pill tone={c.desk}>{copy.otc.chips[1]}</Pill>
            </div>
          </div>
        </Card>
      </At>
    </Board>
  );
};

export const OtcOver: React.FC = () => {
  const frame = useCurrentFrame();
  const [l1, l2] = copy.otc.headline;
  // SOL leaves the vessel for the card: droplets on an arc, one after another
  const start = { x: V.x + 84, y: surfaceY(frame) - 6 };
  const end = { x: K.x + K.w - 250, y: K.y + 318 };
  const ctrl = { x: lerp(start.x, end.x, 0.42), y: Math.min(start.y, end.y) - 250 };
  const drops = Array.from({ length: 9 }, (_, i) => {
    const t0 = cue.solOut + i * 3;
    return Array.from({ length: 4 }, (_, k) => {
      const t = prog(frame - k * 1.3, t0, t0 + 20, ease.inOut);
      if (t <= 0 || t >= 1) return null;
      const u = 1 - t;
      const x = u * u * start.x + 2 * u * t * ctrl.x + t * t * end.x;
      const y = u * u * start.y + 2 * u * t * ctrl.y + t * t * end.y;
      const r = (k === 0 ? 11 : 8 - k * 1.6) * (0.8 + 0.4 * rand(i));
      return <circle key={`${i}-${k}`} cx={x} cy={y} r={r} fill={k === 0 ? "#EDE7FF" : c.desk} opacity={(k === 0 ? 1 : 0.5 - k * 0.1) * Math.min(1, t * 6, (1 - t) * 5)} />;
    });
  });
  return (
    <Board name="otc">
      <At x={K.x} y={K.y - 318}>
        <Words text={l1} at={cue.otcHeadline} size={94} />
        <Words text={l2} at={cue.solIn - 6} size={94} color={c.desk} style={{ marginTop: 8 }} />
      </At>
      <Ink style={{ filter: `drop-shadow(0 0 14px ${alpha(c.desk, 0.9)})` }}>{drops}</Ink>
    </Board>
  );
};
