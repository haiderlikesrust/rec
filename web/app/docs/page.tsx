import type { Metadata } from "next";
import {
  ArrowLeftRight,
  Coins,
  Crosshair,
  Flame,
  Gift,
  GraduationCap,
  Repeat,
  Rocket,
  Scale,
  ShieldCheck,
  Split,
  Waves,
  Calculator,
  Wallet,
} from "lucide-react";
import {
  PROTECTION_CAP_X_TAX,
  PROTECTION_EPOCH_BPS,
  RUG_COVERAGE_BPS,
  GRADUATION_MCAP_USD,
  START_MCAP_USD,
  brand,
  communityShareBps,
  coverageBpsForHold,
  protectionTiers,
  splitFees,
  volumeForFees,
} from "@cook/shared";
import { DocsNav, type DocsSection } from "@/components/docs/DocsNav";
import {
  CompareTable,
  Faq,
  H2,
  Personas,
  QuickJump,
  RiskCallout,
  RuleCard,
  ShareBars,
  SnipeChart,
  SplitList,
  StepCards,
  TierChart,
  FundingRatio,
} from "@/components/docs/DocsBlocks";
import { DocsTreasury } from "@/components/docs/DocsTreasury";
import { FeeFlowDiagram } from "@/components/docs/FeeFlowDiagram";
import { WorkedExample } from "@/components/docs/WorkedExample";
import { bucketColor } from "@/lib/buckets";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Docs",
  description: `How ${brand.name} works: a 3% fee on Meteora pools that goes back to traders, holders and burns.`,
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
  { id: "protection", label: "Protection fund", group: "Mechanics" },
  { id: "airdrops", label: "High-entry airdrop", group: "Mechanics" },
  { id: "wallets", label: "Treasury wallets", group: "Mechanics" },
  { id: "faq", label: "FAQ", group: "More" },
  { id: "risks", label: "Risks", group: "More" },
];

const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const VOLUME = volumeForFees(10_000);
const BEN_HOLD = 7 * 3600;
const BEN_PCT = coverageBpsForHold(BEN_HOLD) / 100;
const BEN_TIER = [...protectionTiers].reverse().find((t) => BEN_HOLD >= t.minHold)!;
const TOP_TIER_PCT = Math.max(...protectionTiers.map((t) => t.coverageBps)) / 100;
const SHARE = communityShareBps(false) / 10_000;
const SHARE_REF = communityShareBps(true) / 10_000;
const k = (n: number) => `$${n / 1000}k`;

