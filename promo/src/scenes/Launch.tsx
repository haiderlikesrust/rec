import React from "react";
import { useCurrentFrame } from "remotion";
import { copy, facts, fmt } from "../data";
import { alpha, c, type } from "../theme";
import { cue, ease, lerp, prog, pulse, rand, springAt } from "../timing";
import { At, Board, Mark, Pill, Rise, Words } from "../ui";
import { L, boards, coin } from "../world";

/**
 * Launch. The logo is a launch tower, so here it is one: it draws itself, the coin docks at its service arm, a
 * bar fills from the starting market cap to graduation, and the coin lifts off. The camera follows it up into the
 * end card.
 */

const B = L.launch.bar;
const Tw = L.launch.tower;
const fillAt = (frame: number) => prog(frame, cue.barStart, cue.barEnd, ease.inOut);

export const LaunchUnder: React.FC = () => {
  const frame = useCurrentFrame();
  const fill = fillAt(frame);
  const done = prog(frame, cue.barEnd - 1, cue.barEnd + 7);
  const flash = pulse(frame, cue.barEnd, 2, 26);
  const barIn = prog(frame, cue.barStart - 14, cue.barStart - 2, ease.out);
  const state = coin(frame);
  const thrust = state.thrust;
  // the coin's position on this board, for the plume under it
  const cxy = { x: state.x - boards.launch.x, y: state.y - boards.launch.y };
  const flick = 0.85 + 0.15 * Math.sin(frame * 1.9) + 0.1 * Math.sin(frame * 3.7);
  return (
    <Board name="launch">
      {/* ground light under the tower */}
      <div
        style={{
          position: "absolute",
          left: Tw.x - 380,
          top: Tw.y + Tw.size / 2 - 150,
          width: 760,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, ${alpha(c.signal, 0.34)}, transparent)`,
          opacity: prog(frame, cue.towerDraw, cue.towerDraw + 20) * (0.6 + 0.4 * thrust),
        }}
      />
      <At x={Tw.x} y={Tw.y} anchor="center">
        <Mark size={Tw.size} at={cue.towerDraw - 2} duration={28} />
      </At>

      {/* the plume */}
      {thrust > 0.01 ? (
        <>
          <div
            style={{
              position: "absolute",
              left: cxy.x - 60 * thrust,
              top: cxy.y + state.r * 0.55,
              width: 120 * thrust,
              height: 520 * thrust * flick,
              borderRadius: "50% 50% 50% 50% / 14% 14% 86% 86%",
              background: `linear-gradient(180deg, ${alpha("#FFFFFF", 0.95)}, ${alpha(c.peach, 0.8)} 16%, ${alpha(c.pink, 0.5)} 42%, ${alpha(c.signal, 0.18)} 72%, transparent)`,
              filter: "blur(16px)",
              opacity: thrust,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: cxy.x - 190,
              top: cxy.y - 120,
              width: 380,
              height: 520,
              borderRadius: "50%",
              background: `radial-gradient(closest-side, ${alpha(c.peach, 0.34)}, ${alpha(c.pink, 0.1)} 55%, transparent)`,
              opacity: thrust,
            }}
          />
          {Array.from({ length: 14 }, (_, i) => {
            const life = ((frame * (0.9 + rand(i) * 0.7) + rand(i + 9) * 30) % 30) / 30;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: cxy.x + (rand(i + 3) - 0.5) * 70 * (1 + life * 2),
                  top: cxy.y + state.r * 0.7 + life * 420,
                  width: 9 - life * 5,
                  height: 9 - life * 5,
                  borderRadius: 99,
                  background: i % 3 ? c.peach : "#FFFFFF",
                  opacity: thrust * (1 - life) * 0.8,
                }}
              />
            );
          })}
        </>
      ) : null}

      {/* the graduation bar */}
      <div style={{ position: "absolute", left: B.x, top: B.y, width: B.w, height: B.h, opacity: barIn, transform: `scaleX(${0.9 + 0.1 * barIn})`, transformOrigin: "0 50%" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: c.raise, border: `1.5px solid ${c.rule}` }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: lerp(B.h, B.w, fill),
            borderRadius: 999,
            background: `linear-gradient(90deg, ${c.signal}, ${c.pink} 70%, ${c.peach})`,
            boxShadow: `0 0 ${34 + 40 * flash}px ${alpha(c.signal, 0.5 + 0.3 * flash)}`,
          }}
        />
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: lerp(B.h, B.w, fill), borderRadius: 999, background: c.gain, opacity: done, boxShadow: `0 0 ${40 + 50 * flash}px ${alpha(c.gain, 0.6)}` }} />
        {/* the bright head of the fill */}
        <div style={{ position: "absolute", left: lerp(B.h, B.w, fill) - B.h, top: 0, width: B.h, height: B.h, borderRadius: 999, background: "#FFFFFF", opacity: 0.9 * (1 - done) * (fill > 0.001 ? 1 : 0), filter: "blur(3px)" }} />
      </div>
      <At x={B.x} y={B.y + B.h + 22} style={{ opacity: barIn }}>
        <div style={{ ...type.num, fontSize: type.small, color: c.ink2, fontWeight: 500 }}>{fmt.usd(facts.startMcapUsd)}</div>
      </At>
      <At x={B.x + B.w} y={B.y + B.h + 22} style={{ opacity: barIn, transform: "translateX(-100%)" }}>
        <div style={{ ...type.num, fontSize: type.small, color: done > 0.5 ? c.gain : c.ink2, fontWeight: 500 }}>{fmt.usd(facts.graduationMcapUsd)}</div>
      </At>
    </Board>
  );
};

export const LaunchOver: React.FC = () => {
  const frame = useCurrentFrame();
  const [l1, l2] = copy.launch.headline;
  const fill = fillAt(frame);
  const cap = lerp(facts.startMcapUsd, facts.graduationMcapUsd, fill);
  const done = springAt(frame, cue.barEnd, "pop");
  const barIn = prog(frame, cue.barStart - 14, cue.barStart - 2, ease.out);
  return (
    <Board name="launch">
      <At x={-840} y={-458}>
        <Words text={l1} at={632} size={94} />
        <Words text={l2} at={674} size={94} tint={{ Raydium: c.signal }} style={{ marginTop: 8 }} />
      </At>

      {/* the market cap, counting with the bar */}
      <At x={B.x} y={B.y - 168} style={{ opacity: barIn }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div>
            <div style={{ ...type.body, fontSize: type.small, color: c.ink2 }}>{copy.launch.marketCap}</div>
            <div style={{ ...type.num, fontSize: 80, lineHeight: 1.05, marginTop: 2, minWidth: 330 }}>{fmt.usd(cap)}</div>
          </div>
          <div style={{ opacity: Math.min(1, done * 1.5), transform: `scale(${0.7 + 0.3 * done})`, transformOrigin: "0 60%", alignSelf: "flex-end", marginBottom: 6 }}>
            <Pill tone={c.gain} style={{ fontWeight: 600 }}>
              {copy.launch.graduated}
            </Pill>
          </div>
        </div>
      </At>

      <At x={-840} y={B.y + B.h + 124}>
        <Words text={copy.launch.rent} at={650} stagger={1.4} size={type.small} weight={500} color={c.ink2} style={{ letterSpacing: "-0.012em" }} />
      </At>
      <At x={-840} y={B.y + B.h + 204}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Rise at={684} by={20}>
            <div style={{ ...type.body, fontSize: type.small, color: c.ink3, marginRight: 8 }}>{copy.launch.pairsLabel}</div>
          </Rise>
          {copy.launch.pairs.map((p, i) => (
            <Rise key={p} at={686 + i * 3} by={24} kind="pop">
              <Pill style={{ height: 74, padding: "0 26px", color: c.ink }}>{p}</Pill>
            </Rise>
          ))}
        </div>
      </At>
    </Board>
  );
};
