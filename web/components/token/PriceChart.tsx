"use client";

import clsx from "clsx";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  LineType,
  createChart,
  type AutoscaleInfoProvider,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { otcPolicy, type CoinDetail } from "@gantry/shared";
import { bucketHex } from "@/lib/buckets";
import { useCandles } from "@/lib/data";
import { bps, num, sig } from "@/lib/format";
import { Panel, Segmented, Skeleton } from "@/components/ui";

type Timeframe = "1m" | "5m" | "15m" | "1h";
type Look = "line" | "candles";

const timeframes: { value: Timeframe; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
];
const looks: { value: Look; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "candles", label: "Candles" },
];

/* The canvas cannot read CSS variables, so the chart's colours are written out here. */
const palette = {
  text: "#858892",
  grid: "rgba(255, 255, 255, 0.04)",
  crosshair: "rgba(255, 255, 255, 0.2)",
  crosshairLabel: "#2A2C33",
  up: "#5DD39E",
  down: "#F2777A",
  // the OTC reserve's line: `desk`, and `desk` at 18% over the card for the fill of its label
  reserve: bucketHex.otcReserve,
  reserveLabel: "#323043",
} as const;
const fade = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * The coin's price in USD (or in its pair's token when that has no USD price), as a soft line or as candles.
 * While the OTC reserve is open for the coin, a dashed line marks what it pays per coin right now and a sentence
 * under the chart says so. That price follows the market, so the line moves with it.
 */
export function PriceChart({ coin }: { coin: CoinDetail }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [look, setLook] = useState<Look>("line");
  const { data, isLoading, isError } = useCandles(coin.address, timeframe);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const line = useRef<ISeriesApi<"Area"> | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);

  // candles come in the pair's token; the chart shows USD whenever that token has a USD price
  const toUsd = coin.quote.usdPerUnit > 0 ? coin.quote.usdPerUnit : 0;
  const factor = toUsd || 1;
  const prefix = toUsd ? "$" : "";

  // nothing here goes below zero; without this the scale's bottom margin gets negative labels
  const fmt = useMemo(() => (p: number) => (p < 0 ? "" : `${prefix}${Math.abs(p) >= 1 ? num(p) : sig(p, 4)}`), [prefix]);

  const sorted = useMemo(() => (data ? [...data].sort((a, b) => a.t - b.t) : []), [data]);

  // what the reserve pays per coin right now, in the chart's unit; 0 while it is not open for this coin
  const reserve = coin.otc.twapReady && coin.otc.sellPrice > 0 ? coin.otc.sellPrice * factor : 0;

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: palette.text,
        // axis labels are set in the page's own font: hand the canvas the resolved stack of the container
        fontFamily: getComputedStyle(el.current).fontFamily,
        fontSize: 12,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: look === "candles" ? 0.22 : 0.08 } },
      // the edges are fixed to the data: the view cannot be dragged into empty space, and the first and last
      // time labels are kept inside the plot instead of being cut off
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        horzLine: { color: palette.crosshair, style: LineStyle.Dashed, labelBackgroundColor: palette.crosshairLabel },
        vertLine: { color: palette.crosshair, style: LineStyle.Dashed, labelBackgroundColor: palette.crosshairLabel },
      },
      // a vertical drag on a phone scrolls the page, not the price scale
      handleScroll: { vertTouchDrag: false },
      localization: { priceFormatter: fmt },
    });
    const priceFormat = { type: "custom" as const, formatter: fmt, minMove: 1e-12 };
    if (look === "line") {
      line.current = c.addSeries(AreaSeries, {
        lineWidth: 2,
        lineType: LineType.Curved,
        priceLineVisible: false,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderWidth: 0,
        priceFormat,
      });
    } else {
      candles.current = c.addSeries(CandlestickSeries, {
        upColor: palette.up,
        downColor: palette.down,
        wickUpColor: palette.up,
        wickDownColor: palette.down,
        borderVisible: false,
        priceLineVisible: false,
        priceFormat,
      });
      volume.current = c.addSeries(HistogramSeries, {
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    }
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      line.current = null;
      candles.current = null;
      volume.current = null;
    };
  }, [fmt, look]);

  useEffect(() => {
    if (!chart.current || !data) return;
    if (line.current) {
      // the line is green when the period ends above where it began, red when it ends below
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const tone = !first || !last || last.c >= first.o ? palette.up : palette.down;
      line.current.applyOptions({ lineColor: tone, topColor: fade(tone, 0.24), bottomColor: fade(tone, 0), crosshairMarkerBackgroundColor: tone });
      line.current.setData(sorted.map((d) => ({ time: d.t as UTCTimestamp, value: d.c * factor })));
    }
    candles.current?.setData(
      sorted.map((d) => ({
        time: d.t as UTCTimestamp,
        open: d.o * factor,
        high: d.h * factor,
        low: d.l * factor,
        close: d.c * factor,
      })),
    );
    volume.current?.setData(
      sorted.map((d) => ({
        time: d.t as UTCTimestamp,
        value: d.v * factor,
        color: fade(d.c >= d.o ? palette.up : palette.down, 0.22),
      })),
    );
    chart.current.timeScale().fitContent();
  }, [data, sorted, factor, fmt, look]);

  // the reserve's price as one dashed line; the scale stretches to it, so it is in view at every candle length
  useEffect(() => {
    const series = line.current ?? candles.current;
    if (!series || !(reserve > 0)) return;
    const stretch: AutoscaleInfoProvider = (original) => {
      const info = original();
      if (info?.priceRange) {
        info.priceRange.minValue = Math.min(info.priceRange.minValue, reserve);
        info.priceRange.maxValue = Math.max(info.priceRange.maxValue, reserve);
      }
      return info;
    };
    series.applyOptions({ autoscaleInfoProvider: stretch });
    const mark = series.createPriceLine({
      price: reserve,
      title: "Reserve",
      color: fade(palette.reserve, 0.7),
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      axisLabelColor: palette.reserveLabel,
      axisLabelTextColor: palette.reserve,
    });
    return () => {
      // a change of style or unit has already removed this series together with its chart
      if (line.current !== series && candles.current !== series) return;
      series.removePriceLine(mark);
      series.applyOptions({ autoscaleInfoProvider: undefined });
    };
  }, [reserve, fmt, look]);

  const empty = !isLoading && (isError || sorted.length === 0);

  return (
    <Panel as="section" aria-label={`${coin.symbol} price chart`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-[var(--card-pad)] pt-[var(--card-pad)]">
        <Segmented size="sm" aria-label="Chart style" value={look} onChange={setLook} options={looks} />
        <Segmented size="sm" aria-label="Candle length" value={timeframe} onChange={setTimeframe} options={timeframes} />
      </div>

      <div className="relative mt-4 h-[300px] sm:h-[380px] lg:h-[440px]">
        <div ref={el} className={clsx("absolute top-0 right-2 bottom-3 left-[var(--card-pad)]", (isLoading || empty) && "invisible")} />
        {isLoading && <Skeleton className="absolute inset-[var(--card-pad)] top-0" />}
        {empty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-base font-medium text-ink">{isError ? "The chart did not load" : "Nothing to chart yet"}</p>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-2">
              {isError ? "It keeps retrying on its own." : "The chart starts with this coin's first trade."}
            </p>
          </div>
        )}
      </div>

      {reserve > 0 && !empty && <ReserveNote coin={coin} price={toUsd ? fmt(reserve) : `${fmt(reserve)} ${coin.quote.symbol}`} />}
    </Panel>
  );
}

