"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { brand, otcPolicy, type CoinDetail } from "@gantry/shared";
import { client, useBalances, useCoin, useOtcCoin, useSolUsd } from "@/lib/data";
import { bps, formatRaw, num, sol, toRaw, tokens, units, usd } from "@/lib/format";
import { useSolanaTx } from "@/lib/tx";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { TxStatus } from "@/components/TxStatus";
import { Button, EmptyState, Field, Input, Panel, PanelBody, Skeleton } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";

const twapMinutes = otcPolicy.twapSeconds / 60;

/** The sell box: a prompt until a coin is picked, then the amount, what the reserve pays, today's limit and the button. */
export function SellBox({ address, onClose }: { address?: string; onClose: () => void }) {
  return (
    <Panel>
      <PanelBody>
        {address ? (
          <Loaded address={address} onClose={onClose} />
        ) : (
          <>
            <h2 className="display-3 text-ink">Pick a coin to sell</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              Choose one from the list to see what the reserve pays for it and how much you can sell today.
            </p>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

function Loaded({ address, onClose }: { address: string; onClose: () => void }) {
  const { data: coin, isLoading, isError } = useCoin(address);
  if (isLoading) return <Skeleton className="h-[380px]" />;
  if (isError || !coin)
    return (
      <EmptyState
        title="Coin not found"
        detail={`No coin on ${brand.name} has that address. If it launched moments ago, try again shortly.`}
        action={
          <Button variant="secondary" size="sm" onClick={onClose}>
            Pick another coin
          </Button>
        }
      />
    );
  // keyed by coin: a new coin starts with an empty amount and no status left over from the last one
  return <Form key={coin.address} coin={coin} onClose={onClose} />;
}

function Form({ coin, onClose }: { coin: CoinDetail; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const wallet = useAddress();
  const { open: openWallet } = useWalletModal();
  const solUsd = useSolUsd();
  const limits = useOtcCoin(coin.address, wallet);
  const balances = useBalances(wallet);
  const tx = useSolanaTx();

  const l = limits.data;
  const inputRaw = toRaw(amount, coin.decimals);
  const inputUnits = units(inputRaw, coin.decimals);
  // previews from the reserve's posted price; the signed quote fixes the exact amount
  const outSol = l ? inputUnits * l.sellPriceSol : 0;

  // the limit that applies to this sale: the coin's own, or what one wallet may still sell today, whichever is lower
  const walletCapSol = !l ? 0 : wallet ? l.walletRemainingSol : otcPolicy.limited ? (l.reserveSol * otcPolicy.walletDailyBps) / 10_000 : l.sellLimitSol;
  const capSol = l ? Math.min(l.sellLimitSol, walletCapSol) : 0;
  const capUnits = l && l.sellPriceSol > 0 ? capSol / l.sellPriceSol : 0;

  const notReady = !!l && !l.twapReady;
  const closed = !!l && l.twapReady && capSol <= 0;
  const over = !!l && !notReady && !closed && outSol > capSol;
  const balance = balances.data ? BigInt(balances.data.tokens[coin.address] ?? "0") : undefined;
  const insufficient = balance !== undefined && inputRaw > balance;
  const copyOf = coin.fleet && coin.fleet.leader.address !== coin.address ? coin.fleet.leader : null;

  async function submit() {
    if (!wallet || inputRaw === 0n) return;
    const r = await tx.run(
      `OTC sale of ${coin.symbol}`,
      () => client.otcQuote({ wallet, coin: coin.address, side: "sell", amount: inputRaw.toString() }),
      (signature, quote) => client.otcConfirm(quote.id, signature),
    );
    if (r) setAmount("");
  }

  const canMax = !!wallet && balance !== undefined && balance > 0n;
  const setMax = () => {
    if (balance === undefined) return;
    // the whole balance, or as much of it as today's limit allows (a hair under, so a small price move can't push it over)
    const capRaw = capUnits > 0 ? toRaw((capUnits * 0.995).toFixed(coin.decimals), coin.decimals) : 0n;
    setAmount(formatRaw(capRaw > 0n && capRaw < balance ? capRaw : balance, coin.decimals));
  };

  const label = notReady
    ? "Not open yet"
    : closed
      ? otcPolicy.limited
        ? "Limit reached"
        : "Reserve is empty"
      : insufficient
        ? `Not enough ${coin.symbol}`
        : over
          ? otcPolicy.limited
            ? "Over today's limit"
            : "More than the reserve holds"
          : tx.busy
            ? "Selling…"
            : `Sell ${coin.symbol}`;

  const limitLine = limits.isError
    ? "The reserve didn't load. It retries on its own."
    : !l
      ? "Checking the reserve…"
      : notReady
        ? `The reserve starts buying a coin once it has ${twapMinutes} minutes of price history.`
        : closed
          ? !otcPolicy.limited
            ? "The reserve has no SOL left right now. It refills as coins trade."
            : wallet && l.sellLimitSol > 0
            ? "You've reached today's limit for this coin. It resets at 00:00 UTC."
            : "The reserve isn't buying this coin right now."
          : otcPolicy.limited
            ? `You can sell up to ${num(Math.floor(capUnits))} ${coin.symbol} today (${sol(capSol)}).`
            : `The reserve can buy up to ${num(Math.floor(capUnits))} ${coin.symbol} right now (${sol(capSol)}).`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <CoinAvatar src={coin.image} symbol={coin.symbol} seed={coin.address} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="display-3 truncate text-ink">Sell {coin.name}</h2>
          <Link href={`/token/${coin.address}`} className="text-[13px] text-ink-3 transition-colors hover:text-ink">
            {coin.symbol} · view coin
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-white/5 hover:text-ink"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <Field
        as="div"
        label="Amount"
        hint={wallet && balance !== undefined ? `You hold ${tokens(balance, coin.decimals)}` : undefined}
        error={insufficient ? "That's more than this wallet holds." : undefined}
      >
        <div className="relative">
          <Input
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            aria-label={`Amount of ${coin.symbol} to sell`}
            value={amount}
            invalid={insufficient}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className={clsx("num h-12 text-base", canMax ? "pr-32" : "pr-20")}
          />
          <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3">
            {canMax && (
              <button
                type="button"
                onClick={setMax}
                className="h-7 rounded-sm bg-white/8 px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-white/12 hover:text-ink"
              >
                Max
              </button>
            )}
            <span className="max-w-16 truncate text-[13px] text-ink-3">{coin.symbol}</span>
          </div>
        </div>
      </Field>

      <div className="rounded-lg bg-raise px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[14px] text-ink-2">You get</span>
          <span className={clsx("num text-[22px] leading-none font-semibold", inputRaw > 0n && l ? "text-ink" : "text-ink-3")}>
            {inputRaw === 0n ? "0 SOL" : !l ? "…" : `≈ ${sol(outSol)}`}
          </span>
        </div>
        {inputRaw > 0n && l && outSol > 0 && solUsd > 0 && <p className="num mt-1.5 text-right text-[13px] text-ink-3">≈ {usd(outSol * solUsd)}</p>}
      </div>

      <div className="space-y-2 text-[14px] leading-relaxed">
        <p className="flex items-baseline justify-between gap-4 text-ink-2">
          <span>Price per coin, {bps(otcPolicy.premiumBps)} over market</span>
          <span className="num shrink-0 text-ink">{l?.twapReady && solUsd > 0 ? usd(l.sellPriceSol * solUsd) : "—"}</span>
        </p>
        <p className={over ? "text-loss" : "text-ink-2"}>{limitLine}</p>
        {copyOf && otcPolicy.limited && (
          <p className="text-ink-3">
            This is a copy in a {brand.fleet}: its fees go to the original, {copyOf.symbol}, so its own limit stays small.
          </p>
        )}
      </div>

      <div className="space-y-3">
        {!wallet ? (
          <Button size="lg" block onClick={openWallet}>
            Connect wallet
          </Button>
        ) : (
          <Button size="lg" block disabled={tx.busy || notReady || closed || over || insufficient || inputRaw === 0n || outSol <= 0} onClick={submit}>
            {label}
          </Button>
        )}
        <TxStatus state={tx.state} />
        <p className="text-[13px] leading-relaxed text-ink-3">
          One transaction pays you and burns the coins. The exact amount is fixed when you confirm.
        </p>
      </div>
    </div>
  );
}
