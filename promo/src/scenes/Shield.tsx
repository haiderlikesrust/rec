import { evolvePath } from "@remotion/paths";
import React from "react";
import { useCurrentFrame } from "remotion";
import { copy, demo, fmt, payoutSol } from "../data";
import { lengthOf } from "../paths";
import { alpha, c, type } from "../theme";
import { cue, ease, lerp, prog, pulse, springAt } from "../timing";
import { At, Board, Card, Dot, Ink, Pill, Rise, Stream, Words } from "../ui";
import { L } from "../world";

/**
 * Heat Shield. A price line climbs to the coin, then drops, and the coin rides the tip of it down. A teal arc
 * opens underneath and catches it. A payout chip rises out of the shield and flies to the wallet, whose balance
 * counts up by exactly the top tier's share of the loss.
 */

const S = L.shield;
const cx = S.rest.x;
// the arc is the bottom of a wide circle: its lowest point sits just under the resting coin
const ARC_R = 420;
const arcCy = S.rest.y + S.coinR + 20 - ARC_R;
const half = (33 * Math.PI) / 180;
const arc = (r: number, spread = half) => {
  const dx = r * Math.sin(spread);
  const y = arcCy + r * Math.cos(spread);
  return `M${cx - dx},${y} A${r} ${r} 0 0 0 ${cx + dx},${y}`;
};
const arcEnd = { x: cx + ARC_R * Math.sin(half), y: arcCy + ARC_R * Math.cos(half) };
const trickle = `M430,-580 C430,-260 ${arcEnd.x + 90},${arcEnd.y - 250} ${arcEnd.x + 8},${arcEnd.y - 14}`;

/** A stroke that opens from its middle outwards. */
const fromMiddle = (d: string, p: number) => {
  const len = lengthOf(d);
  return { strokeDasharray: `${len * p} ${len + 10}`, strokeDashoffset: -(len * (1 - p)) / 2 };
};

