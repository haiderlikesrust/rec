# Design system: minimalist, soft, dark

Dark only. The app should feel like a calm consumer wallet: a soft charcoal page, a few gently filled cards, round
shapes, lots of empty space and very few lines. Nothing shouts. This file is the spec for every page. The code is
`app/globals.css` (tokens, type roles, component classes), `components/ui.tsx` (primitives) and `components/shell/*`
(the frame).

Names: the product name is always `brand.name` and the concept names are `brand.shield` (the protection fund) and
`brand.fleet` (a family of same-ticker coins), all from `@gantry/shared`. Never type them as literals, in UI or in
comments that will be read as copy.

## 1. Principles

1. **One job per page.** The title, one plain sentence and the main action or the main list are visible without
   scrolling. Everything else is secondary, and secondary things go into tabs, a collapsed `<details>` or away.
2. **Space, not lines.** Things are separated by whitespace and a few quiet cards. The only lines are a faint
   divider between table rows and the barely visible edge of a card.
3. **Soft and round.** Cards have a 20px radius, inner blocks 14px, buttons and inputs 12px, badges and chips are
   pills, coin images are circles. Nothing has a hard corner or a hard shadow.
4. **Gentle contrast.** Three close charcoals (`surface`, `panel`, `raise`) and three inks. Text always meets AA;
   decoration stays faint.
5. **One typeface.** Figtree sets titles, text and numbers, in sentence case. DM Mono appears only where a wallet or
   contract address is shown.
6. **A quiet accent.** `signal` (a soft lavender) is for links, focus rings, active states and small highlights. The
   main action is a near-white button, not a coloured one. Every other colour carries a meaning.
7. **Gentle motion.** Short fades and small moves that ease out (150–250ms). Nothing blinks, scrolls by itself or
   bounces, and `prefers-reduced-motion` turns it all off.

## 2. Colour tokens

Defined once in `app/globals.css` (`:root`), exposed to Tailwind in the `@theme inline` block as `--color-*`.
Use the utility (`bg-panel`, `text-ink-2`, `border-rule`) in markup and the variable (`var(--panel)`) in inline
styles, SVG and charts. `toneVar` in `ui.tsx` maps a tone name to its variable.

| Token | Value | Utilities | Use |
| --- | --- | --- | --- |
| `surface` | `#0E0F12` | `bg-surface` | The page |
| `panel` | `#15161A` | `bg-panel` | Cards, menus, dialogs |
| `raise` | `#1C1D22` | `bg-raise` | Inner blocks, inputs, quiet buttons, hover fills |
| `rule` | white at 7% | `border-rule` | The edge of a card, the divider between table rows |
| `rule-strong` | white at 12% | `border-rule-strong` | A slightly firmer divider, the track of a progress bar |
| `edge` | white at 18% | `border-edge` | The outline of an input |
| `ink` | `#EDEEF0` | `text-ink` | Primary text and values; the fill of the main button |
| `ink-2` | `#A1A4AD` | `text-ink-2` | Secondary text: leads, descriptions, inactive nav |
| `ink-3` | `#858892` | `text-ink-3` | Tertiary: captions, units, timestamps, placeholders |
| `ink-inverse` | `#0E0F12` | `text-ink-inverse` | Text on a light or coloured fill |
| `signal` | `#A7A9FF` | `text-signal`, `bg-signal`, `border-signal` | Links, focus, active states, small highlights |
| `gain` | `#5DD39E` | `text-gain`, `bg-gain` | Up, buy, success |
| `loss` | `#F2777A` | `text-loss`, `bg-loss` | Down, sell, error, destructive |
| `shield` | `#6FD3E0` | `text-shield`, `bg-shield` | The protection fund (`brand.shield`) |
| `desk` | `#B7A6FF` | `text-desk`, `bg-desk` | The OTC reserve |
| `fleet` | `#E7C27D` | `text-fleet`, `bg-fleet` | The family of same-ticker coins (`brand.fleet`) |

