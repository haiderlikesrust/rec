# Cushion design system

"Night & ember", dark only. A deep navy base (never black) with a slow aurora behind everything, rounded **Fredoka**
display type over **Nunito**, soft-shadowed panels with barely-there edges, pill buttons. Friendly and confident,
never corporate. Adapted from the Ripburn "cloud & ember" system, tuned for one dark theme.

## Product facts the UI must reflect
- Every trade pays 3%. Meteora keeps its share; the rest is split **50% OTC reserve, 50% protection fund** (shown as `brand.landing`, "Soft Landing"). Nothing
  else: no buybacks, no burns from fees, no airdrops from fees, no platform token, 0% to creators and the team.
- **The Nest** (code name: bloodline): look-alike copies of a coin (CAT, C4T, C@T) join the original's Nest. While
  the leader leads, each copy sends its whole 50/50 split to the leader's OTC credit and protection pot. A copy
  launched while the leader is alive pays a $500 entry, airdropped to the leader's holders. Use `brand.nest` for the
  name in copy, the gold `nest` tokens for color, and a `Bird`/`Egg`-style lucide icon (the Nest uses `Egg`).
- Brand strings come from `brand` in `@cook/shared` (`brand.name`, `brand.tagline`, `brand.nest`…). Never hard-code
  "Recur" or a platform ticker.

## Tokens (app/globals.css)
- Surfaces: `bg-bg` page, `bg-elev` card, `bg-elev-2` raised/hover/active, `bg-sunk` inset wells and inputs.
- Text: `text-fg`, `text-muted` (secondary), `text-faint` (tertiary/meta).
- Lines: `border-line` (hairline), `border-line-strong` (hover/active, input edges).
- Brand: `--accent` ember → `--accent-2` gold. `.spectrum` (gradient background), `.text-spectrum` (gradient text,
  one phrase per headline at most), `.btn-primary` (the main action, with a light sweep).
- Meaning: `up`/`up-soft` mint (gains, buys, protection paying out), `down`/`down-soft` rose (losses, sells),
  `sky`/`sky-soft` (OTC, links, focus), `violet`/`violet-soft` (demo, misc), `nest`/`nest-soft` gold (the Nest).
- Buckets: always via `bucketColor[key]` from `lib/buckets.ts` (protection mint, OTC sky). There are two.
- Shadows: `shadow-card` (default), `shadow-pop` (floating, hover, featured).

## Utility classes
- `.surface`: card background + faint edge + soft shadow. Add `.surface-hover` for clickable cards (lift).
- `.ring-spectrum`: warm gradient edge, for one featured element per view, never more.
- `.glass`: translucent blurred background (sticky bars, sheets).
- `.font-display` (Fredoka): page titles, section titles, card titles, buttons, chips, big hero numbers.
- `.num`: tabular figures for every number, amount and address (same Nunito face, even widths).
- `.eyebrow`: small Fredoka uppercase label above titles and inside cards.
- `.squish` (gentle cushion bounce, the logo), `.shimmer` (skeletons), `.live-dot`, `.mask-fade-x`,
  `animate-fade-up`, `animate-marquee`, `animate-float`.

## Primitives (components/ui.tsx)
`Card` (`featured`, `hover`), `CardHeader` (`icon`), `Button` / `ButtonLink` (primary = ember gradient pill,
secondary, ghost, up, down; sizes sm/md/lg), `Badge` (neutral, outline, accent, up, down, sky, nest), `Eyebrow`,
`SectionHeading`, `PageHeader` (`eyebrow`), `IconTile`, `Skeleton`, `ErrorState`, `EmptyState`, `Segmented`,
`Field`, `Input`, `Stat`, `Row`, `Change` (`pill`), `AnimatedNumber`. Also `QuoteChip`, `CoinAvatar`, `Sparkline`,
`GraduationBar`, `FeeSplitBar`, `LogoMark` (the cushion).

## Rules
- Radii: cards `rounded-[24px]`, hero/feature blocks `rounded-[32px]`, inner wells `rounded-2xl`, inputs
  `rounded-2xl`, buttons/tabs/chips `rounded-full`.
- Spacing: card padding `p-5 sm:p-6` (feature blocks `p-6 sm:p-8`); long pages separate sections with
  `space-y-20 sm:space-y-28`; grids use `gap-4` (`gap-5` on wide layouts).
- Every page opens with `PageHeader` (eyebrow + display title + one-line sub), optionally a key metric aside.
- Layout: lead with what the visitor came for; use asymmetric two-column grids on desktop (`lg:grid-cols-[1.4fr_1fr]`
  and similar) instead of long single columns; group related numbers into one panel of stat tiles rather than many
  small cards; one featured element per view.
- Give each card a visual anchor: `IconTile` + a lucide icon tinted with the relevant meaning color.
- Numbers are big and confident: key metrics `num font-display text-3xl`+; meta in `text-xs text-faint`.
- Tables: inside `.surface rounded-[24px]`, `eyebrow`-style headers, row hover `bg-elev-2`, 14px vertical padding.
- Motion: soft and springy (fade-up on mount, hover lift, count-up numbers). Reduced motion is handled globally.
- Mobile: 16px gutters, no horizontal page scroll; tables scroll inside their container; tap targets ≥ 40px.