export default function DocsPage() {
  const ten = splitFees(10_000 * SHARE);

  return (
    <div>
      <PageHeader
        eyebrow="Docs"
        title={
          <>
            How {brand.name} <span className="text-spectrum">works</span>
          </>
        }
        sub="Every coin pays a 3% fee on each buy and sell. Creators and the team take none of it: after Meteora's protocol share, it all comes back as burns, a SOL exit reserve, loss protection and airdrops to holders who bought high. Here's exactly how."
      />
      <QuickJump
        items={[
          {
            href: "#example",
            icon: Calculator,
            color: bucketColor.otcReserve,
            title: "Worked example",
            body: "Follow $10,000 of fees from one coin, bucket by bucket.",
          },
          {
            href: "#compare",
            icon: Scale,
            color: bucketColor.mainBuyback,
            title: "Compared",
            body: "Same volume on Pons, pump.fun and dividend tokens.",
          },
          {
            href: "#protection",
            icon: ShieldCheck,
            color: bucketColor.protection,
            title: "Protection rules",
            body: "Hold-time tiers, coin funding, caps and epochs.",
          },
        ]}
      />

      <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-16">
        <aside>
          <DocsNav sections={sections} />
        </aside>

        <article id="docs-article" className="prose-docs max-w-3xl min-w-0">
          <section id="overview" className="scroll-mt-24">
            <p className="!mt-0 text-lg leading-relaxed">
              {brand.name} is a coin launchpad on Solana. Every coin has a fixed 1B supply and trades in its own Meteora pool
              from the first second, paired with SOL, a stablecoin or one of 120+ tokenized stocks. Unlike Pons or pump.fun,{" "}
              <strong>none of the trading fee goes to the creator or the team</strong>. Every buy and sell pays 3%; after
              Meteora&apos;s protocol share, all of it goes back to the people trading: burns, a SOL exit reserve, a fund that
              covers losses, and airdrops to holders who are underwater.
            </p>
          </section>

          <H2 id="how" n={1}>
            How it works
          </H2>
          <StepCards
            steps={[
              {
                icon: Rocket,
                title: "Launch",
                body: `One transaction mints the coin and opens its Meteora bonding-curve pool against the quote you pick (SOL, USDC, NVDAx…). Every coin starts at a ${k(START_MCAP_USD)} market cap, whatever the pair.`,
              },
              {
                icon: Repeat,
                title: "Trade",
                body: "The pool itself charges 3% on the quote side of every buy and sell: 3% of what you pay on a buy, 3% of what you receive on a sell. It applies on Recur, Jupiter or any other app.",
              },
              {
                icon: Split,
                title: "Route",
                body: "Recur's fee wallet claims the fees from every pool and splits them into five buckets: it buys back and burns, swaps to SOL for the reserve and protection wallets, and funds the airdrop wallet.",
              },
              {
                icon: Waves,
                title: "Give back",
                body: "Holders who are underwater get hourly airdrops, sellers at a loss can claim coverage, anyone can exit into the OTC reserve, and supply keeps shrinking.",
              },
            ]}
          />
          <FeeFlowDiagram />

          <H2 id="split" n={2}>
            The 3% and where it goes
          </H2>
          <p>
            Meteora keeps its protocol share of the 3% ({Math.round((1 - SHARE) * 100)}% of the fee, or{" "}
            {Math.round((1 - SHARE_REF) * 100)}% on trades {brand.name} builds, because the fee wallet is the referral). The rest,{" "}
            {Math.round(SHARE * 100)}–{Math.round(SHARE_REF * 100)}% of every fee, is split the same way for every coin:
          </p>
          <SplitList />

          <H2 id="example" n={3}>
            Worked example: a coin that generates $10,000 in fees
          </H2>
          <p>
            At 3%, <strong>$10,000 of fees means about {$(VOLUME)} of trading volume</strong>. Meteora&apos;s protocol fee takes{" "}
            {$(10_000 * (1 - SHARE))}; here is exactly where the other {$(10_000 * SHARE)} goes, and the same coin at $20,000
            of fees ({$(volumeForFees(20_000))} volume). Every number simply doubles.
          </p>
          <WorkedExample />

          <H2 id="benefits" n={4}>
            Who benefits
          </H2>
          <p>Take the same coin, with {$(VOLUME)} of volume and $10,000 of fees, and follow five traders.</p>
          <Personas
            people={[
              {
                who: "Ava, the early seller",
                k: "coinBuyback",
                icon: Flame,
                tag: "Coin buyback",
                text: "Bought at launch and sold at 4×. She doesn't need anything back: the buybacks that lifted the price came partly from fees.",
              },
              {
                who: "Ben, who bought the top",
                k: "protection",
                icon: ShieldCheck,
                tag: "Protection fund",
                text: `Bought near the peak, held 7 hours, sold at a $120 loss. That's the ${BEN_TIER.label} tier: up to ${BEN_PCT}%, so ${$(120 * BEN_PCT / 100)} requested, paid in SOL. It's then scaled by the coin's funding ratio for that epoch and capped at ${PROTECTION_CAP_X_TAX}× the fee he paid.`,
              },
              {
                who: "Cara, still holding underwater",
                k: "airdrop",
                icon: Gift,
                tag: "High-entry airdrop",
                text: "Her average entry is above the current price, so she receives the hourly airdrop. If the price recovers above her entry she rotates out, and newer high-entry buyers rotate in.",
              },
              {
                who: "Dev, the whale exiting",
                k: "otcReserve",
                icon: ArrowLeftRight,
                tag: "OTC reserve",
                text: "Wants out of $400 worth without crashing the chart. He sells into the OTC reserve at TWAP with no slippage, up to the coin's limit, and gets SOL. The pool price doesn't move.",
              },
              {
                who: `Every holder, and every ${brand.mainTicker} holder`,
                k: "mainBuyback",
                icon: Flame,
                tag: "Double buyback & burn",
                text: `${$(ten.coinBuyback)} of this coin and ${$(ten.mainBuyback)} of ${brand.mainTicker} are bought on the open pool and burned. Supply only goes down.`,
              },
            ]}
          />

          <H2 id="compare" n={5}>
            Compared with Pons, pump.fun and dividend tokens
          </H2>
          <p>
            Same volume for everyone: <strong>{$(VOLUME)}</strong>. What does each model collect, and where does it go?
          </p>
          <CompareTable
            head={[brand.name, "Pons", "pump.fun", "Reflection / dividend tokens"]}
            rows={[
              {
                label: "Fee per trade",
                cells: ["3% of the quote side (Meteora pool fee)", "1% pool fee", "~1.25% bonding curve (0.95% protocol, 0.30% creator)", "1–3% (2% here)"],
              },
              { label: "Fees at this volume", cells: [$(10_000), $(3_333), "~$4,167", $(6_667)] },
              {
                label: "Creator take",
                cells: ["$0", "$2,333 (70%)", "~$1,000 (unless in Holder Rewards mode)", "Varies by token"],
                tones: ["good", "bad", "bad", "neutral"],
              },
              {
                label: "Team / protocol take",
                cells: [`$0 to ${brand.name} · ${$(10_000 * (1 - SHARE))} Meteora protocol fee`, "$200 (20% of the protocol's 30%)", "~$1,583 (protocol revenue not used for buybacks)", "—"],
                tones: ["good", "bad", "bad", "neutral"],
              },
              {
                label: "Buyback & burn",
                cells: [`${$(ten.mainBuyback + ten.coinBuyback)} (platform token + the coin itself)`, "$800 of PONS", "~$1,583 of PUMP (about half of protocol revenue)", "None"],
                tones: ["good", "neutral", "neutral", "bad"],
              },
              {
                label: "Returned to people who lost",
                cells: [`Up to ${$(ten.protection)} via the protection fund`, "$0", "$0", "$0"],
                tones: ["good", "bad", "bad", "bad"],
              },
              {
                label: "Exit liquidity",
                cells: [`${$(ten.otcReserve)} SOL reserve, ${$(ten.otcReserve * 2)} of OTC sell capacity`, "The pool only", "The pool only", "The pool only"],
                tones: ["good", "bad", "bad", "bad"],
              },
              {
                label: 'Who gets the "dividend"',
                cells: [
                  `${$(ten.airdrop)} to holders underwater, weighted by how far`,
                  "Nobody",
                  "Holders by balance & hold time ($20 min) in Holder Rewards mode",
                  "All holders by balance, whales first",
                ],
                tones: ["good", "bad", "neutral", "neutral"],
              },
            ]}
          />
          <ShareBars
            rows={[
              { name: brand.name, pct: Math.round(SHARE * 100), note: `${Math.round(SHARE * 100)}–${Math.round(SHARE_REF * 100)}% after Meteora's protocol share: burns, exit reserve, loss cover, airdrops`, highlight: true },
              {
                name: "pump.fun · Holder Rewards",
                pct: 62,
                note: "≈38% buybacks + 24% creator share streamed to holders by balance",
              },
              { name: "Pons", pct: 24, note: "PONS buybacks; 70% goes to the creator" },
            ]}
          />
          <p>
            <strong>Why this split is better for traders.</strong> Pons pays creators first; a trader gets nothing back unless
            they also hold PONS. pump.fun&apos;s Holder Rewards and classic reflection tokens pay a dividend{" "}
            <em>by balance</em>, so the biggest wallets collect most of it and the people who lost money get nothing.{" "}
            {brand.name} charges more per trade, but every dollar it collects is aimed at the people who need it: the ones underwater,
            the ones who sold at a loss, and anyone who needs to exit size. Burns still reward every holder.
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

          <H2 id="quotes" n={6}>
            Quote assets
          </H2>
          <RuleCard icon={Coins} color={bucketColor.otcReserve} title="SOL, stablecoins and 120+ stocks, always settled to SOL">
            <p>
              A coin can pair with SOL, stablecoins (USDC, USDT, EURC…) or more than 120 tokenized stocks and pre-IPO tokens:
              xStocks, Backpack stocks, PreStocks and Tessera. The pairing is fixed at launch.
            </p>
            <p>
              <strong>
                Every pair starts at a {k(START_MCAP_USD)} market cap and graduates at {k(GRADUATION_MCAP_USD)}
              </strong>
              , measured in USD. Each quote gets its own Meteora config, created at the quote&apos;s live USD price, so a coin
              paired with NVDAx starts at the same dollar value as one paired with SOL. Prices on the site are always shown in USD.
            </p>
            <p>
              Fees are collected in the quote asset. When the fee wallet splits them,{" "}
              <strong>the protection fund and OTC reserve shares are always converted to SOL</strong>, so both are one shared SOL
              balance whatever the pair. The coin buyback uses the quote directly, the {brand.mainTicker} buyback goes through
              SOL, and the airdrop is paid in the quote.
            </p>
            <p>
              Many tokenized stocks are Token-2022 mints. Meteora only accepts a Token-2022 quote once it has issued that mint a
              token badge, so a pair can be listed but not yet launchable.
            </p>
          </RuleCard>

          <H2 id="snipe" n={7}>
            Anti-snipe
          </H2>
          <RuleCard icon={Crosshair} color={bucketColor.coinBuyback} title="A launch-window fee that pays holders">
            <p>
              For the first 6 seconds after launch the pool&apos;s fee starts at 99% and decays exponentially to the normal 3%.
              It&apos;s Meteora&apos;s fee scheduler, so it applies to every buy and sell in that window, and the extra lands in
              the same five buckets: snipers end up paying holders. The creator&apos;s own first buy, bundled into the launch
              transaction, pays only 3%.
            </p>
            <SnipeChart />
          </RuleCard>

          <H2 id="graduation" n={8}>
            Graduation
          </H2>
          <RuleCard icon={GraduationCap} color={bucketColor.airdrop} title={`From the curve to DAMM v2 at ${k(GRADUATION_MCAP_USD)}`}>
            <p>
              Before graduation a coin trades on a Meteora Dynamic Bonding Curve. When the curve completes, at a{" "}
              {k(GRADUATION_MCAP_USD)} market cap, Meteora migrates its liquidity into a DAMM v2 pool with the same 3% quote-side
              fee. Nothing changes for holders: same coin, same fee, same five buckets.
            </p>
            <p>
              The migrated LP position is <strong>permanently locked</strong> to {brand.name}&apos;s fee wallet. Nobody can remove
              the liquidity; the fee wallet can only claim the trading fees it earns, which go into the buckets like every other
              fee.
            </p>
          </RuleCard>

          <H2 id="otc" n={9}>
            OTC reserve
          </H2>
          <RuleCard icon={ArrowLeftRight} color={bucketColor.otcReserve} title="30% of fees, as no-slippage exit liquidity">
            <ul>
              <li>30% of every fee, converted to SOL, goes to one shared reserve wallet. Each coin is credited with what it contributed.</li>
              <li>
                <strong>Sell limit</strong> = 2× the SOL a coin&apos;s fees contributed, minus what holders have already sold
                into it. It stays at 100% while the coin keeps paying fees (3 days), then fades linearly to 5% over the next 27
                days. <strong>Coins that pay more get higher limits; dead coins get next to nothing.</strong>
              </li>
              <li>One coin can draw at most 10% of the reserve at a time, and one wallet at most 5% of it per coin per day.</li>
              <li>
                Sellers are paid at the <strong>lower</strong> of spot and the 30-minute TWAP; buyers of the reserve&apos;s
                inventory pay the <strong>higher</strong>. Pumping the price for a few blocks doesn&apos;t help. OTC opens 30
                minutes after launch.
              </li>
              <li>
                OTC trades carry the same 3%, paid to the fee wallet in the same transaction and split like any other fee. SOL
                paid by inventory buyers restores that coin&apos;s credit.
              </li>
              <li>
                <strong>Atomic settlement.</strong> Every OTC trade is one Solana transaction signed by both you and the reserve
                wallet: your coins in, its SOL out. It settles completely or not at all, and the signed quote expires within a
                minute.
              </li>
            </ul>
          </RuleCard>

          <H2 id="protection" n={10}>
            Protection fund
          </H2>
          <RuleCard icon={ShieldCheck} color={bucketColor.protection} title="40% of fees, covering realized losses">
            <p>
              40% of every fee, converted to SOL. It only covers <strong>realized</strong> losses: you sold below your average
              entry. How much comes back depends on three things:{" "}
              <strong>how long you held, how much the coin paid into the fund, and how big the fund is</strong>.
            </p>
            <p>
              <strong>1. Hold time sets an &quot;up to&quot; rate.</strong> Markets are fast, so the tiers are minutes and hours.
              A coin flagged as a rug (creator or linked wallets dumped) gets {RUG_COVERAGE_BPS / 100}% whatever the hold time.
              The most any loss can be covered is {Math.max(TOP_TIER_PCT, RUG_COVERAGE_BPS / 100)}%.
            </p>
            <TierChart />
            <p className="!mt-6">
              <strong>2. Each coin can only draw its share of the fund.</strong> Every epoch has a budget (at most{" "}
              {PROTECTION_EPOCH_BPS / 100}% of the uncommitted fund). A coin gets a slice of it in proportion to what that coin has
              paid into the fund: its contributions divided by everyone&apos;s. If its traders&apos; requests add up to more than
              the slice, they are paid pro-rata. Coins that paid little in fees cover little; dead coins cover almost nothing.
            </p>
            <FundingRatio />
            <ul>
              <li>Each claim is capped at {PROTECTION_CAP_X_TAX}× the tax that wallet paid on that coin.</li>
              <li>
                Claims are batched into epochs at least 6 days apart. An epoch can commit at most {PROTECTION_EPOCH_BPS / 100}% of
                the uncommitted fund. The protection wallet&apos;s balance and every payout are public on-chain.
              </li>
              <li>
                Each epoch is computed from public trade data with the same open-source policy code the site uses. You claim in a
                transaction you co-sign with the protection wallet. Claims expire after 60 days and return to the fund.
              </li>
              <li>Excluded: creators on their own coins, protocol addresses, and wallet clusters that wash-trade.</li>
              <li>Losses are measured in SOL at the time of each trade, so they are comparable across pairs.</li>
            </ul>
          </RuleCard>

          <H2 id="airdrops" n={11}>
            High-entry airdrop
          </H2>
          <RuleCard icon={Gift} color={bucketColor.airdrop} title="10% of fees, to the holders who bought highest">
            <ul>
              <li>10% of every fee, kept in the coin&apos;s quote asset, paid every hour.</li>
              <li>
                Recipients are holders whose <strong>average entry is above the current price</strong>, weighted by how far
                underwater they are (balance × (entry − price)). There is a minimum of about $20 so dust wallets don&apos;t
                dilute it.
              </li>
              <li>
                The set is recomputed every epoch. When the price rises, holders now in profit drop out and newer high-entry
                buyers rotate in. When it falls, more holders qualify.
              </li>
              <li>
                Coins received by transfer count with a zero cost basis, so moving coins to a fresh wallet can&apos;t fake a
                high entry.
              </li>
              <li>Airdrops are pushed to your wallet from the airdrop wallet. If a transfer fails, it is retried next epoch.</li>
            </ul>
          </RuleCard>

          <H2 id="wallets" n={12}>
            Treasury wallets
          </H2>
          <RuleCard icon={Wallet} color="var(--accent)" title="Plain Solana wallets, not custom programs">
            <p>
              {brand.name} deploys no programs of its own. Trading runs entirely on Meteora&apos;s pools; the money that comes
              back lives in four ordinary Solana wallets run by the {brand.name} backend:
            </p>
            <ul>
              <li>
                <strong>Fee wallet</strong> claims every pool&apos;s fees (and owns the locked LP after graduation), then buys
                back, burns, converts to SOL and moves each bucket to its wallet.
              </li>
              <li>
                <strong>OTC reserve</strong> holds the SOL you can sell into and co-signs every OTC trade.
              </li>
              <li>
                <strong>Protection fund</strong> holds the SOL for loss claims and co-signs every claim.
              </li>
              <li>
                <strong>Airdrop wallet</strong> holds each coin&apos;s airdrop share in its quote asset and pushes it hourly.
              </li>
            </ul>
            <p>Every balance and transfer is public. Here they are, live:</p>
            <DocsTreasury />
          </RuleCard>

          <H2 id="faq" n={13}>
            FAQ
          </H2>
          <Faq
            items={[
              [
                "Why 3% when Pons charges 1%?",
                "Because none of it is extracted by the launchpad. A 1% fee where 70% goes to the creator returns nothing to traders. 3% where everything after Meteora's protocol share comes back funds an exit reserve, loss coverage, airdrops and two buybacks.",
              ],
              [
                "Does the creator earn anything?",
                "Not from fees. Creators earn the way everyone else does: by holding. They get the first buy at the launch price with no anti-snipe surcharge.",
              ],
              [
                "Can I farm the protection fund by wash trading?",
                `Each round trip costs about 6% in fees. Coverage is capped at ${PROTECTION_CAP_X_TAX}× the fee you paid, short holds earn little or nothing, each coin can only draw what it paid into the fund, epochs have a hard budget, and linked wallets are excluded. That limits abuse; it can't rule it out entirely.`,
              ],
              [
                "Why does my coverage depend on the coin?",
                "Because each coin can only draw its share of the fund, in proportion to what it has paid in. A busy coin that generated lots of fees can cover its traders well; a coin that paid little covers little, and a dead coin covers almost nothing. That stops quiet coins from draining what active coins paid for.",
              ],
              [
                "What happens to a dead coin's OTC credit?",
                "It fades to 5% over about a month of no fees. The SOL stays in the shared reserve, where active coins can use it.",
              ],
              [
                "Do trades through Jupiter or other apps pay the fee?",
                "Yes. The 3% is part of the Meteora pool itself, so every swap pays it no matter which app sends it.",
              ],
              [
                "Can liquidity be pulled?",
                "No. Before graduation the supply sits in Meteora's bonding curve, which nobody can withdraw from. At graduation it migrates to a DAMM v2 pool whose LP position is permanently locked.",
              ],
              [
                "Why backend wallets instead of on-chain programs?",
                "Meteora already provides audited pools, fees and migration. Keeping the fund logic in a backend means no new program to audit or upgrade, and policies like coverage tiers can evolve. The trade-off is trust: the wallets are controlled by Recur's keys, so their balances and transfers are public for anyone to check.",
              ],
            ]}
          />

          <H2 id="risks" n={14}>
            Risks
          </H2>
          <RiskCallout>
            <ul>
              <li>
                <strong>Protection is discretionary and capped. It is not insurance.</strong> Payouts depend on the fund&apos;s
                size, the epoch budget and the published rules. A coin can lose more than any coverage returns.
              </li>
              <li>
                <strong>The fund wallets are custodial.</strong> The OTC reserve, protection fund, airdrop and fee wallets are
                ordinary Solana wallets controlled by {brand.name}&apos;s backend keys. You are trusting the operator&apos;s key
                handling and its off-chain calculations of airdrops and claims. Every balance and transfer is public, but no
                program enforces the policy.
              </li>
              <li>
                <strong>Meteora takes a protocol share.</strong> 16–20% of every 3% fee goes to Meteora, not to the buckets.
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
      </div>
    </div>
  );
}
