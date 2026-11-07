import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  Calculator,
  Clock,
  Coins,
  Copy,
  Crosshair,
  Crown,
  Egg,
  Flame,
  Gauge,
  Gift,
  GraduationCap,
  Lock,
  Repeat,
  Rocket,
  Scale,
  ScanSearch,
  ShieldCheck,
  Split,
  Users,
  Wallet,
} from "lucide-react";
import {
  BLOODLINE,
  ENTRY_RENT_LAMPORTS,
  GRADUATION_MCAP_USD,
  LAUNCH_FEE_SOL,
  PROTECTION_CAP_X_TAX,
  PROTECTION_MIN_PAYOUT_SOL,
  PROTECTION_PAYOUT_BPS,
  RUG_COVERAGE_BPS,
  SNIPE,
  START_MCAP_USD,
  TAX_BPS,
  brand,
  communityShareBps,
  coverageBpsForHold,
  otcPolicy,
  protectionTiers,
  splitFees,
  volumeForFees,
} from "@cook/shared";
import { DocsLayout, type DocsSection } from "@/components/docs/DocsNav";
import {
  CompareTable,
  Faq,
  GlancePanel,
  H2,
  LAUNCH_FEE_METEORA_SHARE,
  Personas,
  PotExample,
  QuickJump,
  RiskCallout,
  RuleCard,
  RuleGrid,
  ShareBars,
  SnipeChart,
  SplitCards,
  StepCards,
  TierChart,
  bucketPct,
} from "@/components/docs/DocsBlocks";
import { DocsTreasury } from "@/components/docs/DocsTreasury";
import { FeeFlowDiagram } from "@/components/docs/FeeFlowDiagram";
import { WorkedExample } from "@/components/docs/WorkedExample";
import { bucketColor } from "@/lib/buckets";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Docs",
  description: `How ${brand.name} works: a 3% fee on Meteora pools, split 50/50 between a SOL exit reserve and a fund that pays back losses.`,
};

const sections: DocsSection[] = [
  { id: "overview", label: "Overview", group: "Start" },
  { id: "how", label: "How it works", group: "Start" },
  { id: "split", label: "The 3% and where it goes", group: "Start" },
  { id: "example", label: "Worked example: $10k & $20k", group: "Examples" },
  { id: "benefits", label: "Who benefits", group: "Examples" },
  { id: "compare", label: "Compared with Pons & pump.fun", group: "Examples" },
  { id: "quotes", label: "Quote assets", group: "Mechanics" },
  { id: "snipe", label: "Anti-snipe", group: "Mechanics" },
  { id: "graduation", label: "Graduation", group: "Mechanics" },
  { id: "otc", label: "OTC reserve", group: "Mechanics" },
  { id: "protection", label: brand.landing, group: "Mechanics" },
  { id: "nest", label: `The ${brand.nest}: copies`, group: "Mechanics" },
  { id: "wallets", label: "Treasury wallets", group: "Mechanics" },
  { id: "faq", label: "FAQ", group: "More" },
  { id: "risks", label: "Risks", group: "More" },
];

/** A section heading, numbered by its place in the nav. */
function Heading({ id, eyebrow, children }: { id: string; eyebrow: string; children: ReactNode }) {
  return (
    <H2 id={id} n={sections.findIndex((s) => s.id === id)} eyebrow={eyebrow}>
      {children}
    </H2>
  );
}

const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const k = (n: number) => `$${n / 1000}k`;
const TAX = TAX_BPS / 100;
const SHARE = communityShareBps(false) / 10_000;
const SHARE_REF = communityShareBps(true) / 10_000;
const METEORA_PCT = Math.round((1 - SHARE) * 100);
const METEORA_PCT_REF = Math.round((1 - SHARE_REF) * 100);
const OTC_PCT = bucketPct("otcReserve");
const PROT_PCT = bucketPct("protection");
const CREDIT_X = otcPolicy.creditMultiplierBps / 10_000;
const VOLUME = volumeForFees(10_000);
const BEN_HOLD = 7 * 3600;
const BEN_PCT = coverageBpsForHold(BEN_HOLD) / 100;
const BEN_TIER = [...protectionTiers].reverse().find((t) => BEN_HOLD >= t.minHold)!;
const TOP_TIER_PCT = Math.max(...protectionTiers.map((t) => t.coverageBps)) / 100;
const N = BLOODLINE;
// the share of supply a copy's entry buys at launch, on the same curve every coin starts on (3% fee)
const ENTRY_SUPPLY_PCT = (() => {
  const p0 = START_MCAP_USD / 1e9;
  const pm = GRADUATION_MCAP_USD / 1e9;
  const liquidity = (1e9 * Math.sqrt(p0) * pm) / (pm - p0);
  const out = liquidity * (1 / Math.sqrt(p0) - 1 / (Math.sqrt(p0) + (N.entryUsd * (1 - TAX_BPS / 10_000)) / liquidity));
  return (out / 1e9) * 100;
})();