export const ShieldUnder: React.FC = () => {
  const frame = useCurrentFrame();
  const fall = prog(frame, cue.fall, cue.caught, ease.in);
  const rise = prog(frame, cue.rise + 4, cue.peak, ease.inOut);
    const open = prog(frame, cue.caught - 16, cue.caught - 1, ease.out);
  const hit = pulse(frame, cue.caught, 2, 30);
  const paid = pulse(frame, cue.payoutLands, 3, 30);
  const riseDash = evolvePath(rise, S.rise);
  const fallDash = evolvePath(fall, S.fall);
  const ripple = (delay: number, grow: number) => {
    const t = prog(frame, cue.caught + delay, cue.caught + delay + 30, ease.out);
    if (t <= 0 || t >= 1) return null;
    return <path d={arc(ARC_R + grow * t, half * (1 + 0.1 * t))} fill="none" stroke={c.shield} strokeWidth={6 * (1 - t)} strokeLinecap="round" opacity={0.7 * (1 - t)} />;
  };
  const walletIn = springAt(frame, cue.peak + 2, "snap");
  const balance = lerp(demo.walletBeforeSol, demo.walletBeforeSol + payoutSol, prog(frame, cue.payoutLands - 2, cue.payoutLands + 20, ease.out));
  return (
    <Board name="shield">
      {/* the shield's light under the coin */}
      <div
        style={{
          position: "absolute",
          left: cx - 430,
          top: S.rest.y - 330,
          width: 860,
          height: 760,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, ${alpha(c.shield, 0.3)}, ${alpha(c.shield, 0.06)} 58%, transparent)`,
          opacity: open * (0.55 + 0.45 * hit),
        }}
      />
      <Ink>
        {/* the price: up in green, down in red, each with a soft glow behind it */}
        <path d={S.rise} fill="none" stroke={c.gain} strokeWidth={26} strokeLinecap="round" opacity={0.2} style={{ filter: "blur(16px)" }} {...riseDash} />
        <path d={S.rise} fill="none" stroke={c.gain} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} {...riseDash} />
        {fall > 0 ? (
          <>
            <path d={S.fall} fill="none" stroke={c.loss} strokeWidth={26} strokeLinecap="round" opacity={0.22} style={{ filter: "blur(16px)" }} {...fallDash} />
            <path d={S.fall} fill="none" stroke={c.loss} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} {...fallDash} />
          </>
        ) : null}
        <circle cx={-840} cy={210} r={9 * prog(frame, cue.rise - 2, cue.rise + 6)} fill={c.gain} />

        {/* the fund keeps filling from above */}
        <Stream id="shield-trickle" d={trickle} from={c.shield} color={c.shield} width={5} reveal={prog(frame, cue.caught - 22, cue.caught + 6, ease.inOut)} speed={6} gap={30} dim={0.85} />

        {/* the shield */}
        {open > 0 ? (
          <>
            <path d={arc(ARC_R)} fill="none" stroke={c.shield} strokeWidth={44} strokeLinecap="round" opacity={0.2 + 0.2 * hit} style={{ filter: "blur(22px)" }} {...fromMiddle(arc(ARC_R), open)} />
            <path d={arc(ARC_R)} fill="none" stroke={c.shield} strokeWidth={16 + 4 * hit} strokeLinecap="round" {...fromMiddle(arc(ARC_R), open)} />
            <path d={arc(ARC_R + 36, half * 0.72)} fill="none" stroke={c.shield} strokeWidth={5} strokeLinecap="round" opacity={0.26} {...fromMiddle(arc(ARC_R + 36, half * 0.72), open)} />
          </>
        ) : null}
        {ripple(0, 90)}
        {ripple(7, 150)}
      </Ink>

      <At x={arcEnd.x + 44} y={arcEnd.y + 44} anchor="left">
        <Rise at={cue.caught - 2} by={18}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, ...type.body, fontSize: type.small, fontWeight: 600, color: c.shield }}>
            <Dot color={c.shield} />
            {copy.shield.name}
          </div>
        </Rise>
      </At>

      {/* the wallet */}
      <At x={S.wallet.x} y={S.wallet.y} style={{ opacity: Math.min(1, walletIn * 1.5), transform: `translateY(${(1 - walletIn) * 60}px) scale(${1 + 0.03 * paid})` }}>
        <Card width={S.wallet.w} height={S.wallet.h} glow={alpha(c.shield, 0.12 + 0.5 * paid)} style={{ padding: "38px 40px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, borderColor: alpha(c.shield, 0.07 + 0.5 * paid) }}>
          <div style={{ ...type.body, fontSize: type.small }}>{copy.shield.wallet}</div>
          <div style={{ ...type.num, fontSize: 72, lineHeight: 1 }}>
            {fmt.sol(balance)} <span style={{ color: c.ink2, fontWeight: 500 }}>SOL</span>
          </div>
        </Card>
      </At>

      {/* the hold-time tiers */}
      <At x={-840} y={366}>
        <div style={{ display: "flex", gap: 20 }}>
          {copy.shield.tiers.map((t, i) => {
            const top = i === copy.shield.tiers.length - 1;
            return (
              <Rise key={i} at={cue.tiers + i * 7} by={30} kind="pop">
                <Pill tone={top ? c.shield : undefined} style={{ height: 80 }}>
                  <span style={{ color: top ? c.ink : c.ink2 }}>{t.hold}</span>
                  <span style={{ fontWeight: 600, color: top ? c.shield : c.ink }}>{t.pct}</span>
                </Pill>
              </Rise>
            );
          })}
        </div>
      </At>
    </Board>
  );
};

export const ShieldOver: React.FC = () => {
  const frame = useCurrentFrame();
  const [l1, l2] = copy.shield.headline;
  const pct = l2.split(" ").find((w) => w.includes("%")) ?? "";
  // the payout chip: up out of the shield, a beat, then across to the wallet
  const pop = springAt(frame, cue.payoutPop, "pop");
  const fly = prog(frame, cue.payoutFly, cue.payoutLands, ease.inOut);
  const from = { x: cx, y: S.rest.y - S.coinR - 62 };
  const to = { x: S.wallet.x + S.wallet.w / 2, y: S.wallet.y + S.wallet.h / 2 + 20 };
  const chip = {
    x: lerp(from.x, to.x, fly),
    y: lerp(from.y, to.y, fly) - Math.sin(Math.PI * fly) * 90 + (1 - Math.min(1, pop)) * 70,
    scale: (0.6 + 0.4 * pop) * lerp(1, 0.55, ease.in(fly)),
    opacity: Math.min(1, pop * 1.6) * (1 - prog(frame, cue.payoutLands - 3, cue.payoutLands + 1)),
  };
  return (
    <Board name="shield">
      <At x={-840} y={-456}>
        <Words text={l1} at={472} size={100} />
        <Words text={l2} at={cue.caught + 4} size={66} weight={500} color={c.ink} tint={{ [pct]: c.shield }} style={{ marginTop: 18, letterSpacing: "-0.024em" }} />
      </At>
      <At x={-476} y={132} anchor="left">
        <Rise at={cue.fall + 14} by={-22}>
          <div style={{ ...type.num, fontSize: 56, color: c.loss }}>{copy.shield.loss}</div>
        </Rise>
      </At>
      {frame >= cue.payoutPop - 1 && chip.opacity > 0 ? (
        <At x={chip.x} y={chip.y} anchor="center" style={{ opacity: chip.opacity }}>
          <div style={{ transform: `scale(${chip.scale})` }}>
            <Pill tone={c.shield} style={{ height: 86, padding: "0 34px", background: `linear-gradient(${alpha(c.shield, 0.2)}, ${alpha(c.shield, 0.2)}), ${c.panel}`, borderColor: alpha(c.shield, 0.6), boxShadow: `0 0 60px -6px ${alpha(c.shield, 0.6)}, 0 24px 60px -20px rgba(0,0,0,0.6)`, fontWeight: 600 }}>
              {copy.shield.payout}
            </Pill>
          </div>
        </At>
      ) : null}
    </Board>
  );
};