Each of `signal`, `gain`, `loss`, `shield`, `desk`, `fleet` has a `-tint`: the colour at 12% over whatever is behind
it (`bg-gain-tint`, `var(--gain-tint)`). Tints are the soft fills of badges, notices and status lines. For a neutral
soft fill use white at a low opacity (`bg-white/5` … `bg-white/12`): it works on every surface. `black` exists only
for scrims (`bg-black/60`). Nothing else from the stock Tailwind palette exists: `bg-red-500`, `text-gray-400` and
friends produce no CSS.

`lib/buckets.ts` carries the hex of `shield` and `desk` for canvas charts; a chart that cannot read CSS variables
copies its colours from the table above.

Measured contrast (WCAG 2.x ratio; AA needs 4.5 for text):

| | on `surface` | on `panel` | on `raise` |
| --- | --- | --- | --- |
| `ink` | 16.5 | 15.6 | 14.5 |
| `ink-2` | 7.7 | 7.3 | 6.8 |
| `ink-3` | 5.4 | 5.1 | 4.8 |
| `signal` | 8.9 | 8.4 | 7.8 |
| `gain` | 10.3 | 9.7 | 9.0 |
| `loss` | 7.0 | 6.6 | 6.2 |
| `shield` | 11.0 | 10.4 | 9.7 |
| `desk` | 9.0 | 8.5 | 7.9 |
| `fleet` | 11.3 | 10.7 | 9.9 |

`ink-inverse` on solid fills: ink 16.5, fleet 11.3, shield 11.0, gain 10.3, desk 9.0, signal 8.9, loss 7.0.
A colour on its own tint (over `panel`): fleet 8.3, shield 8.1, gain 7.7, desk 6.9, signal 6.8, loss 5.6.
On a tint or a white fill, body text is `ink` or `ink-2` (5.4 or better). **`ink-3` drops to about 4 on tints: do not
use it there.** `rule`, `rule-strong` and `edge` are deliberately faint (1.2 to 1.8) and never carry meaning alone:
an input is also told apart by its fill, its label and its placeholder, and its focus state is a `signal` border
with a ring (8.4).

## 3. Type

Both faces load through `next/font/google` in `app/layout.tsx`.

| Face | CSS variable | How to apply | For |
| --- | --- | --- | --- |
| Figtree (variable) | `--font-figtree` | default, `font-sans` | Everything: titles, text, numbers, buttons |
| DM Mono (400, 500) | `--font-dm-mono` | `font-mono` | Wallet and contract addresses only |

| Role | Class | Size / line | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Page title (`h1`) | `display-1` | 28px → 40px fluid / 1.12 | 600 | -0.028em |
| Section title (`h2`) | `display-2` | 18px → 21px fluid / 1.25 | 600 | -0.018em |
| Card or block title (`h3`) | `display-3` | 16px / 1.35 | 600 | -0.01em |
| A title set by hand | `font-display` + size + `font-semibold` | yours | 600 | -0.02em |
| Lead under a page title | (set by `PageHeader`) | 16–17px / 1.625, `ink-2` | 400 | 0 |
| Body (default) | none | 15px / 1.6 | 400; 500 for names, 600 for emphasis | 0 |
| Small | `text-sm` | 14px | 400 | 0 |
| Fine print | `text-[13px]` | 13px | 400 | 0 |
| Caption | `label` | 13px / 1.4, `ink-3` | 500 | 0 |
| Line above a title | `eyebrow` | 13px / 1.4, `ink-2` | 500 | 0 |
| Button label | `.btn` (via `Button`) | 13 / 14 / 15px | 500 | -0.005em |
| Figure | `num` + size (`Stat` does it) | 16 / 22 / 28–36px | 600 | tight |
| Table number | `Td num` | 14px | 400 | 0 |
| Address | `font-mono text-[13px]` | 13px | 400 | -0.02em |
| Long-form | `longform` on the wrapper | 16px / 1.7, 68ch | 400 | 0 |

Rules:

- **Sentence case everywhere.** Titles are short sentences ("Sell to the reserve"), labels are ordinary words
  ("Market cap", "You pay", "You get"). Uppercase is allowed only inside a tiny badge, and nothing is letter-spaced.