export default function DocsPage() {
  const ten = splitFees(10_000 * SHARE);
  const twenty = splitFees(20_000 * SHARE);

  return (
    <div className="pb-8">
      <PageHeader
        eyebrow="Docs"
        title={
          <>
            How {brand.name} <span className="text-spectrum">works</span>
          </>
        }
        sub={`Every buy and sell pays ${TAX}%. Creators and the team take none of it: after Meteora's share, half becomes a SOL reserve you can sell into without slippage, and half pays back part of your losses. Here's exactly how.`}
      />
      <QuickJump
        items={[
          {
            href: "#example",
            icon: Calculator,
            color: "var(--accent)",
            title: "Worked example",
            body: "Follow $10,000 and $20,000 of fees from one coin to each half.",
          },
          {
            href: "#nest",
            icon: Egg,
            color: "var(--nest)",
            title: `The ${brand.nest}`,
            body: "Copies can launch, but they feed the coin they copied.",
          },
          {
            href: "#protection",
            icon: ShieldCheck,
            color: bucketColor.protection,
            title: `${brand.landing} rules`,
            body: "Hold-time tiers, each coin's pot, caps, and automatic payouts.",
          },
          {
            href: "#compare",
            icon: Scale,
            color: "var(--violet)",
            title: "Compared",
            body: "The same volume on Pons, pump.fun and dividend tokens.",
          },
        ]}
      />

      <div className="mt-14">
        <DocsLayout sections={sections}>
          <article id="docs-article" className="prose-docs max-w-4xl min-w-0 [&>p]:max-w-[46rem]">
            <section id="overview" className="mt-6 scroll-mt-36 lg:mt-0 lg:scroll-mt-28">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
                <p className="!mt-0 text-[17px] leading-relaxed">
                  {brand.name} is a coin launchpad on Solana. Every coin has a fixed 1B supply and trades in its own Meteora pool from
                  the first second, paired with SOL, a stablecoin, one of 120+ tokenized stocks or any token you paste in. Unlike Pons
                  or pump.fun, <strong>none of the trading fee goes to the creator or the team</strong>. Every buy and sell pays{" "}
                  {TAX}%; after Meteora&apos;s protocol share it&apos;s converted to SOL and split in half:{" "}
                  <strong>an OTC reserve</strong> anyone can sell into without slippage, and <strong>a {brand.landing} fund</strong> that
                  pays back part of realized losses. Copies of a coin can launch too, but they feed the original through its{" "}
                  {brand.nest}.
                </p>
                <GlancePanel
                  items={[
                    { value: `${TAX}%`, label: "on every buy and sell, quote side", color: "var(--accent)" },
                    { value: "0%", label: "to creators and the team" },
                    { value: `${OTC_PCT}%`, label: "of the rest to the OTC reserve", color: bucketColor.otcReserve },
                    { value: `${PROT_PCT}%`, label: `of the rest to the ${brand.landing} fund`, color: bucketColor.protection },
                  ]}
                />
              </div>
            </section>

            <Heading id="how" eyebrow="The basics">
              How it works
            </Heading>
            <StepCards
              steps={[
                {
                  icon: Rocket,
                  color: "var(--accent)",
                  title: "Launch",
                  body: `One transaction mints the coin and opens its Meteora bonding-curve pool against the quote you pick (SOL, USDC, NVDAx, any token). Every coin starts at a ${k(START_MCAP_USD)} market cap, whatever the pair.`,
                },
                {
                  icon: Repeat,
                  color: "var(--accent-2)",
                  title: "Trade",
                  body: `The pool itself charges ${TAX}% on the quote side of every buy and sell: ${TAX}% of what you pay on a buy, ${TAX}% of what you receive on a sell. It applies on ${brand.name}, Jupiter or any other app.`,
                },
                {
                  icon: Split,
                  color: "var(--violet)",
                  title: "Split",
                  body: `${brand.name}'s fee wallet claims the fees from every pool, swaps them to SOL and splits them in half: ${OTC_PCT}% to the OTC reserve, ${PROT_PCT}% to the ${brand.landing} fund.`,
                },
                {
                  icon: ShieldCheck,
                  color: bucketColor.protection,
                  title: "Cushion",
                  body: `Anyone can exit into the OTC reserve with no slippage, and sellers at a loss are paid part of it back automatically. Copies of a coin send their split to the original.`,
                },
              ]}
            />
            <FeeFlowDiagram />

            <Heading id="split" eyebrow="The fee">
              The {TAX}% and where it goes
            </Heading>
            <p>
              Meteora keeps its protocol share of the {TAX}% ({METEORA_PCT}% of the fee, or {METEORA_PCT_REF}% on trades {brand.name}{" "}
              builds, because the fee wallet is the referral). The rest, {Math.round(SHARE * 100)}–{Math.round(SHARE_REF * 100)}% of
              every fee, is converted to SOL and split the same way for every coin:
            </p>
            <SplitCards icon={{ protection: ShieldCheck, otcReserve: ArrowLeftRight }} />
            <p>
              <strong>That&apos;s the whole policy.</strong> Nothing goes to the creator or the team, and fees don&apos;t buy or burn
              anything. Coins are burned when someone sells into the OTC reserve: it burns everything it buys. The only exception to
              &quot;each coin funds its own halves&quot; is the {brand.nest}: a copy that doesn&apos;t lead sends both halves to the
              coin that does.
            </p>

            <Heading id="example" eyebrow="Run the numbers">
              Worked example: $10,000 and $20,000 of fees
            </Heading>
            <p>
              At {TAX}%, <strong>$10,000 of fees means about {$(VOLUME)} of trading volume</strong>, and $20,000 about{" "}
              {$(volumeForFees(20_000))}. Meteora&apos;s protocol share takes {$(10_000 * (1 - SHARE))} (or {$(20_000 * (1 - SHARE))}
              ); the other {$(10_000 * SHARE)} ({$(20_000 * SHARE)}) is converted to SOL and split in half:{" "}
              {$(ten.otcReserve)} to the OTC reserve and {$(ten.protection)} to the {brand.landing} fund ({$(twenty.otcReserve)} each at
              $20,000).
            </p>
            <WorkedExample />

            <Heading id="benefits" eyebrow="Four people">
              Who benefits
            </Heading>
            <p>Take the same coin, with {$(VOLUME)} of volume and $10,000 of fees, and follow four people.</p>
            <Personas
              people={[
                {
                  who: "Ben, who bought the top",
                  color: bucketColor.protection,
                  icon: ShieldCheck,
                  tag: brand.landing,
                  text: `Bought near the peak, held 7 hours, sold at a $120 loss. That's the ${BEN_TIER.label} tier: up to ${BEN_PCT}%, so ${$((120 * BEN_PCT) / 100)}, paid to his wallet in SOL about a minute after the sale, as long as it's within ${PROTECTION_CAP_X_TAX}× the fee he paid and ${PROTECTION_PAYOUT_BPS / 100}% of the coin's ${$(ten.protection)} pot.`,
                },
                {
                  who: "Dev, the whale exiting",
                  color: bucketColor.otcReserve,
                  icon: ArrowLeftRight,
                  tag: "OTC reserve",
                  text: `Wants out of $400 worth without crashing the chart. He sells into the OTC reserve at the lower of spot and the ${otcPolicy.twapSeconds / 60}-minute TWAP, with no slippage and well inside this coin's ${$(ten.otcReserve * CREDIT_X)} limit, and gets SOL. The pool price doesn't move.`,
                },
                {
                  who: "Eve, holding the original",
                  color: "var(--nest)",
                  icon: Egg,
                  tag: `The ${brand.nest}`,
                  text: `Holds DOGE. When DOG3 launches as a copy while DOGE is alive, its $${N.entryUsd} entry buys DOG3 its creator never gets, and Eve is one of the up to ${N.recipients} DOGE holders it's airdropped to; her entry is above the price, so her share counts extra. Every DOG3 trade then grows DOGE's OTC credit and ${brand.landing} pot.`,
                },
                {
                  who: "Every holder",
                  color: "var(--accent)",
                  icon: Flame,
                  tag: "OTC burns",
                  text: "The coins Dev sold weren't resold: the OTC reserve burns every coin it buys, in the same transaction that pays the seller. Each exit through it shrinks the supply for everyone still holding.",
                },
              ]}
            />

            <Heading id="compare" eyebrow="Side by side">
              Compared with Pons, pump.fun and dividend tokens
            </Heading>
            <p>
              Same volume for everyone: <strong>{$(VOLUME)}</strong>. What does each model collect, and where does it go?
            </p>
            <CompareTable
              head={[
                brand.name,
                { name: "Pons", logo: "/brand/pons.png" },
                { name: "pump.fun", logo: "/brand/pump-fun.svg" },
                "Reflection / dividend tokens",
              ]}
              rows={[
                {
                  label: "Fee per trade",
                  cells: [`${TAX}% of the quote side (Meteora pool fee)`, "1% pool fee", "~1.25% bonding curve (0.95% protocol, 0.30% creator)", "1–3% (2% here)"],
                },
                { label: "Fees at this volume", cells: [$(10_000), $(3_333), "~$4,167", $(6_667)] },
                {
                  label: "Creator take",
                  cells: ["$0", "$2,333 (70%)", "~$1,000 (unless in Holder Rewards mode)", "Varies by token"],
                  tones: ["good", "bad", "bad", "neutral"],
                },
                {
                  label: "Team / protocol take",
                  cells: [
                    `$0 to ${brand.name} · ${$(10_000 * (1 - SHARE))} Meteora protocol fee`,
                    "$200 (20% of the protocol's 30%)",
                    "~$1,583 (protocol revenue not used for buybacks)",
                    "—",
                  ],
                  tones: ["good", "bad", "bad", "neutral"],
                },
                {
                  label: "Protecting holders",
                  cells: [
                    `${$(10_000 * SHARE)}: 100% of what's left after Meteora`,
                    "$0",
                    "$0",
                    "$0",
                  ],
                  tones: ["good", "bad", "bad", "bad"],
                },
                {
                  label: "Exit liquidity",
                  cells: [`${$(ten.otcReserve)} SOL reserve, ${$(ten.otcReserve * CREDIT_X)} of OTC sell capacity`, "The pool only", "The pool only", "The pool only"],
                  tones: ["good", "bad", "bad", "bad"],
                },
                {
                  label: "Returned to people who lost",
                  cells: [`Up to ${$(ten.protection)} via the ${brand.landing} fund`, "$0", "$0", "$0"],
                  tones: ["good", "bad", "bad", "bad"],
                },
                {
                  label: "Token burns",
                  cells: [
                    "Every coin sold into the OTC reserve; none bought with fees",
                    "$800 of PONS bought back and burned",
                    "~$1,583 of PUMP bought back (about half of protocol revenue)",
                    "None",
                  ],
                  tones: ["neutral", "neutral", "neutral", "bad"],
                },
                {
                  label: 'Who gets the "dividend"',
                  cells: [
                    "Sellers at a loss and anyone exiting, never by balance",
                    "Nobody",
                    "Holders by balance & hold time ($20 min) in Holder Rewards mode",
                    "All holders by balance, whales first",
                  ],
                  tones: ["good", "bad", "neutral", "neutral"],
                },
              ]}
            />
            <ShareBars
              title="Share of fees that comes back to traders and holders"
              rows={[
                {
                  name: brand.name,
                  pct: Math.round(SHARE * 100),
                  note: `${Math.round(SHARE * 100)}–${Math.round(SHARE_REF * 100)}% after Meteora's protocol share, all of it exit liquidity and loss cover`,
                  highlight: true,
                },
                {
                  name: "pump.fun · Holder Rewards",
                  pct: 62,
                  note: "≈38% buybacks + 24% creator share streamed to holders by balance",
                },
                { name: "Pons", pct: 24, note: "PONS buybacks; 70% goes to the creator" },
              ]}
            />
            <p>
              <strong>Why this split is better for traders.</strong> Pons pays creators first; a trader gets nothing back unless they
              also hold PONS. pump.fun&apos;s Holder Rewards and classic reflection tokens pay a dividend <em>by balance</em>, so the
              biggest wallets collect most of it and the people who lost money get nothing. {brand.name} charges more per trade, but
              everything it collects after Meteora&apos;s share protects the people holding: half is SOL exit liquidity anyone can sell
              into, half pays back part of realized losses.
            </p>
            <p className="text-xs">
              Figures as of Oct 2026 from public docs; pump.fun changes its fees often. Sources:{" "}
              <a href="https://docs.ponsfamily.com/" target="_blank" rel="noreferrer">
                Pons docs
              </a>
              ,{" "}
              <a href="https://coinpaprika.com/education/launchpad-fees/" target="_blank" rel="noreferrer">
                Coinpaprika: launchpad fees
              </a>
              ,{" "}
              <a href="https://cryptobriefing.com/pumpfun-holder-rewards-cashback-deprecated/" target="_blank" rel="noreferrer">
                Crypto Briefing: pump.fun Holder Rewards
              </a>
              ,{" "}
              <a href="https://defillama.com/token/PUMP" target="_blank" rel="noreferrer">
                DefiLlama: PUMP
              </a>
              .
            </p>

            <Heading id="quotes" eyebrow="Pairs">
              Quote assets
            </Heading>
            <div className="my-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <RuleCard flush icon={Coins} color="var(--accent-2)" title="SOL, stablecoins, 120+ stocks, any token">
                <p>
                  A coin can pair with SOL, stablecoins (USDC, USDT, EURC…), more than 120 tokenized stocks and pre-IPO tokens
                  (xStocks, Backpack stocks, PreStocks, Tessera) or any token you paste in. The pairing is fixed at launch.
                </p>
                <p>
                  <strong>
                    Every pair starts at a {k(START_MCAP_USD)} market cap and graduates at {k(GRADUATION_MCAP_USD)}
                  </strong>
                  , measured in USD. Each quote gets its own Meteora config at its live USD price, so a coin paired with NVDAx
                  starts at the same dollar value as one paired with SOL.
                </p>
              </RuleCard>
              <RuleCard flush icon={Repeat} color={bucketColor.otcReserve} title="Always settled to SOL">
                <p>
                  Fees are collected in the quote asset. The fee wallet converts everything it claims to SOL before splitting it, so{" "}
                  <strong>the OTC reserve and the {brand.landing} fund are each one shared SOL balance</strong>, whatever the pair. Prices
                  on the site are always shown in USD.
                </p>
                <p>
                  Many tokenized stocks are Token-2022 mints. Meteora only accepts a Token-2022 quote once it has issued that mint a
                  token badge, so a pair can be listed but not yet launchable.
                </p>
              </RuleCard>
            </div>

            <Heading id="snipe" eyebrow="Launch window">
              Anti-snipe
            </Heading>
            <RuleCard icon={Crosshair} color="var(--accent)" title="A launch-window fee that pays holders">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.05fr] lg:items-center">
                <div>
                  <p>
                    For the first {SNIPE.seconds} seconds after launch the pool&apos;s fee starts at {SNIPE.startBps / 100}% and decays
                    exponentially to the normal {TAX}%. It&apos;s Meteora&apos;s fee scheduler, so it applies to every buy and sell in
                    that window, and the extra lands in the same 50/50 split: snipers end up paying into the reserve and the fund.
                  </p>
                  <p>The creator&apos;s own first buy, bundled into the launch transaction, pays only {TAX}%.</p>
                </div>
                <SnipeChart />
              </div>
            </RuleCard>

            <Heading id="graduation" eyebrow="Curve to pool">
              Graduation
            </Heading>
            <RuleCard icon={GraduationCap} color="var(--violet)" title={`From the curve to DAMM v2 at ${k(GRADUATION_MCAP_USD)}`}>
              <RuleGrid
                color="var(--violet)"
                items={[
                  {
                    title: "Before: a bonding curve",
                    icon: Gauge,
                    body: `A coin trades on a Meteora Dynamic Bonding Curve. Nobody can withdraw from it. When the curve completes, at a ${k(GRADUATION_MCAP_USD)} market cap, Meteora migrates the liquidity.`,
                  },
                  {
                    title: "After: DAMM v2, locked",
                    icon: Lock,
                    body: `The new DAMM v2 pool keeps the same ${TAX}% quote-side fee and the same 50/50 split. Its LP position is permanently locked to ${brand.name}'s fee wallet, which can only claim the trading fees it earns.`,
                  },
                ]}
              />
            </RuleCard>

            <Heading id="otc" eyebrow="Exit liquidity">
              OTC reserve
            </Heading>
            <RuleCard icon={ArrowLeftRight} color={bucketColor.otcReserve} title={`${OTC_PCT}% of fees, as no-slippage exit liquidity`}>
              <p>
                {OTC_PCT}% of every fee, converted to SOL, goes to one shared reserve wallet, and each coin is credited with what it
                contributed. You sell a coin straight to the reserve for SOL: no pool, no slippage, no price impact.
              </p>
              <RuleGrid
                color={bucketColor.otcReserve}
                items={[
                  {
                    title: "Sell limit",
                    icon: Gauge,
                    body: (
                      <>
                        {CREDIT_X}× the SOL a coin&apos;s fees contributed, minus what holders have already sold into it. It stays at 100%
                        while the coin keeps paying fees; after {otcPolicy.activeSeconds / 86_400} days without any it drops to{" "}
                        {otcPolicy.floorBps / 100}%, until the coin trades again.
                      </>
                    ),
                  },
                  {
                    title: "Caps",
                    icon: Users,
                    body: `One coin can draw at most ${otcPolicy.maxShareOfReserveBps / 100}% of the reserve at a time, and one wallet at most ${otcPolicy.walletDailyBps / 100}% of it per coin per day.`,
                  },
                  {
                    title: "Price",
                    icon: Clock,
                    body: `Sellers are paid at the lower of spot and the ${otcPolicy.twapSeconds / 60}-minute TWAP, so pumping the price for a few blocks doesn't help. OTC opens ${otcPolicy.twapSeconds / 60} minutes after launch.`,
                  },
                  {
                    title: "Burned on arrival",
                    icon: Flame,
                    body: "Every coin the reserve buys is burned in the same transaction that pays you. It never holds or resells coins, so each OTC exit permanently shrinks the supply.",
                  },
                  {
                    title: "Same fee",
                    icon: Split,
                    body: `OTC sales carry the same ${TAX}%, paid to the fee wallet in the same transaction and split 50/50 like any other fee.`,
                  },
                  {
                    title: "Atomic settlement",
                    icon: BadgeCheck,
                    body: `Every OTC sale is one Solana transaction signed by both you and the reserve: your coins in and burned, its SOL out. It settles completely or not at all, and the signed quote expires within ${otcPolicy.quoteTtlSeconds} seconds.`,
                  },
                ]}
              />
              <p className="!mt-5 text-[13.5px]">
                <strong>Coins that pay more get higher limits; dead coins get next to nothing.</strong> A copy that doesn&apos;t lead its{" "}
                {brand.nest} grows its leader&apos;s credit instead of its own.
              </p>
            </RuleCard>

            <Heading id="protection" eyebrow="Loss cover">
              {brand.landing}
            </Heading>
            <RuleCard icon={ShieldCheck} color={bucketColor.protection} title={`${PROT_PCT}% of fees, covering realized losses`}>
              <p>
                {PROT_PCT}% of every fee, converted to SOL. It only covers <strong>realized</strong> losses: you sold below your average
                entry. There&apos;s nothing to claim: about a minute after a losing sale, the payout arrives in your wallet. How much
                comes back depends on <strong>how long you held and how much the coin has left in its pot</strong>.
              </p>
              <p>
                <strong>1. Hold time sets an &quot;up to&quot; rate.</strong> Markets are fast, so the tiers are minutes and hours. A
                coin flagged as a rug (creator or linked wallets dumped) gets {RUG_COVERAGE_BPS / 100}% whatever the hold time. The most
                any loss can be covered is {Math.max(TOP_TIER_PCT, RUG_COVERAGE_BPS / 100)}%.
              </p>
              <TierChart />
              <p className="!mt-6">
                <strong>2. Each coin pays from its own pot.</strong> A coin&apos;s pot is what its fees put into the fund, minus what it
                has already paid its sellers. One payout can take at most {PROTECTION_PAYOUT_BPS / 100}% of what&apos;s left, so a single
                big loss can&apos;t empty it and the next seller still gets something. Coins that paid little in fees cover little; dead
                coins cover almost nothing.
              </p>
              <PotExample />
              <RuleGrid
                color={bucketColor.protection}
                items={[
                  { title: "Capped by your tax", body: `Payouts are capped at ${PROTECTION_CAP_X_TAX}× the tax that wallet paid on that coin, across all its payouts.` },
                  {
                    title: "Sent automatically",
                    body: `The ${brand.landing} wallet sends payouts in batches once a wallet is owed ${PROTECTION_MIN_PAYOUT_SOL} SOL. Nothing to claim and nothing expires.`,
                  },
                  {
                    title: "Public and reproducible",
                    body: "Every payout is computed from public trade data with the same open-source policy code the site uses. The wallet's balance and every transfer are on-chain.",
                  },
                  {
                    title: "Exclusions",
                    body: `Creators selling their own coin and protocol addresses aren't covered. Losses are measured in SOL at the time of each trade. A copy that doesn't lead its ${brand.nest} pays into its leader's pot, not its own.`,
                  },
                ]}
              />
            </RuleCard>

            <Heading id="nest" eyebrow="Copies">
              The {brand.nest}: copies feed the original
            </Heading>
            <p>
              A vamp copies a coin that&apos;s working, with the same name, a near-identical ticker like DOG3 or DÖGE and the same story,
              and tries to pull its buyers away. Other launchpads try to block copies. {brand.name} lets them launch, and puts them in
              the original&apos;s <strong>{brand.nest}</strong>, where they feed the coin they copied.
            </p>
            <StepCards
              color="var(--nest)"
              steps={[
                { icon: Crown, title: "DOGE launches", body: `The first coin with a name is the OG. While people trade it, it leads its ${brand.nest}.` },
                {
                  icon: Copy,
                  title: "DOG3 copies it",
                  body: `DOG3 joins DOGE's ${brand.nest}. Because DOGE is alive, DOG3's launch opens with a $${N.entryUsd} buy of DOG3 that its creator never receives: about ${ENTRY_SUPPLY_PCT.toFixed(1)}% of DOG3's supply, airdropped to DOGE's holders.`,
                },
                {
                  icon: Egg,
                  title: "DOG3 trades",
                  body: `While it doesn't lead, DOG3's whole 50/50 split goes to DOGE: the OTC half grows DOGE's OTC credit, the ${brand.landing} half DOGE's ${brand.landing} pot. Every DOG3 trade cushions DOGE's holders.`,
                },
                {
                  icon: Repeat,
                  title: "DOGE goes quiet",
                  body: `Once DOGE stops being alive, the best alive member leads. If that's DOG3, DOGE's split and every other copy's flow to DOG3: the ${brand.nest} follows whoever the market keeps alive.`,
                },
              ]}
            />
            <GlancePanel
              className="my-6 sm:grid-cols-4"
              items={[
                { value: `$${N.entryUsd}`, label: "entry a copy pays while its leader is alive", color: "var(--nest)" },
                { value: `≤${N.recipients}`, label: "of the leader's holders share it", color: "var(--nest)" },
                { value: `${N.maxEntryBoost}×`, label: "most a holder's weight is boosted", color: "var(--nest)" },
                { value: `${N.maxShareBps / 100}%`, label: "most any one holder gets", color: "var(--nest)" },
              ]}
            />
            <RuleCard icon={Egg} color="var(--nest)" title="The rules">
              <RuleGrid
                color="var(--nest)"
                items={[
                  {
                    title: "Who's in a Nest",
                    icon: ScanSearch,
                    body: (
                      <>
                        Coins whose ticker or name reads the same once look-alike characters are folded together: 0 reads as O, 1 and L
                        as I, 4 and @ as A, 5 and $ as S, Cyrillic and Greek look-alikes as their Latin twins, with accents, spaces and
                        punctuation dropped. DOGE, DOG3, DÖGE and &quot;Doge&quot; all read as DOGE.
                      </>
                    ),
                  },
                  {
                    title: "Who leads",
                    icon: Crown,
                    body: `The OG, while it's alive: at least ${N.aliveTraders} traders and $${N.aliveVolumeUsd} of volume in the last ${N.aliveHours} hours. Otherwise the alive member with the best mix of ${N.aliveHours}-hour volume, traders and market cap. If every member is quiet, the best member over its whole life.`,
                  },
                  {
                    title: "What copies send",
                    icon: Split,
                    body: `Every member that doesn't lead sends its whole 50/50 split to the leader: the OTC half grows the leader's OTC credit (${CREDIT_X}× sell capacity), the ${brand.landing} half the leader's ${brand.landing} pot.`,
                  },
                  {
                    title: "The entry",
                    icon: Gift,
                    body: `A copy launched while its leader is alive pays $${N.entryUsd} in its pair's token as the launch's first buy, ahead of its creator's own, plus about ${(ENTRY_RENT_LAMPORTS / 1e9).toFixed(2)} SOL for the recipients' token accounts. The launcher never receives those coins: the fee wallet holds them until they're airdropped to up to ${N.recipients} of the leader's holders, weighted by what each put in, counted up to ${N.maxEntryBoost}× for holders whose entry is above the price, none over ${N.maxShareBps / 100}%.`,
                  },
                  {
                    title: "Who doesn't pay",
                    icon: BadgeCheck,
                    body: `Normal launches pay nothing extra. Neither does a copy launched while every member is quiet: it still sends its split to the leader until it leads itself. Coins received by transfer don't count toward an entry share, and neither coin's creator gets any.`,
                  },
                  {
                    title: "No way around it",
                    icon: Lock,
                    body: `A copy created straight on Meteora with a ${brand.name} config skips the launch form but not the rules: it still feeds its leader, and if it skipped the entry it's left off every ${brand.name} list.`,
                  },
                ]}
              />
            </RuleCard>

            <Heading id="wallets" eyebrow="Where the money sits">
              Treasury wallets
            </Heading>
            <RuleCard icon={Wallet} color="var(--accent)" title="Plain Solana wallets, not custom programs">
              <p>
                {brand.name} deploys no programs of its own. Trading runs entirely on Meteora&apos;s pools; the money that comes back
                lives in three ordinary Solana wallets run by the {brand.name} backend. Every balance and transfer is public. Here they
                are, live:
              </p>
              <DocsTreasury />
            </RuleCard>

            <Heading id="faq" eyebrow="Questions">
              FAQ
            </Heading>
            <Faq
              items={[
                [
                  "Does the creator earn anything?",
                  "Not from fees. Creators earn the way everyone else does: by holding. They get the first buy at the launch price with no anti-snipe surcharge.",
                ],
                [
                  "Where do burns come from?",
                  "Fees don't buy or burn anything. Coins are burned when someone sells into the OTC reserve: the transaction that pays the seller burns the coins, so the reserve never holds or resells them.",
                ],
                [
                  `Can I farm the ${brand.landing} fund by wash trading?`,
                  `Each round trip costs about ${TAX * 2}% in fees. Sales within 5 minutes of buying earn nothing, coverage is capped at ${PROTECTION_CAP_X_TAX}× the fee you paid, and a coin only pays from its own pot, at most ${PROTECTION_PAYOUT_BPS / 100}% of it per payout, so a farmer mostly gets back fees they paid in. That limits abuse; it can't rule it out entirely.`,
                ],
                [
                  "Why does my coverage depend on the coin?",
                  `Because each coin pays only from its own pot: what its fees put into the fund, minus what it has paid out. A busy coin that generated lots of fees can cover its sellers well; a coin that paid little covers little, and a dead coin covers almost nothing. A copy that doesn't lead its ${brand.nest} pays into its leader's pot, so buying a copy gets you little cover from it.`,
                ],
                [
                  "What happens to a dead coin's OTC credit?",
                  `Nothing is taken away. If a coin goes ${otcPolicy.activeSeconds / 86_400} days without paying any fees, its OTC limit drops to ${otcPolicy.floorBps / 100}% and stays there. Fresh trading brings it straight back to 100%. The SOL never leaves the shared reserve, where active coins can use it.`,
                ],
                [
                  "Do trades through Jupiter or other apps pay the fee?",
                  `Yes. The ${TAX}% is part of the Meteora pool itself, so every swap pays it no matter which app sends it.`,
                ],
                [
                  "What if someone copies my coin?",
                  `Let them: it joins your coin's ${brand.nest}. While your coin leads, the copy's whole 50/50 split goes to your coin, growing its OTC credit and ${brand.landing} pot. If your coin was alive when the copy launched, the copy also paid a $${N.entryUsd} entry that was airdropped to your holders. If your coin goes quiet and a copy carries on, the copy leads instead.`,
                ],
                [
                  "What happens to the launch fee?",
                  `Each launch pays ${LAUNCH_FEE_SOL} SOL. Meteora keeps ${LAUNCH_FEE_METEORA_SHARE * 100}% and the rest is split like any fee: half to the OTC reserve, half to the ${brand.landing} fund, credited to the new coin (or to its ${brand.nest}'s leader, for a copy that doesn't lead).`,
                ],
                [
                  "Can liquidity be pulled?",
                  "No. Before graduation the supply sits in Meteora's bonding curve, which nobody can withdraw from. At graduation it migrates to a DAMM v2 pool whose LP position is permanently locked.",
                ],
                [
                  "Why backend wallets instead of on-chain programs?",
                  `Meteora already provides audited pools, fees and migration. Keeping the fund logic in a backend means no new program to audit or upgrade, and policies like coverage tiers can evolve. The trade-off is trust: the wallets are controlled by ${brand.name}'s keys, so their balances and transfers are public for anyone to check.`,
                ],
              ]}
            />

            <Heading id="risks" eyebrow="Before you trade">
              Risks
            </Heading>
            <RiskCallout>
              <ul>
                <li>
                  <strong>{brand.landing} is discretionary and capped. It is not insurance.</strong> Payouts depend on the fund&apos;s size,
                  each coin&apos;s pot and the published rules. A coin can lose more than any coverage returns.
                </li>
                <li>
                  <strong>The wallets are custodial.</strong> The fee wallet, OTC reserve and {brand.landing}{" "}
                  fund are ordinary Solana wallets controlled by {brand.name}&apos;s backend keys. You are trusting the operator&apos;s
                  key handling and its off-chain calculations of payouts, OTC limits and entry airdrops. Every balance and transfer is
                  public, but no program enforces the policy.
                </li>
                <li>
                  <strong>Meteora takes a protocol share.</strong> {METEORA_PCT_REF}–{METEORA_PCT}% of every {TAX}% fee goes to
                  Meteora, not to the two halves.
                </li>
                <li>
                  <strong>Buying a copy.</strong> While a copy doesn&apos;t lead its {brand.nest}, its fees build its leader&apos;s OTC
                  credit and {brand.landing} pot, so its own buyers get little exit room or loss cover from it.
                </li>
                <li>
                  <strong>The {brand.nest} matches tickers and names, not logos.</strong> A copy with a different name and ticker but
                  the same image isn&apos;t caught. An unrelated coin can also share a common word with another and land in its{" "}
                  {brand.nest}.
                </li>
                <li>
                  <strong>Token-2022 quotes.</strong> Many tokenized stocks are Token-2022 mints; a pair only works once Meteora has
                  issued that mint a token badge.
                </li>
                <li>Coins are issued by their creators, are highly volatile, and may have no value. Listing is not an endorsement.</li>
                <li>Tokenized-stock quote assets carry their issuer&apos;s risks and may be restricted in some jurisdictions.</li>
              </ul>
            </RiskCallout>
          </article>
        </DocsLayout>
      </div>
    </div>
  );
}
