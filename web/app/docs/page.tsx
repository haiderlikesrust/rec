import type { Metadata } from "next";
import {
  FLEET,
  GRADUATION_MCAP_USD,
  LAUNCH_RENT_SOL,
  PROTECTION_CAP_X_TAX,
  PROTECTION_MIN_PAYOUT_SOL,
  PROTECTION_PAYOUT_BPS,
  RUG_COVERAGE_BPS,
  START_MCAP_USD,
  brand,
  fleetKey,
  otcPolicy,
  protectionPayout,
  protectionTiers,
} from "@gantry/shared";
import { DocsIndex, type DocEntry } from "@/components/docs/DocsIndex";
import { FeeExample } from "@/components/docs/FeeExample";
import { FeeFlow } from "@/components/docs/FeeFlow";
import { Code, Details, DocSection, FigureTable, Prose } from "@/components/docs/blocks";
import { SUPPLY, curve, dollars, entryRentSol, entrySupplyPct, fee, graduatedPacePct, millions, otc, pct, share, solAmount } from "@/components/docs/figures";
import { PairsTable, ProgramsList, TokenMint, WalletsList } from "@/components/docs/live";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "How it works",
  description: `A two-minute guide to ${brand.name}: launching a coin, what every trade pays, where the fee goes, and the risks you should know.`,
};

// The order here is the order on the page. Other pages link to these ids (#launch, #fees, #otc, #protection, #fleet,
// #risks): rename one and you break those links.
const sections: DocEntry[] = [
  { id: "overview", label: "The idea in one minute" },
  { id: "launch", label: "Launching a coin" },
  { id: "fees", label: "The fee and where it goes" },
  { id: "graduation", label: "Graduating to Raydium" },
  { id: "otc", label: "Selling to the OTC reserve" },
  { id: "protection", label: "The protection fund" },
  { id: "fleet", label: "Copies and families" },
  { id: "risks", label: "Risks you should know" },
];
const title = (id: string) => sections.find((s) => s.id === id)!.label;

// ---------------------------------------------------------------- figures used in the copy

const c = fee.curve;
const p = fee.cpmm;
const topTier = Math.max(...protectionTiers.map((t) => t.coverageBps), RUG_COVERAGE_BPS);
const firstPaidTier = protectionTiers.find((t) => t.coverageBps > 0)!;
const tinyUsd = (v: number) => `$${v.toFixed(7).replace(/0+$/, "")}`;

// one payout, worked through with the same function the backend calls
const sample = { lossSol: 2, holdSeconds: 7 * 3600, rugged: false, taxPaidSol: 0.3, paidOnCoinSol: 0, potSol: 6 };
const payout = protectionPayout(sample);
const payoutLimit = { rate: "the hold-time rate", tax: "the fee limit", pot: "the pot" }[payout.limit];

// spellings that fold to the same ticker, and one more written in Cyrillic letters, which looks identical in print
const lookAlikes = ["C4T", "C@T", "Cát"].filter((t) => fleetKey(t) === fleetKey("CAT"));
const cyrillicCat = "САТ";