- One `display-1` per page, and it is the `PageHeader`'s. Sections use `display-2`, cards use `display-3`.
- **Numbers are Figtree with figures of equal width.** Wrap a number in `.num`, or use `Stat`, `Row`, `Td num`,
  `Change`, `Tag`, so columns line up. Do not set numbers in the mono face.
- **DM Mono is for addresses only**: a wallet, a mint, a transaction signature. Not tickers, not amounts, not labels.
- Most blocks need no line above their title. Use `eyebrow` only where it adds something the title does not say.
- Plain language. Explain a concept in one short sentence the first time it appears.

## 4. Shape, spacing, sizes

**Radius** (`rounded-*` utilities; these are the only ones that exist):

| Utility | Value | For |
| --- | --- | --- |
| `rounded-sm` | 8px | Small media, focus targets around text links |
| `rounded-md` | 12px | Buttons, inputs, segmented controls, menu rows |
| `rounded-lg` | 14px | Inner blocks: notices, status lines, placeholders, a block inside a card |
| `rounded-xl` | 20px | Cards, menus |
| `rounded-2xl` | 28px | Dialogs and sheets |
| `rounded-full` | pill | Badges, chips, tabs, nav links, avatars, progress bars |

**Shadow**: one, `shadow-float`: soft, wide and low, only under things that float over the page (menus, dialogs,
sheets). Cards and buttons have none.

**Spacing and sizes**

- **Unit**: 4px. Use the Tailwind scale; reach for 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20.
- **Column and gutter**: the shell gives the page a centred column of `--content-max` (1200px) padded by `--gutter`
  (16px, 20px from 360, 24px from 640, 32px from 1024). Do not add your own page-level max-width or side padding,
  except a narrower measure for forms and prose (`max-w-2xl`, `.longform`).
- **Card padding**: `--card-pad`, 20px (24px from 640). `PanelHeader`, `PanelBody` and the first and last cells of a
  table inside a card all use it, so their edges line up. A `Stat` card in a `PanelGrid` is `p-5`.
- **Control heights**: button 32 / 40 / 48, input 44, segmented 32 / 40, tab 36, badge and tag 22, table head 44,
  table row 56 (44 dense). On phones the main action of a view is a 48px (`lg`) button.
- **Rhythm**: page = `space-y-10 lg:space-y-14` between the page header and each section; inside a section, heading
  to content is `space-y-5`; between cards `gap-4`.
- **Breakpoints**: Tailwind defaults. The shell changes at `lg` (1024px). Two-column layouts start at `lg`.
- **Always name the columns**: `grid-cols-1` on phones, `minmax(0, …)` in custom templates. A grid with no column
  class sizes its track to the widest child and overflows a 320px screen.
- **Layers**: page dock 35, navbar and tab bar 40, menus and popovers 50, dialogs 60. Do not invent z-indexes above
  30 for page content.

## 5. The shell

`app/layout.tsx` renders `Shell` (`components/shell/Shell.tsx`) around every page. Top to bottom:

| Piece | File | Behaviour |
| --- | --- | --- |
| Navbar | `shell/Navbar.tsx` | Stays at the top. It is clear while the page is at rest and becomes a translucent, blurred bar with a faint line under it once content scrolls beneath. 68px from 1024px: logo, a small "Demo" badge in demo mode, the six links in sentence case, the wallet on the right. The current link is `ink` on a soft pill and carries `aria-current="page"`. Under 1024px it is 60px: logo, badge and wallet only. |
| `<main id="content">` | `shell/Shell.tsx` | The page. Centred column, gutters, `--page-pt` above (28 / 40 / 56px). |
| Foot line | `shell/FootLine.tsx` | One quiet line at the end of the column: name, docs, X, one sentence of fine print. Not a sitemap; do not add columns to it. |
| Tab bar | `shell/TabBar.tsx` | Under 1024px only. Five items (Coins, Launch, OTC, the protection fund, Portfolio) as an icon over a short label, fixed to the bottom, 64px tall. The current tab's icon sits on a soft pill. Docs is reached from the foot line. |

