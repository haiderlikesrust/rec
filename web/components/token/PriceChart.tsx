"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { CandlestickChart } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Coin } from "@cook/shared";
import { useCandles } from "@/lib/data";
import { num, sig, usd } from "@/lib/format";
import { Change, Segmented, Skeleton } from "@/components/ui";
import { TinyPrice } from "./TinyPrice";

type Interval = "1m" | "5m" | "15m" | "1h";

const colors = {
  up: "#2BD99A",
  down: "#FF5C7C",
  upVol: "rgba(43,217,154,0.28)",
  downVol: "rgba(255,92,124,0.28)",
  text: "#6F7CA6",
  grid: "rgba(148,166,230,0.05)",
  cross: "rgba(148,166,230,0.25)",
  label: "#19233F",
} as const;

export function PriceChart({ coin }: { coin: Coin }) {
  const [interval, setInterval] = useState<Interval>("5m");
  const [mode, setMode] = useState<"mcap" | "price">("mcap");
  const { data, isLoading, isError } = useCandles(coin.address, interval);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);

  // circulating supply, so price candles can be shown as market cap
  const supply = coin.price > 0 ? coin.marketCap / coin.price : 1e9;
  // candles are in the quote asset; the chart shows USD whenever the quote has a USD price
  const toUsd = coin.quote.usdPerUnit > 0 ? coin.quote.usdPerUnit : 0;
  const factor = (mode === "mcap" ? supply : 1) * (toUsd || 1);
  const prefix = toUsd ? "$" : "";

  // prices and market caps never go below zero; the scale's bottom margin (room for volume) would otherwise be labelled negative
  const fmt = useMemo(() => (p: number) => (p < 0 ? "" : `${prefix}${Math.abs(p) >= 1 ? num(p) : sig(p, 4)}`), [prefix]);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: colors.text,
        // the canvas can't read CSS variables: hand it the body's resolved font stack
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { color: "transparent" }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.22 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        horzLine: { color: colors.cross, style: LineStyle.Dashed, labelBackgroundColor: colors.label },
        vertLine: { color: colors.cross, style: LineStyle.Dashed, labelBackgroundColor: colors.label },
      },
      localization: { priceFormatter: fmt },
    });
    candles.current = c.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      borderVisible: false,
      priceFormat: { type: "custom", formatter: fmt, minMove: 1e-12 },
    });
    volume.current = c.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [fmt]);

  useEffect(() => {
    if (!candles.current || !volume.current || !data) return;
    const sorted = [...data].sort((a, b) => a.t - b.t);
    candles.current.setData(
      sorted.map((d) => ({
        time: d.t as UTCTimestamp,
        open: d.o * factor,
        high: d.h * factor,
        low: d.l * factor,
        close: d.c * factor,
      })),
    );
    volume.current.setData(
      sorted.map((d) => ({
        time: d.t as UTCTimestamp,
        value: d.v * (toUsd || 1),
        color: d.c >= d.o ? colors.upVol : colors.downVol,
      })),
    );
    chart.current?.timeScale().fitContent();
  }, [data, factor, toUsd]);

  const headline =
    mode === "mcap" ? (toUsd ? usd(coin.marketCapUsd) : `${fmt(coin.marketCap)} ${coin.quote.symbol}`) : null;

  return (
    <section className="surface rounded-[24px] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted">
            <CandlestickChart size={14} className="text-accent" />
            {mode === "mcap" ? "Market cap" : toUsd ? "Price (USD)" : `Price in ${coin.quote.symbol}`}
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="num font-display text-[28px] leading-tight font-bold">
              {headline ??
                (toUsd ? (
                  <>
                    $<TinyPrice value={coin.priceUsd} />
                  </>
                ) : (
                  <>
                    <TinyPrice value={coin.price} /> {coin.quote.symbol}
                  </>
                ))}
            </span>
            <Change value={coin.change24h} pill className="text-xs" />
            <span className="text-[11px] text-faint">24h</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "mcap", label: "MCap" },
              { value: "price", label: "Price" },
            ]}
          />
          <Segmented
            size="sm"
            value={interval}
            onChange={setInterval}
            options={(["1m", "5m", "15m", "1h"] as const).map((v) => ({ value: v, label: v }))}
          />
        </div>
      </div>
      <div className="relative mt-4 h-[320px] sm:h-[420px]">
        <div ref={el} className="absolute inset-0" />
        {isLoading && <Skeleton className="absolute inset-0 rounded-2xl" />}
        {(isError || (data && data.length === 0)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <div className="spectrum h-1 w-10 rounded-full opacity-70" />
            <p className="text-xs text-muted">
              {isError ? "Chart data unavailable right now." : "No trades yet. The first buy draws the first candle."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
