import { Audio } from "@remotion/media";
import React from "react";
import { Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { MUSIC_IN, T, cue } from "../timing";
import { moves } from "../world";

/*
 * Sound. The bed is one generated instrumental at 120 BPM (public/music), entering on the first downbeat one second
 * in. The effects are synthesised by scripts/make-sfx.mjs (public/sfx) and placed on the frames the picture hits.
 * Levels leave headroom: the bed peaks near -6 dBFS and no effect is louder than it.
 */

const MUSIC_LEVEL = 0.68;

type Hit = { at: number; file: string; level: number };

/** A whoosh is loudest at the middle of its camera move: `lead` is how many frames into the file its peak is. */
const mid = (i: number) => (moves[i]!.start + moves[i]!.end) / 2;
const hits: Hit[] = [
  { at: 0, file: "swell", level: 0.42 },
  { at: Math.round(mid(0) - 14), file: "whoosh-a", level: 0.28 },
  { at: cue.streamLands - 1, file: "chime-split", level: 0.42 },
  { at: Math.round(mid(1) - 16), file: "whoosh-b", level: 0.3 },
  { at: cue.cardIn + 7, file: "thud", level: 0.3 },
  { at: cue.sellPress, file: "tick", level: 0.2 },
  { at: cue.solIn - 1, file: "chime-paid", level: 0.42 },
  { at: Math.round(mid(2) - 16), file: "whoosh-c", level: 0.3 },
  { at: cue.fall + 6, file: "flight", level: 0.22 },
  { at: cue.caught - 1, file: "catch", level: 0.5 },
  { at: cue.caught, file: "shimmer", level: 0.3 },
  { at: cue.tiers + 2, file: "pop-1", level: 0.2 },
  { at: cue.tiers + 9, file: "pop-2", level: 0.2 },
  { at: cue.tiers + 16, file: "pop-3", level: 0.22 },
  { at: cue.payoutPop, file: "ping", level: 0.26 },
  { at: cue.payoutLands - 1, file: "chime-back", level: 0.42 },
  { at: Math.round(mid(3) - 17), file: "whoosh-d", level: 0.3 },
  { at: cue.dock - 1, file: "pop-1", level: 0.2 },
  { at: cue.barEnd - 1, file: "chime-graduate", level: 0.42 },
  { at: cue.liftOff - 8, file: "liftoff", level: 0.4 },
  { at: cue.settle - 4, file: "chime-end", level: 0.4 },
];

export const Soundtrack: React.FC<{ music: boolean; sfx: boolean }> = ({ music, sfx }) => {
  const frame = useCurrentFrame();
  const end = interpolate(frame, [T.total - 24, T.total - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      {music ? (
        <Sequence from={MUSIC_IN} layout="none" name="Music bed">
          <Audio src={staticFile("music/bed.mp3")} volume={MUSIC_LEVEL * end} />
        </Sequence>
      ) : null}
      {sfx
        ? hits.map((h, i) => (
            <Sequence key={i} from={h.at} layout="none" name={`sfx ${h.file}`}>
              <Audio src={staticFile(`sfx/${h.file}.wav`)} volume={h.level * end} />
            </Sequence>
          ))
        : null}
    </>
  );
};