A single very soft lavender glow sits behind the top of every page (the `.shell` background). It is the only
decoration: do not add gradients, patterns or glows of your own behind content.

Navigation lives in `shell/nav.ts`: Coins `/` (also lit on `/token/*`), Launch, OTC reserve, the protection fund,
Portfolio, Docs. An item with `tab: false` stays out of the tab bar.

Shell metrics are CSS variables. Read them instead of hard-coding pixel offsets:

| Variable | Under 1024px | From 1024px | Use |
| --- | --- | --- | --- |
| `--bar-h` | 60px | 68px | Navbar height |
| `--chrome-top` | 60px | 68px | Where sticky things stop: `top-chrome`, or `top-[calc(var(--chrome-top)+1.25rem)]` for a side column |
| `--chrome-bottom` | 64px + safe area | 0 | Height of the tab bar. `.dock` sits on top of it |
| `--gutter` | 16 / 20 / 24px | 32px | Page side padding; `bleed-x` cancels it |
| `--content-max` | 1200px | 1200px | Column width, gutters included |
| `--page-pt` | 28px / 40px from 640 | 56px | Space between the navbar and the page |
| `--card-pad` | 20px / 24px from 640 | 24px | Card padding |
| `--dock-h` | 68px while `html.has-dock` | 0 | Extra bottom padding for a page dock |

**A page's own bottom bar** (the buy/sell bar on a coin page): give it `className="dock lg:hidden"` and add
`has-dock` to `<html>` while it is mounted. `.dock` pins it directly above the tab bar; `has-dock` keeps the foot
line clear of it. Keep a dock at 68px including its top divider (or change `--dock-h` in `globals.css`).

**A block wider than the column** (a hero): the shell does not clip or cover the page. `bleed-x` runs a block to the
edges of the gutter; `bleed-screen` runs it the full width of the window. To start a hero directly under the navbar,
cancel the top padding with `-mt-[var(--page-pt)]`; to run it behind the navbar as well, use
`-mt-[calc(var(--page-pt)+var(--chrome-top))]`. The navbar is clear at the top of the page, so a hero shows through
it untouched.

`lib/useStickyTop` takes the offset of a sticky side column; pass the navbar height plus a gap (88 from 1024px).

## 6. Composing a page

```tsx
export default function OtcPage() {
  return (
    <div className="space-y-10 lg:space-y-14">
      <PageHeader
        title="Sell to the reserve"
        sub="Sell a coin you hold for SOL at a posted price, with no slippage."
        aside={<Stat label="In the reserve" value="$4,538" size="lg" />}
      />

      {/* the list on the left, the action on the right; stacked on phones */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel>
          <PanelHeader label="All coins" />
          <DataTable caption="Coins the reserve buys" minWidth={520}>…</DataTable>
        </Panel>
        <Panel>
          <PanelHeader label="Sell" />
          <PanelBody className="space-y-4">…</PanelBody>
        </Panel>
      </div>
    </div>
  );
}
```

- **Every page opens with `PageHeader`**: one `h1` in sentence case, one plain sentence, and optionally the page's
  single most important figure or action in `aside`.
- **Budget**: at most three sections on a page; at most three headline numbers; tables show at most five columns on
  desktop and three on phones (drop columns with `hidden lg:table-cell`). A number appears once per page.
- **Secondary detail** goes into `Tabs`, or a collapsed `<details>` ("How limits work", "More options"), or is
  deleted. When unsure whether something stays, remove it.
- **Cards**: a `Panel` for each thing, `gap-4` between them. Headline figures are a `PanelGrid` of `Stat`s
  (`grid-cols-1 sm:grid-cols-3`). Never put a card with an edge inside a card: a `Panel` inside a `Panel` becomes a
  borderless inner block, and a `PanelGrid` inside a `Panel` only lays its children out.
- **Two columns** from `lg`: the list or chart is the wide column, the action and its numbers the narrow one. On
  phones it stacks, with a `.dock` when the action must stay reachable. A side column that should stay in view:
  `lg:sticky lg:top-[calc(var(--chrome-top)+1.25rem)] lg:self-start`.
