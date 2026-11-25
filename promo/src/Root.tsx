import React from "react";
import { Composition } from "remotion";
import { brand } from "./data";
import { Film, type FilmProps } from "./Film";
import { FPS, H, W } from "./theme";
import { T } from "./timing";

export const Root: React.FC = () => {
  return (
    <Composition
      id="GantryPromo"
      component={Film}
      durationInFrames={T.total}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{ domain: brand.domain, showHandle: Boolean(brand.xHandle), music: true, sfx: true } satisfies FilmProps}
    />
  );
};
