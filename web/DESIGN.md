# Recur design system

Premium-minimal, crypto-native but calm. The five fee buckets are the brand **spectrum**; it appears in the logo
ring, accent gradients, featured-card borders and every split visual. Dark-first, with a warm light theme.

## Tokens (app/globals.css)
- Surfaces: `bg-bg` page, `bg-elev` card, `bg-elev-2` raised/hover/active, `bg-sunk` inset wells and inputs.
- Text: `text-fg`, `text-muted` (secondary), `text-faint` (tertiary/meta).
- Lines: `border-line` (default hairline), `border-line-strong` (hover/active).
- Accent: `text-accent` / `bg-accent-soft`; `--accent-2` teal for gradients. Up/down: `text-up`, `bg-up-soft`, `text-down`, `bg-down-soft`.
- Buckets: always via `bucketColor[key]` from `lib/buckets.ts` (protection violet, OTC teal, platform burn amber, coin burn coral, airdrop blue).
- Shadows: `shadow-card` (default card), `shadow-pop` (floating/featured).

## Utility classes
- `.surface`: card background + hairline + shadow. Add `.surface-hover` for clickable cards (lift and pop shadow).
- `.ring-spectrum`: 1px spectrum gradient border, for one featured element per view, never more.
- `.glass`: translucent blurred background (sticky bars).
- `.spectrum` (background gradient), `.text-spectrum` (gradient text, used sparingly on display headlines).
- `.font-display` (Bricolage Grotesque, tight tracking): page titles, section titles, big hero numbers.
- `.num` (Geist Mono, tabular): every number, address, amount.
- `.eyebrow`: tiny mono uppercase label above titles and inside cards.
- `.shimmer` (skeletons), `.live-dot` (pulsing green dot), `.mask-fade-x`, `animate-fade-up`, `animate-marquee`, `animate-spin-slow`.

## Primitives (components/ui.tsx)
`Card` (`featured`, `hover`), `CardHeader` (`icon`), `Button` / `ButtonLink` (primary = gradient with glow, secondary, ghost, up, down; sizes sm/md/lg),
`Badge`, `Eyebrow`, `SectionHeading`, `PageHeader` (`eyebrow`), `IconTile` (tinted icon square), `Skeleton`,
`ErrorState`, `EmptyState`, `Segmented` (pill tabs), `Field`, `Input`, `Stat`, `Row`, `Change` (`pill`), `AnimatedNumber`.
Also `QuoteChip`, `CoinAvatar`, `Sparkline`, `GraduationBar`, `FeeSplitBar`, `LogoMark`, `home/FeeRing`.

## Rules
- Radii: cards `rounded-[22px]`, hero/feature blocks `rounded-[32px]`, inputs `rounded-2xl`, buttons `rounded-xl`, tabs/chips `rounded-full`.
- Spacing: card padding `p-5 sm:p-6` (hero cards `p-8`); sections separated by `space-y-20 sm:space-y-28` on long pages, `gap-4` grids.
- Every page opens with `PageHeader` (eyebrow + display title + one-line sub), optionally with a key metric aside.
- Use `IconTile` + lucide icons to give each card a visual anchor; tint with the relevant bucket color.
- Numbers are big and confident: key metrics `num text-2xl`+ or `font-display text-4xl`+; meta in `text-xs text-faint`.
- Tables: inside `.surface rounded-[22px]`, uppercase 11px faint headers, row hover `bg-elev-2`, 14px vertical padding.
- Motion: subtle only (fade-up on mount, hover lift, count-up numbers). Respect reduced motion (handled globally).
- Mobile: 16px gutters, no horizontal page scroll; tables scroll inside their container.