- **Tables**: straight inside a `Panel` with no padding, under a `PanelHeader` or `Tabs`. 56px rows for lists a
  visitor picks from; `dense` 44px rows for feeds. Names left, numbers right (`Th num` / `Td num`). Coin cell =
  `CoinAvatar` 32px + name (500) + `Tag` with the ticker. On phones give the table a `minWidth` so it scrolls inside
  its card.
- **Empty, loading, failed**: every data view has all three, kept short. `Skeleton` blocks sized like the content,
  `EmptyState` that says what will appear and offers the action, `ErrorState` when the request failed.
- **One primary button per view** (the near-white one). Buy and sell are `gain` and `loss`. Everything else is
  `secondary` or `ghost`.
- **Product numbers come from code**, never from a literal: `START_MCAP_USD`, `GRADUATION_MCAP_USD`,
  `CURVE_SOLD_SHARE`, `GRADUATION_RAISE_USD` and `feeBreakdown(venue, cluster)` in `@gantry/shared`.

## 7. Primitives (`components/ui.tsx`)

`Tone` = `"neutral" | "signal" | "gain" | "loss" | "shield" | "desk" | "fleet"`.

### Panel, PanelGrid, PanelHeader, PanelBody

| Component | Props |
| --- | --- |
| `Panel` | `as?: "div" \| "section" \| "article" \| "aside" \| "li" \| "form"`, `accent?: Tone` (tints the edge), `interactive?: boolean` (hover state of a clickable card), `className?`, any `div` attribute |
| `PanelGrid` | `className` (the columns), `as?: "div" \| "section" \| "ul" \| "dl"` |
| `PanelHeader` | `label: ReactNode`, `aside?: ReactNode`, `as?: "h2" \| "h3" \| "h4" \| "p"` (default `h3`), `className?` |
| `PanelBody` | `className?` (padding is `--card-pad`; pass spacing utilities) |

A `Panel` is a card: `panel` fill, a barely visible edge, 20px corners. Inside another `Panel` it turns into an
inner block (`raise` fill, 14px corners, no edge). `PanelGrid` is a grid with a gap in which every child becomes a
card; inside a `Panel` its children stay plain. `accent` ties a card to a concept (`shield`, `desk`, `fleet`) or,
with `signal`, marks the one card the view is about. A card does not clip its content: when a child with its own
background touches the card's corners, add `overflow-hidden` to the `Panel`.

```tsx
<PanelGrid className="grid-cols-1 sm:grid-cols-3">
  <Stat className="p-5" label="Volume today" value="$126.4K" />
  <Stat className="p-5" label={`In ${brand.shield}`} value="52.21 SOL" tone="shield" />
  <Stat className="p-5" label="In the OTC reserve" value="36.12 SOL" tone="desk" />
</PanelGrid>
```

### Button, ButtonLink, buttonClass

| Prop | Values |
| --- | --- |
| `variant` | `primary` (near-white, one per view), `secondary` (quiet `raise` fill), `ghost` (text only), `gain`, `loss` (soft green and red fills for buy and sell), `solid` (same look as `primary`). `ButtonLink` has no `gain`/`loss` |
| `size` | `sm` 32px, `md` 40px (default), `lg` 48px |
| `block` | full width |
| rest | `Button`: any `button` attribute. `ButtonLink`: `href` plus any anchor attribute |

Buttons are rounded 12px, sentence case, medium weight, with no border and no shadow. Hover is a slightly lighter
fill; pressing eases the button down a touch. A disabled button is a `raise` block with `ink-3` text.
`buttonClass({ variant, size, block })` returns the same classes for another element.

```tsx
<Button size="lg">Launch a coin</Button>
<ButtonLink href="/docs" variant="ghost">How it works</ButtonLink>
<Button variant={side === "buy" ? "gain" : "loss"} block size="lg">Buy</Button>
<label className={buttonClass({ variant: "secondary", size: "sm" })}>Upload<input type="file" hidden /></label>
```

### Badge, Tag, Marker, Change

