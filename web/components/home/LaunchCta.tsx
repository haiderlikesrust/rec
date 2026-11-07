import { Lock, Rocket, Sparkles, Wallet } from "lucide-react";
import { GRADUATION_MCAP_USD, START_MCAP_USD } from "@cook/shared";
import { ButtonLink, IconTile } from "@/components/ui";

const steps = [
  { icon: Sparkles, title: "Name it", body: "Name, ticker, image and socials." },
  { icon: Wallet, title: "Pick a pair", body: "SOL, a stablecoin, one of 120+ tokenized stocks or any token you paste in." },
  { icon: Lock, title: "Launch", body: `1B supply on a Meteora curve: $${START_MCAP_USD / 1000}k start, graduates at $${GRADUATION_MCAP_USD / 1000}k.` },
];

export function LaunchCta() {
  return (
    <section className="ring-spectrum shadow-pop relative overflow-hidden rounded-[32px] px-6 py-12 sm:px-12 sm:py-16">
      <div className="spectrum absolute -bottom-40 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl" aria-hidden />
      <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <span className="eyebrow">Launch</span>
          <h2 className="font-display mt-3 text-4xl leading-[1.02] font-bold sm:text-[56px]">
            Your coin, live in
            <br />
            one transaction.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            Costs 0.01 SOL. A 6-second anti-snipe fee keeps bots off your launch, and your own first buy, bundled into the launch transaction, skips it.
          </p>
          <ButtonLink href="/launch" size="lg" className="mt-8">
            <Rocket size={17} /> Launch a coin
          </ButtonLink>
        </div>
        <ol className="grid gap-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-center gap-4 rounded-3xl bg-sunk p-4 shadow-[inset_0_0_0_1px_var(--line)]">
              <IconTile size={42}>
                <s.icon size={19} />
              </IconTile>
              <div className="min-w-0">
                <div className="font-display text-base font-semibold">
                  <span className="num mr-2 text-faint">0{i + 1}</span>
                  {s.title}
                </div>
                <div className="text-[13px] text-muted">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
