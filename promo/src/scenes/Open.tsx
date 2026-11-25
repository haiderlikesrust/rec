import React from "react";
import { useCurrentFrame } from "remotion";
import { brand, copy } from "../data";
import { c } from "../theme";
import { cue, prog } from "../timing";
import { At, Board, Letters, Mark, Words } from "../ui";

/**
 * Cold open. The coin comes up out of the dark (the 3D layer), the tower mark draws itself, the name settles
 * beside it and one line says what this is. It all sits under the coin, which flies through it on the way out.
 */
export const OpenUnder: React.FC = () => {
  const frame = useCurrentFrame();
  const leave = prog(frame, 92, 108);
  return (
    <Board name="open">
      <At x={0} y={186} anchor="center" style={{ opacity: 1 - leave }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Mark size={138} at={cue.markDraw} />
          <Letters text={brand.name} at={cue.wordmark} size={132} />
        </div>
      </At>
      <At x={0} y={330} anchor="center" style={{ opacity: 1 - leave }}>
        <Words text={copy.open.line} at={cue.openLine} stagger={2} size={54} weight={500} color={c.ink2} style={{ letterSpacing: "-0.02em" }} />
      </At>
    </Board>
  );
};