| Component | Props | Use |
| --- | --- | --- |
| `Badge` | `tone?: Tone` (default `neutral`), `solid?: boolean`, `className?` | A status in a small pill, softly tinted in its tone. `solid` fills it; use for one or two states that must be seen first |
| `Tag` | `className?`, `title?` | A literal value in a small neutral pill: a ticker, a pair. Keeps its case. Add `font-mono` when it holds an address |
| `Marker` | `tone?: Tone`, `blink?: boolean`, `className?` | A 6px dot. `blink` makes it breathe slowly for something live |
| `Change` | `value: number \| null \| undefined`, `block?: boolean`, `className?` | A signed percentage in gain or loss; `block` puts it on a tinted pill. Renders `—` for no value |

```tsx
<Badge tone="gain">Graduated</Badge> <Badge tone="gain" solid>Official</Badge>
<Tag>$DOGE</Tag> <Tag className="font-mono">7xKp…3fQa</Tag>
<Marker tone="gain" blink /> <Change value={coin.change24h} />
```

### PageHeader, SectionHeading, Eyebrow

| Component | Props |
| --- | --- |
| `PageHeader` | `title`, `sub?` (one sentence), `aside?` (the main action or figure), `crumb?` (a small line above the title for a way back, e.g. a link "← Coins"), `className?` |
| `SectionHeading` | `title`, `sub?`, `aside?`, `className?` |
| `Eyebrow` | children, `dot?: string` (a CSS colour for a dot in front), `className?` |

```tsx
<PageHeader title="Your portfolio" sub="The coins you hold, how they are doing, and what you have been paid back." />
<SectionHeading title="Trending" aside={<ButtonLink href="/" variant="ghost" size="sm">All coins</ButtonLink>} />
```

### Stat, Row, AnimatedNumber

| Component | Props |
| --- | --- |
| `Stat` | `label`, `value`, `sub?`, `tone?: Tone`, `size?: "sm" \| "md" \| "lg"` (16 / 22 / 28–36px; one `lg` per view), `className?` |
| `Row` | `label`, `value`, `className?`: one line of a summary, label left, value right |
| `AnimatedNumber` | `value: number`, `format: (n) => string`, `className?`: shows the value at once and glides to a new one in about 300ms |

A `Stat` is a quiet caption above a clear number and draws no box of its own.

```tsx
<Stat label="In the reserve" value={<AnimatedNumber value={usdValue} format={usd} />} size="lg" />
<Row label="You get" value="1,204 FISH" />
```

### Segmented, Tabs

Both take `value`, `onChange`, `options: { value, label, disabled? }[]`, `className?`, `aria-label`. Arrow keys,
Home and End move the choice; only the chosen option is in the tab order.

| Component | Extra props | Use |
| --- | --- | --- |
| `Segmented` | `size?: "sm" \| "md"` (32 / 40px), `block?: boolean` | Pick one value of a setting: side, interval, sort. A soft rounded track, the chosen option on a lighter pill. `role="radiogroup"` |
| `Tabs` | options take `count?`; `aside?: ReactNode` | Switch between views of one card. A row of rounded labels, the current one on a soft fill. `role="tablist"`; you render the view |

```tsx
<Panel>
  <Tabs aria-label="Activity" value={tab} onChange={setTab}
    options={[{ value: "trades", label: "Trades", count: 1931 }, { value: "holders", label: "Holders" }]} />
  {tab === "trades" ? <TradesTable /> : <HoldersTable />}
</Panel>
```

### Field, Input, Textarea

| Component | Props |
| --- | --- |
| `Field` | `label`, `hint?` (right of the label), `error?` (below, in loss), `as?: "label" \| "div"` (use `div` around a group of controls), `className?` |
| `Input` | any `input` attribute, `mono?: boolean` (figures of equal width, for amounts), `invalid?: boolean` |
| `Textarea` | any `textarea` attribute, `invalid?: boolean` |