/**
 * The line under the chart that names the dashed line: what the OTC reserve pays for this coin right now and how
 * much it can take, with the way to sell into it. The price is the market's, never a promise, and the sentence
 * behind "What is this?" says how it is set.
 */
function ReserveNote({ coin, price }: { coin: CoinDetail; price: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const limit = coin.otc.sellLimitSol;
  const reserveLink = (
    <Link href={`/otc?coin=${coin.address}`} className="link">
      OTC reserve
    </Link>
  );
  const figure = "num font-medium text-ink";
  return (
    <div className="px-[var(--card-pad)] pt-1 pb-[var(--card-pad)] text-sm leading-relaxed text-ink-2">
      <p>
        <span aria-hidden className="mr-2.5 inline-block w-5 border-t border-dashed border-desk align-middle" />
        {limit > 0 ? (
          <>
            The {reserveLink} buys at <span className={figure}>{price}</span> right now, up to <span className={figure}>{num(limit, 2)} SOL</span>.
          </>
        ) : (
          <>
            The {reserveLink} would buy at <span className={figure}>{price}</span>, but it is empty for now.
          </>
        )}{" "}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          // the ::after stretches the tap target on phones
          className="relative rounded-sm text-[13px] whitespace-nowrap text-ink-3 underline decoration-white/20 underline-offset-[3px] transition-colors after:absolute after:-inset-x-2 after:-inset-y-3 hover:text-ink"
        >
          What is this?
        </button>
      </p>
      <p id={id} hidden={!open} className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-2">
        The reserve is a SOL wallet you can sell this coin into with no slippage. Its price follows the market: the lower of the current price
        and the {otcPolicy.twapSeconds / 60}-minute average, plus {bps(otcPolicy.premiumBps)}, and it buys until its SOL runs out.
      </p>
    </div>
  );
}