export default function DocsPage() {
  return (
    <div className="space-y-8 lg:space-y-12">
      <PageHeader title="How it works" sub="A two-minute guide to launching, trading and where every fee goes." />

      <div className="grid grid-cols-1 gap-x-16 gap-y-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-x-20">
        <DocsIndex sections={sections} />

        <article className="max-w-[40rem] min-w-0 space-y-14 lg:space-y-16">
          <DocSection id="overview" title={title("overview")}>
            <Prose>
              <p>
                {brand.name} is a place to launch and trade coins on Solana. Coins trade on Raydium: the site prepares each
                transaction and your own wallet signs it.
              </p>
              <p>
                What is different is the <a href="#fees">fee</a>. Every trade pays one, and{" "}
                <strong>none of it goes to the coin&apos;s creator or to the team</strong>. After Raydium&apos;s small cut, half goes to
                the <a href="#otc">OTC reserve</a>, a wallet of SOL that buys your coins at a posted price, and half goes to{" "}
                <a href="#protection">{brand.shield}</a>, a fund that pays back part of a loss when you sell for less than you paid.
              </p>
            </Prose>
            <Details summary={`Does ${brand.name} have its own token?`}>
              <Prose>
                <p>
                  Yes, ${brand.mainTicker}. It is shown first on the home page, and that is all of its special treatment: it gets no
                  share of anyone&apos;s fees and nothing buys it back. Its own trades pay the same fee as any other coin.
                </p>
              </Prose>
              <TokenMint />
            </Details>
          </DocSection>

          <DocSection id="launch" title={title("launch")}>
            <Prose>
              <p>
                To launch you need a name, a ticker, an image and a pair. The pair can be SOL, one of the main stablecoins, a
                tokenized stock or another token that Raydium&apos;s launchpad accepts. You sign one transaction, which creates the
                coin, opens its price curve and can include your first buy, so nobody trades ahead of you. It costs about{" "}
                {LAUNCH_RENT_SOL} SOL of network rent and no platform fee.
              </p>
              <p>
                Every coin has a supply of {SUPPLY / 1e9} billion and starts at a {dollars(START_MCAP_USD)} market cap, whichever pair
                it uses. From there the price rises a little with each buy and falls with each sell. If your ticker or name reads the
                same as a coin that already exists, your launch joins that coin&apos;s <a href="#fleet">family</a>, and the form tells
                you before you sign.
              </p>
              <p>
                Pairing with a tokenized stock, or with any token other than SOL, means your coin is priced and traded against
                that token: buyers pay in it and sellers are paid in it. Its market caps stay the same in dollars. Tokenized
                stocks are other companies&apos; products: the issuer can freeze or pause its token, and its own terms and regional
                restrictions apply to anyone who holds it. See the <a href="#risks">risks</a>.
              </p>
            </Prose>
            <Details summary="Which pairs are open right now">
              <Prose>
                <p>
                  A pair shows as unavailable while a coin can&apos;t be launched on it, and the other pairs stay open. That is
                  the case while a full curve would raise less than the minimum Raydium sets for the pair at today&apos;s price,
                  while the token has no good route to SOL, which its fees need to be paid out, or while its issuer has paused it.
                </p>
              </Prose>
              <PairsTable />
              <Prose>
                <p>
                  Some tokens, such as pre-IPO stock tokens, charge their own fee on every transfer, set by the issuer. A pair
                  like that is only ever listed with that fee shown, here and in the launch form, and it comes on top of the
                  trading fee. On any pair other than SOL you can still pay your first buy in SOL: the app swaps it through
                  Jupiter first, which is a second signature.
                </p>
              </Prose>
            </Details>
          </DocSection>

          <DocSection id="fees" title={title("fees")}>
            <Prose>
              <p>
                Every buy and sell pays a fee, taken from the pair&apos;s side of the trade: the SOL, stablecoin or other token the
                coin trades against. Raydium keeps a small part. The rest is converted to SOL and split in half between the OTC reserve and{" "}
                {brand.shield}. The fee is built into the pool on Raydium, so it is the same in any app that trades the coin.
              </p>
            </Prose>

            <FeeFlow />

            <Prose>
              <p>
                Once a coin has <a href="#graduation">graduated</a>, the fee is lower and most of it is earned by the pool&apos;s
                locked liquidity, which pays out half in the pair&apos;s token and half in the coin itself.
              </p>
            </Prose>

            <FigureTable
              caption="The fee on a trade after graduation and where it goes"
              head={["After graduation", "Share of each trade"]}
              rows={[
                ["Fee", pct(p.taxBps)],
                ["Raydium", pct(p.raydiumBps)],
                [`OTC reserve and ${brand.shield}, half each`, pct(p.bucketsBps)],
                ["Comes back in the coin and is burned", pct(p.burnedBps)],
              ]}
            />

            <Prose>
              <p>
                The last row is the honest catch. That part of every trade after graduation comes back as the coin and is burned,
                not sold. Burning shrinks the supply, but it puts nothing into the reserve or the fund, so a graduated coin fills
                them at about {graduatedPacePct}% of the earlier pace.
              </p>
            </Prose>

            <Details summary="A worked example">
              <FeeExample />
              <Prose>
                <p>After graduation the split between the two sides of the pool is an estimate until each collection settles.</p>
              </Prose>
            </Details>
            <Details summary="The three wallets and their addresses">
              <Prose>
                <p>
                  The money sits in three ordinary Solana wallets, so every balance and every transfer can be checked on an explorer.
                  The fee wallet&apos;s payments go out in equal pairs, one to each of the other two.
                </p>
              </Prose>
              <WalletsList />
              <Prose>
                <p>
                  The same addresses and balances are published at <Code>/api/stats</Code>.
                </p>
              </Prose>
            </Details>
          </DocSection>

          <DocSection id="graduation" title={title("graduation")}>
            <Prose>
              <p>
                About {curve.soldPct}% of a coin&apos;s supply is for sale on the curve. When all of it has been bought, the market
                cap is {dollars(GRADUATION_MCAP_USD)} and the coin graduates: Raydium moves the other {100 - curve.soldPct}% of the
                supply and the roughly {dollars(curve.raiseRoundUsd)} the curve raised into a regular Raydium pool. Trading stops for
                a few seconds while that happens.
              </p>
              <p>
                The pool&apos;s liquidity is locked for good. The fee wallet can collect the trading fees it earns, but nobody can
                withdraw it, the creator and the team included. From then on the coin trades in that pool.
              </p>
            </Prose>
            <Details summary="The exact numbers">
              <FigureTable
                caption="The curve and the pool in numbers"
                rows={[
                  ["Sold on the curve", `${share(curve.soldShare)} · ${millions(curve.soldCoins)} coins`],
                  ["Goes into the pool", `${share(1 - curve.soldShare)} · ${millions(curve.poolCoins)} coins`],
                  ["Raised by a full curve", `≈${dollars(Math.round(curve.raiseUsd))}`],
                  ["Price at launch", tinyUsd(curve.startPriceUsd)],
                  ["Price at graduation", `${tinyUsd(curve.graduationPriceUsd)}, ${curve.multiple}× higher`],
                ]}
              />
            </Details>
            <Details summary="The Raydium programs behind it">
              <ProgramsList />
            </Details>
          </DocSection>

          <DocSection id="otc" title={title("otc")}>
            <Prose>
              <p>
                The OTC reserve is a wallet of SOL that buys coins straight from holders. You ask for a quote and, if you accept, you
                get exactly that amount: the sale skips the coin&apos;s pool, so it does not move the price. The quote is the lower
                of the current price and the average of the last {otc.twapMinutes} minutes, minus a {pct(otcPolicy.spreadBps)} fee.
              </p>
              <p>
                The coins you sell are burned on the spot, and the reserve never sells. How much of a coin it will buy depends on how
                much that coin&apos;s trading has paid in.
              </p>
            </Prose>
            <Details summary="How limits work">
              <FigureTable
                caption="Limits on selling to the OTC reserve"
                rows={[
                  ["A coin's sell limit", `${otc.creditX}× the SOL its fees sent in`],
                  [`After ${otc.idleDays} days with no fees`, `${pct(otcPolicy.floorBps)} of that, until the next fee`],
                  ["One coin, at any moment", `${pct(otcPolicy.maxShareOfReserveBps)} of the reserve`],
                  ["One wallet, per coin, per day", `${pct(otcPolicy.walletDailyBps)} of the reserve`],
                  ["A quote stays valid for", `${otcPolicy.quoteTtlSeconds} seconds`],
                ]}
              />
              <Prose>
                <p>
                  A coin can be sold here once it has a full averaging window of price history. A sale to the reserve counts like
                  any other sale, so a loss on it can still be paid back by {brand.shield}.
                </p>
              </Prose>
            </Details>
          </DocSection>

          <DocSection id="protection" title={title("protection")}>
            <Prose>
              <p>
                The protection fund is called {brand.shield} on this site. When you sell a coin for less than it cost you, fees
                included, it sends part of that loss back to your wallet in SOL. There is nothing to claim: the payment usually
                arrives within a minute or two. How much you get back depends on how long you held.
              </p>
            </Prose>

            <FigureTable
              caption="Share of a loss that is paid back, by how long the coin was held"
              head={["Held for", "Paid back, up to"]}
              rows={[
                ...protectionTiers.map((t) => [t.label, pct(t.coverageBps)]),
                ["Any time, on a coin flagged as a rug", pct(RUG_COVERAGE_BPS)],
              ]}
            />

            <Prose>
              <ul>
                <li>
                  Across all your payouts on one coin, you can never get back more than {PROTECTION_CAP_X_TAX} times the fees you
                  paid on it.
                </li>
                <li>
                  Each coin pays from its own pot: what its fees have put into the fund, minus what it has paid out. One payout can
                  take at most {pct(PROTECTION_PAYOUT_BPS)} of that pot, so a coin that traded little can cover little.
                </li>
                <li>The clock starts at your first buy. Sell everything and buy again, and it starts over.</li>
                <li>Amounts under {PROTECTION_MIN_PAYOUT_SOL} SOL wait until they add up.</li>
              </ul>
            </Prose>

            <Details summary="What is not covered">
              <Prose>
                <ul>
                  <li>Losses on coins you still hold. Nothing is paid until you sell.</li>
                  <li>Sales within {firstPaidTier.minHold / 60} minutes of your first buy.</li>
                  <li>A creator selling their own coin.</li>
                  <li>Coins that were sent to you. They have no cost, so selling them is not a loss.</li>
                  <li>
                    Most of a loss on a <a href="#fleet">copy</a> that does not lead its family: its fees fill the leader&apos;s pot,
                    not its own.
                  </li>
                </ul>
                <p>
                  A coin is flagged as a rug when its creator has sold at least half of what they bought and the price is 70% or more
                  below its high. That is a rule of thumb: it misses a creator who sells through other wallets. If the fund cannot
                  cover the next payout, losses wait in line and are paid later, not reduced.
                </p>
              </Prose>
            </Details>
            <Details summary="An example payout">
              <Prose>
                <p>
                  You sell at a {sample.lossSol} SOL loss after holding for {sample.holdSeconds / 3600} hours. You have paid{" "}
                  {sample.taxPaidSol} SOL in fees on the coin, and its pot holds {sample.potSol} SOL. The hold-time rate of{" "}
                  {pct(payout.tierBps)} asks for {solAmount(payout.requestedSol)}, the fee limit allows{" "}
                  {solAmount(sample.taxPaidSol * PROTECTION_CAP_X_TAX)} and the pot allows{" "}
                  {solAmount((sample.potSol * PROTECTION_PAYOUT_BPS) / 10_000)}. You are paid the smallest of the three,{" "}
                  {solAmount(payout.payoutSol)}: here {payoutLimit} is what holds it back.
                </p>
              </Prose>
            </Details>
          </DocSection>

          <DocSection id="fleet" title={title("fleet")}>
            <Prose>
              <p>
                Anyone can launch a copy of a coin that is already trading, but a copy works for the coin it copied. Coins whose
                ticker or name read the same form one family, called a {brand.fleet}, and one of them leads it: the original, for as
                long as people keep trading it. Every other member&apos;s fees go to the leader, building the leader&apos;s OTC
                limit and protection pot instead of its own.
              </p>
              <p>
                A copy launched while the leader is active also pays a {dollars(FLEET.entryUsd)} entry. It is spent on the copy&apos;s
                own coins, which are handed to the leader&apos;s holders. So before you buy a copy, know that it gives its buyers
                little or no OTC exit and little or no loss cover.
              </p>
            </Prose>
            <Details summary="What counts as the same name">
              <Prose>
                <p>
                  Before comparing, a ticker or name is put in capitals, accents are removed, look-alike characters become the letter
                  they imitate and everything that is not a letter is dropped. So {lookAlikes.join(", ")} and a{" "}
                  {cyrillicCat} typed in Cyrillic letters all read as {fleetKey(cyrillicCat)}. Matching uses text only: a copy with a different name and the same picture is not caught, and
                  unrelated coins that share a word can be grouped together.
                </p>
              </Prose>
            </Details>
            <Details summary="Who leads, and who gets the entry">
              <Prose>
                <p>
                  The original leads while it is active, which means at least {FLEET.aliveTraders} wallets and{" "}
                  {dollars(FLEET.aliveVolumeUsd)} of trading in the last {FLEET.aliveHours} hours. If it goes quiet, the active member
                  with the most volume, traders and market cap leads; if none is active, the best member overall. This is checked
                  again every time fees are paid out.
                </p>
                <p>
                  The entry buys about {entrySupplyPct.toFixed(1)}% of the copy&apos;s supply inside the launch transaction, ahead of
                  the launcher&apos;s own buy, and the launcher adds about {solAmount(entryRentSol)} of rent for the handout. The
                  coins go to up to {FLEET.recipients} of the leader&apos;s holders, weighted by what they paid in, with no holder
                  getting more than {pct(FLEET.maxShareBps)}. A copy launched while nobody in the family is active owes no entry.
                </p>
              </Prose>
            </Details>
          </DocSection>

          <DocSection id="risks" title={title("risks")}>
            <Prose>
              <ul className="space-y-3">
                <li>
                  <strong>Coins here can go to zero.</strong> Anyone can launch one and most lose their value. A listing is not an
                  endorsement, and nothing on this site is financial advice.
                </li>
                <li>
                  <strong>The wallets are held by the backend.</strong> The keys of the fee wallet, the OTC reserve and{" "}
                  {brand.shield} sit on the operator&apos;s server, and whoever holds them can move the funds. No on-chain program
                  enforces the split, the limits or the payouts.
                </li>
                <li>
                  <strong>Protection is capped and is not insurance.</strong> The most a loss can get back is {pct(topTier)}, and
                  many get back far less or nothing. People can also trade back and forth to farm payouts, which drains the pot of
                  the coin they farm.
                </li>
                <li>
                  <strong>The OTC reserve can run short.</strong> Sell limits add up to more than it holds, so heavy selling can
                  leave it unable to quote the size you want until new fees arrive.
                </li>
                <li>
                  <strong>Stock tokens answer to their issuers.</strong> A coin paired with a tokenized stock trades against a token
                  made by another company, which the launch form names. That issuer can freeze any account that holds its token,
                  a coin&apos;s pool included, pause every transfer, or move and burn tokens. Any of these can stop a coin from
                  trading or empty its pool, and nothing on this site can undo it. The tokens also carry the issuer&apos;s own
                  terms and regional restrictions on who may hold them, which this site does not check for you.
                </li>
                <li>
                  <strong>Pairs can pause.</strong> Raydium requires a full curve to raise a minimum amount. On SOL that is{" "}
                  {curve.solMinRaise} SOL, so SOL launches pause while SOL is above roughly {dollars(curve.solCeilingUsd)}. Any
                  other pair is also unavailable while its token has no good route to SOL or its issuer has paused it. Raydium can
                  change these minimums, and everything here stops if Raydium or Jupiter does.
                </li>
                <li>
                  <strong>The mechanics are unaudited.</strong> Costs, hold times, limits and payouts are worked out by the backend
                  from the trades it has seen. That can lag, the operator can change the rules, and nobody independent has reviewed
                  it. Don&apos;t rely on it with money you can&apos;t afford to lose.
                </li>
              </ul>
            </Prose>
          </DocSection>
        </article>
      </div>
    </div>
  );
}
