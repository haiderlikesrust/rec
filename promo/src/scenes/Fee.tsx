import React from "react";
import { useCurrentFrame } from "remotion";
import { copy } from "../data";
import { alpha, c, type } from "../theme";
import { cue, ease, prog, pulse } from "../timing";
import { At, Board, Ink, Rise, Stream, Words } from "../ui";
import { L } from "../world";

/**
 * "Every trade pays 3%." The coin sheds a stream. A thin thread peels off to Raydium (its 0.25% protocol share),
 * and the rest splits in two: half to the protection fund's orb, half to the reserve's. The two orbs are the same
 * ones that circled the coin in the open (the 3D layer flies them out to the ends of the streams).
 */

const F = L.fee;
const top = F.coin.y + F.coin.r - 8;
const main = `M${F.coin.x},${top} C${F.coin.x},${top + 80} ${F.split.x},${F.split.y - 90} ${F.split.x},${F.split.y}`;
const branch = (to: { x: number; y: number }) => `M${F.split.x},${F.split.y - 2} C${F.split.x},${F.split.y + 118} ${to.x},${to.y - 150} ${to.x},${to.y - F.orbR - 6}`;
const toShield = branch(F.shield);
const toReserve = branch(F.reserve);
const toRaydium = `M${F.coin.x},${top + 104} C${F.coin.x + 86},${top + 104} ${F.raydium.x - 110},${F.raydium.y} ${F.raydium.x - 16},${F.raydium.y}`;

export const FeeUnder: React.FC = () => {
  const frame = useCurrentFrame();
  const mainReveal = prog(frame, cue.streamStart, cue.streamSplit, ease.inOut);
  const branchReveal = prog(frame, cue.streamSplit - 1, cue.streamLands, ease.inOut);
  const raydiumReveal = prog(frame, cue.streamStart + 12, cue.streamSplit + 6, ease.inOut);
  const lands = pulse(frame, cue.streamLands, 3, 30);
  const halo = (p: { x: number; y: number }, color: string) => {
    const on = prog(frame, cue.streamLands - 6, cue.streamLands + 6);
    const size = 300 + 90 * lands;
    return (
      <div
        style={{
          position: "absolute",
          left: p.x - size / 2,
          top: p.y - size / 2,
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, ${alpha(color, 0.42)}, ${alpha(color, 0.1)} 55%, transparent)`,
          opacity: 0.35 + 0.4 * on + 0.25 * lands,
        }}
      />
    );
  };
  return (
    <Board name="fee">
      {halo(F.shield, c.shield)}
      {halo(F.reserve, c.desk)}
      <Ink>
        <Stream id="fee-raydium" d={toRaydium} color={c.ink3} width={3.5} reveal={raydiumReveal} speed={4} gap={30} dim={0.8} />
        <Stream id="fee-shield" d={toShield} from={c.signal} color={c.shield} width={8} reveal={branchReveal} speed={6.5} />
        <Stream id="fee-reserve" d={toReserve} from={c.signal} color={c.desk} width={8} reveal={branchReveal} speed={6.5} />
        <Stream id="fee-main" d={main} color={c.signal} width={11} reveal={mainReveal} speed={7} />
        {/* the thread's end: a small quiet dot */}
        <circle cx={F.raydium.x} cy={F.raydium.y} r={11 * prog(frame, cue.streamSplit + 2, cue.streamSplit + 10, ease.out)} fill={c.ink3} />
      </Ink>
    </Board>
  );
};

export const FeeOver: React.FC = () => {
  const [l1, l2] = copy.fee.headline;
  const [none1, none2] = copy.fee.none;
  const pct = l2.split(" ").pop()!;
  const label = (p: { x: number; y: number }, name: string, color: string, at: number) => (
    <At x={p.x} y={p.y + F.orbR + 28} anchor="top">
      <Rise at={at} by={24}>
        <div style={{ textAlign: "center" }}>
          <div style={{ ...type.headline, fontSize: 54, color }}>{copy.fee.half}</div>
          <div style={{ ...type.body, fontSize: type.small, color: c.ink, marginTop: 6 }}>{name}</div>
        </div>
      </Rise>
    </At>
  );
  return (
    <Board name="fee">
      <At x={-840} y={-262}>
        <Words text={l1} at={cue.feeHeadline - 5} size={136} />
        <Words text={l2} at={cue.feeHeadline + 4} size={136} tint={{ [pct]: c.signal }} style={{ marginTop: 6 }} />
      </At>
      <At x={-840} y={92}>
        <Words text={none1} at={cue.noneA - 5} size={68} tint={{ "0%": c.signal }} />
        <Words text={none2} at={cue.noneB - 5} size={68} tint={{ "0%": c.signal }} style={{ marginTop: 14 }} />
      </At>
      <At x={F.raydium.x + 30} y={F.raydium.y} anchor="left">
        <Rise at={cue.streamSplit + 4} by={0}>
          <div style={{ ...type.body, fontSize: type.small, color: c.ink3 }}>{copy.fee.raydium}</div>
        </Rise>
      </At>
      {label(F.shield, copy.fee.shield, c.shield, cue.streamLands - 2)}
      {label(F.reserve, copy.fee.reserve, c.desk, cue.streamLands + 2)}
    </Board>
  );
};