Inputs are 44px soft filled fields (`raise` fill, a faint outline, 12px corners). Focus turns the outline `signal`
and adds a soft ring. Text is 16px on phones so focusing a field does not zoom the page. The class is `.input` if
you need it on another element. For an icon or a unit inside an input, wrap it in a `relative` div, position the
adornment absolutely and pad the input (`pl-10`). Add `font-mono` to an input that holds an address.

```tsx
<Field label="You pay" hint="Balance 4.20 SOL" error={tooMuch && "More than your balance"}>
  <Input mono inputMode="decimal" placeholder="0.00" invalid={tooMuch} />
</Field>
```

### DataTable, Th, Td

| Component | Props |
| --- | --- |
| `DataTable` | `dense?: boolean`, `caption?: string` (screen readers), `minWidth?: number \| string`, `className?` |
| `Th` | `num?: boolean`, `align?: "left" \| "right" \| "center"`, `sorted?: "asc" \| "desc" \| false`, `onSort?: () => void`, any `th` attribute |
| `Td` | `num?: boolean` (right-aligned, figures of equal width), `align?`, any `td` attribute |

Write plain `<thead>`, `<tbody>` and `<tr>`; the look comes from `.data-table`: quiet sentence-case heads, roomy
rows, a faint divider between rows, a soft hover, no vertical lines. A row that navigates gets
`className="cursor-pointer"` and a real link in its first cell.

```tsx
<DataTable caption="Coins" minWidth={520}>
  <thead><tr><Th>Coin</Th><Th num>Price</Th><Th num sorted={dir} onSort={flip}>Today</Th></tr></thead>
  <tbody>{coins.map((c) => (
    <tr key={c.address}>
      <Td><Link href={`/token/${c.address}`} className="flex items-center gap-3">
        <CoinAvatar src={c.image} symbol={c.symbol} size={32} /><span className="font-medium">{c.name}</span><Tag>${c.symbol}</Tag>
      </Link></Td>
      <Td num>{usd(c.priceUsd)}</Td>
      <Td num><Change value={c.change24h} /></Td>
    </tr>))}</tbody>
</DataTable>
```

### States and notes

| Component | Props |
| --- | --- |
| `Skeleton` | `className` (size): a soft block that breathes |
| `EmptyState` | `title`, `detail?`, `action?`, `className?`: centred, no box of its own |
| `ErrorState` | `title?`, `detail?`, `className?`: centred, a small loss icon, announced as an alert |
| `Notice` | `tone?: Tone`, `title?`, `className?`, children: a soft tinted block (`loss` is announced as an alert) |
| `IconTile` | `color?: string` (any CSS colour), `size?: number`, `className?`: a soft rounded tile for an icon. Sparingly |

```tsx
<EmptyState title="No coins yet" detail="Coins you hold show up here." action={<ButtonLink href="/" variant="secondary" size="sm">Browse coins</ButtonLink>} />
<Notice tone="shield" title={brand.shield}>Payouts are capped and are not insurance.</Notice>
```

### Shared components outside `ui.tsx`

| Component | File | Notes |
| --- | --- | --- |
| `LogoMark`, `Wordmark`, `Logo` | `components/LogoMark.tsx` | The tower mark with round caps, drawn in `currentColor` (ink by default). `Wordmark` is `brand.name` in Figtree 600. The identity is this file plus `app/icon.svg` |
| `CoinAvatar` | `components/CoinAvatar.tsx` | `src`, `symbol`, `seed?`, `size?`: a round image, or a soft monogram |
| `QuoteChip`, `QuoteLogo` | `components/QuoteChip.tsx` | A pair in a small pill; a quote asset's logo in a circle |
| `GraduationBar` | `components/GraduationBar.tsx` | A smooth rounded progress bar: light while filling, gain with a check when graduated |
| `TxStatus` | `components/TxStatus.tsx` | The status line under a form: an icon for working, done or failed, then the message |
| `ConnectWallet`, `useWalletModal` | `components/wallet/*` | The wallet button (in the navbar already) and the dialog; open it with `useWalletModal().open()` |
| `AddressGlyph` | `components/wallet/AddressGlyph.tsx` | A soft round avatar derived from a wallet address, for lists of traders or holders |

### CSS classes and utilities

