import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop, CoinShadow, Finish, Flare, Foreground, SpeedLines } from "./layers/Atmosphere";
import { EndOver } from "./scenes/End";
import { FeeOver, FeeUnder } from "./scenes/Fee";
import { LaunchOver, LaunchUnder } from "./scenes/Launch";
import { OpenUnder } from "./scenes/Open";
import { OtcOver, OtcUnder } from "./scenes/Otc";
import { ShieldOver, ShieldUnder } from "./scenes/Shield";
import { Soundtrack } from "./sound/Soundtrack";
import { CoinStage } from "./three/CoinStage";
import { c } from "./theme";
import { prog } from "./timing";
import { MotionBlur } from "./ui";
import { boardLive, camera, cameraVelocity, coinVelocity, worldTransform } from "./world";

export type FilmProps = {
  /** The address on the end card. It is the only place the domain appears. */
  domain: string;
  /** Show the X handle next to the domain. */
  showHandle: boolean;
  music: boolean;
  sfx: boolean;
};

/**
 * The film, back to front:
 *   backdrop        colour, light and dust that slide past at their own speeds
 *   world (under)   each scene's objects: streams, the vessel, cards, the price line, the tower
 *   the coin        a 3D canvas: the pearl coin and its two orbs
 *   flare           a streak of light through the coin when it catches the light
 *   world (over)    type and the things that fly in front of the coin
 *   foreground      big soft discs close to the lens
 *   finish          vignette and grain
 * Both world layers and the coin share one camera (world.ts), so the whole film is a single continuous move.
 */
export const Film: React.FC<FilmProps> = ({ domain, showHandle, music, sfx }) => {
  const frame = useCurrentFrame();
  const cam = camera(frame);
  const camV = cameraVelocity(frame);
  const coinV = coinVelocity(frame);
  const world = { transform: worldTransform(cam), transformOrigin: "0 0" } as const;
  const live = (name: Parameters<typeof boardLive>[0]) => boardLive(name, frame);
  const fadeIn = prog(frame, 0, 8);

  return (
    <AbsoluteFill style={{ backgroundColor: c.bg }}>
      <Backdrop />
      <SpeedLines />

      <MotionBlur id="blur-under" velocity={camV}>
        <AbsoluteFill style={world}>
          {live("open") ? <OpenUnder /> : null}
          {live("fee") ? <FeeUnder /> : null}
          {live("otc") ? <OtcUnder /> : null}
          {live("shield") ? <ShieldUnder /> : null}
          {live("launch") ? <LaunchUnder /> : null}
        </AbsoluteFill>
      </MotionBlur>

      <CoinShadow />
      <MotionBlur id="blur-coin" velocity={coinV} strength={0.2}>
        <CoinStage />
      </MotionBlur>

      <Flare />

      <MotionBlur id="blur-over" velocity={camV}>
        <AbsoluteFill style={world}>
          {live("fee") ? <FeeOver /> : null}
          {live("otc") ? <OtcOver /> : null}
          {live("shield") ? <ShieldOver /> : null}
          {live("launch") ? <LaunchOver /> : null}
          {live("end") ? <EndOver domain={domain} showHandle={showHandle} /> : null}
        </AbsoluteFill>
      </MotionBlur>

      <Foreground />
      <Finish />
      <AbsoluteFill style={{ backgroundColor: "#07080A", opacity: 1 - fadeIn }} />

      <Soundtrack music={music} sfx={sfx} />
    </AbsoluteFill>
  );
};
