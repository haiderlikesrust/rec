# Gantry promo film

A 29.5 second, 1920×1080, 30 fps promo built with [Remotion](https://www.remotion.dev) 4. It is a standalone
project: it is **not** part of the pnpm workspace and has its own lockfile.

```
cd promo
pnpm install --ignore-workspace
pnpm run studio      # preview and scrub in the browser
pnpm run render      # out/gantry-promo.mp4  (H.264, CRF 18, AAC)
pnpm run poster      # out/poster.png        (frame 842, the end card)
```

A full render takes under a minute on a machine with a GPU. `pnpm run still -- out/frame.png --frame=510` renders
any single frame.

## How the film is put together

The whole film is one continuous camera move through a flat "world". Each scene is a 1920×1080 board somewhere in
that world; the camera travels from board to board, and the coin, the fee streams and the dust cross the gaps.

| Seconds | Scene | File |
| --- | --- | --- |
| 0 – 3 | Cold open: the coin, the mark, the name, one line | `src/scenes/Open.tsx` |
| 3 – 9 | Every trade pays 3%: the fee stream and its split | `src/scenes/Fee.tsx` |
| 9 – 15 | OTC reserve: the vessel fills, the sell card pays out | `src/scenes/Otc.tsx` |
| 15 – 21 | Heat Shield: the price drops, the shield catches, the payout | `src/scenes/Shield.tsx` |
| 21 – 25 | Launch: the tower, the graduation bar, lift-off | `src/scenes/Launch.tsx` |
| 25 – 29.5 | End card: logo, slogan, address, fine print | `src/scenes/End.tsx` |

- `src/timing.ts`: the clock. Scene starts (`T`), every cue inside the scenes (`cue`), easings. The music is
  120 BPM and enters one second in, so a beat is 15 frames and downbeats fall on the odd seconds.
- `src/world.ts`: where the boards are, where things sit on them (`L`), the camera path (`moves`) and the coin's
  flight path (`flights`). Everything is a pure function of the frame number.
- `src/three/`: the 3D layer (`@remotion/three`): the pearl coin and its two orbs, rebuilt from the home page's
  `web/components/home/CoinScene.tsx`.
- `src/layers/Atmosphere.tsx`: backdrop colour, parallax dust, speed lines, lens flare, vignette and grain.
- `src/ui.tsx`: the building blocks (word-by-word type, cards, pills, the logo drawing itself, fee streams, the
  directional motion blur).
- `src/sound/Soundtrack.tsx`: the music bed and where each sound effect lands.

## Changing the copy, the brand or the domain

- **Brand strings, numbers and the logo are not typed here.** `scripts/sync-brand.mjs` copies them from
  `packages/shared/src/{brand,fees,quotes}.ts` and `web/components/LogoMark.tsx` into `src/generated/brand.json`
  every time you run `studio`, `render` or `poster`. Change them at the source and re-render. The tokenized-stocks
  chip in the launch scene appears only while `quotes.ts` has a `stock` category with entries.
- **Every line of copy** is in `src/data.ts` (`copy`), together with the example figures (`demo`). The payout shown
  is always the loss times the top tier, so the numbers stay consistent.
- **The domain** appears only on the end card and is a prop. It defaults to `brand.domain`. To render with another
  address, copy `props.example.json`, edit it and pass it (inline JSON does not work in Windows shells, a file does):

  ```
  pnpm exec remotion render src/index.ts GantryPromo out/gantry-promo.mp4 --props=./props.json
  ```

  The other props: `showHandle` (the X handle next to the address), `music` and `sfx` (set both to `false`, or pass
  `--muted`, for a silent cut).
- **Timing**: move a cue in `src/timing.ts`; the picture, the coin and the sound all read the same numbers.

## Sound

- `public/music/bed.mp3`: a 30 second instrumental generated with ElevenLabs Music v2.5 through Higgsfield
  (120 BPM, C sharp major). Higgsfield's terms give the account holder ownership and commercial use of generations.
- `public/sfx/*.wav`: synthesised from sine waves and filtered noise by `scripts/make-sfx.mjs` (`pnpm run sfx`
  regenerates them). Nothing is sampled, so there is nothing to license. The chimes are tuned to the bed.
- `public/unused/background-plate-kling.mp4`: a generated background plate that was tried and left out (it made the
  picture muddier). It is not referenced by the film; delete it if you like.

The typeface is Figtree (SIL Open Font License), loaded by `@remotion/google-fonts` at render time, so a render
needs network access to Google Fonts.

## Rendering notes

- three.js needs a real GL backend in headless Chromium. `remotion.config.ts` sets
  `Config.setChromiumOpenGlRenderer("angle")`, which uses the GPU and falls back to software. On a machine without
  a GPU (CI, most cloud instances) pass `--gl=swangle`; it is slower but renders the same picture. If you render
  through the Node API instead of the CLI, pass `chromiumOptions: { gl: "angle" }` yourself: the config file only
  applies to CLI commands.
- Quality settings are also in `remotion.config.ts`: JPEG frames at quality 96, H.264 at CRF 18, preset `slow`,
  `yuv420p`, BT.709. Lower the CRF for a larger, cleaner master.
- `--scale=2` renders 3840×2160 from the same composition.

## Licences

Remotion is free for individuals, for-profit organisations with up to 3 employees and non-profits. A larger company
needs a company licence (see https://www.remotion.dev/docs/license/pricing and `node_modules/remotion/LICENSE.md`).
