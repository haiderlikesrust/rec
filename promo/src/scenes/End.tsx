import React from "react";
import { useCurrentFrame } from "remotion";
import { brand, copy } from "../data";
import { alpha, c, type } from "../theme";
import { cue, prog } from "../timing";
import { At, Board, Letters, Mark, Rise, Words } from "../ui";

/**
 * End card. The coin arrives from the launch and hangs above the lockup with its two orbs back in orbit. Below it:
 * the mark and the name, the slogan, the address (a prop: the only place the domain appears) and the fine print.
 */
export const EndOver: React.FC<{ domain: string; showHandle: boolean }> = ({ domain, showHandle }) => {
  const frame = useCurrentFrame();
  return (
    <Board name="end">
      <At x={0} y={46} anchor="center">
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Mark size={130} at={cue.endMark} duration={22} />
          <Letters text={brand.name} at={cue.endWordmark} size={124} />
        </div>
      </At>
      <At x={0} y={158} anchor="center">
        <Words text={copy.end.slogan} at={cue.slogan} stagger={2.4} size={58} weight={500} color={c.ink} style={{ letterSpacing: "-0.022em" }} />
      </At>
      <At x={0} y={266} anchor="center">
        <Rise at={cue.domain} by={26} kind="pop">
          <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                height: 86,
                padding: "0 38px",
                borderRadius: 999,
                ...type.headline,
                background: c.ink,
                color: c.inkInverse,
                fontSize: 48,
                letterSpacing: "-0.02em",
                boxShadow: `0 0 70px -10px ${alpha(c.signal, 0.55)}`,
              }}
            >
              <span style={{ color: c.inkInverse }}>{domain}</span>
            </div>
            {showHandle && brand.xHandle ? <div style={{ ...type.body, fontSize: 46, color: c.ink2 }}>{brand.xHandle}</div> : null}
          </div>
        </Rise>
      </At>
      <At x={0} y={402} anchor="center" style={{ opacity: prog(frame, cue.disclaimer, cue.disclaimer + 14) }}>
        <div style={{ ...type.body, fontSize: type.small, fontWeight: 400, color: c.ink2, letterSpacing: "-0.008em" }}>{copy.end.disclaimer}</div>
      </At>
    </Board>
  );
};