Classes: `panel` (+ `panel-interactive`), `panel-grid`, `panel-header`, `panel-body`, `tabs-row`, `dock`, `glass`
(the translucent blurred fill of the shell's bars), `btn` (+ `btn-primary|secondary|ghost|solid|gain|loss` and `btn-sm|md|lg`), `input`, `data-table`
(+ `is-dense`, cell classes `is-num`, `is-center`), `longform`, `link`, `display-1|2|3`, `eyebrow`, `label`, `num`.

Utilities: `font-display`, `bleed-x`, `bleed-screen`, `top-chrome`, `focus-inset`, `no-scrollbar`, `shadow-float`,
`backdrop-blur-md`, and the animations `animate-spin`, `animate-pulse`, `animate-fade`, `animate-enter`,
`animate-sheet`.

## 8. Motion

- Colour and fill changes: 180ms, easing out (the Tailwind `transition-*` default here).
- Something appearing (a menu, a popover): `animate-enter`, a 200ms fade with a 6px rise. A scrim: `animate-fade`.
  A dialog or sheet: `animate-sheet`, 240ms with a 20px rise.
- A clickable card rises 2px on hover (`interactive`); a button eases down slightly when pressed.
- Loading: `Skeleton` breathes (`animate-pulse`); a spinner is `animate-spin`.
- Nothing blinks, loops for decoration or moves by itself. `prefers-reduced-motion` reduces every animation and
  transition to nothing.

## 9. Accessibility

- Focus is a 2px `signal` outline, 2px outside the element, following its rounded shape. Inputs show a `signal`
  border and a soft ring instead. Inside clipped containers (menu rows, tab bar) use `focus-inset`. Never remove an
  outline without replacing it.
- The first tab stop is "Skip to content". Nav links carry `aria-current="page"`; tabs carry `aria-selected`.
- Colour never works alone: changes carry a sign, statuses carry a word or an icon, the current nav item carries a
  fill.
- Text is at least AA on its background (section 2). Lines and outlines are faint by design, so never rely on a
  line to say something.
- Icons next to text are `aria-hidden`. An icon-only control needs an `aria-label`.
- Tap targets: 44px or more for anything a thumb must hit on a phone (tab bar 64px, `lg` buttons 48px, inputs 44px).
- Dialogs trap focus, close on Escape and return focus to what opened them (see `WalletModal`).

## 10. Do and don't

| Do | Don't |
| --- | --- |
| Separate things with space and a few cards | Draw dividing lines or put boxes inside boxes |
| Use the near-white `primary` button for the one main action | Put two primary buttons in a view, or colour the main action |
| Keep `signal` for links, focus, active states and small highlights | Fill large areas or several buttons with `signal` |
| Write titles and labels in sentence case, in plain words | Use uppercase, letter-spacing or jargon |
| Set numbers with `.num` (`Stat`, `Row`, `Td num`) | Set numbers, tickers or labels in `font-mono` |
| Use `font-mono` for a wallet or contract address | Use `font-mono` anywhere else |
| Use `shield`, `desk`, `fleet` only for their concepts | Colour a chart series or an icon with a concept token because it looks good |
| Use `Badge` for a state and `Tag` for a literal value | Build one-off chips, or stack several loud tints in one row |
| Show at most three headline numbers and five table columns | Fill a page with rows of figures and side panels |
| Tuck secondary detail into `Tabs` or `<details>` | Put everything on the page at once |
| Read `--chrome-top` / `--chrome-bottom` for sticky and docked elements | Hard-code `top-20` or `bottom-0` against the shell |
| Name grid columns (`grid-cols-1`, `minmax(0,…)`) | Leave a grid without columns or put a wide flex row in an auto track |
| Use `brand.*` for the product and concept names | Type the product or concept names as string literals |
| Keep motion to short fades and small moves | Add blinking, looping or bouncing animation |
| Use `ink` or `ink-2` for text on a tint | Use `ink-3` on a tint, or `text-white` for text |
| Use the radius scale (`rounded-md` … `rounded-full`) and `shadow-float` for floating things | Use square corners, or shadows on cards |
