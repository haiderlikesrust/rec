import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brand } from "@gantry/shared";
import { PAYOUT_CAVEAT, payoutCoverage, payoutHold, payoutLines } from "@/components/shield/payout";
import { loadPayout, payoutId } from "./record";

/*
 * The picture a payout's link unfolds into (Open Graph and X): a soft charcoal card with the pearl coin's colours
 * glowing at its edge, the loss and what came back in large type, the brand small above and the caveat below.
 * Without a payout to show (an unknown id, or the backend not answering) it is the same card with the fund's own
 * line instead, so a shared link never unfolds into a broken image.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `A payout from ${brand.shield}, the protection fund on ${brand.name}`;

/* The palette of DESIGN.md, written out: the image renderer reads no CSS variables. */
const color = {
  surface: "#0E0F12",
  ink: "#EDEEF0",
  ink2: "#A1A4AD",
  gain: "#5DD39E",
  // the pearl coin of the home page
  lilac: "179, 166, 255",
  pink: "243, 178, 216",
  peach: "255, 201, 164",
} as const;

type Font = { name: string; data: Buffer; weight: 500 | 600; style: "normal" };

/** Figtree, read once from `public/fonts`. If the files are not there the renderer's built-in sans is used. */
let figtree: Promise<Font[] | undefined> | undefined;
function fonts() {
  figtree ??= Promise.all(
    ([[500, "Medium"], [600, "SemiBold"]] as const).map(async ([weight, file]) => ({
      name: "Figtree",
      data: await readFile(join(process.cwd(), "public", "fonts", `Figtree-${file}.ttf`)),
      weight,
      style: "normal" as const,
    })),
  ).catch(() => undefined);
  return figtree;
}

/**
 * A soft round glow: one colour fading to nothing around a point (`at`, in CSS position words). Each glow is a layer
 * the size of the whole picture; a layer that hangs over the edge comes out with a hard side in this renderer.
 */
function Glow({ rgb, alpha, at, reach }: { rgb: string; alpha: number; at: string; reach: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: size.width,
        height: size.height,
        backgroundImage: `radial-gradient(circle at ${at}, rgba(${rgb}, ${alpha}) 0%, rgba(${rgb}, 0) ${reach}%)`,
      }}
    />
  );
}

/** The largest type the longer of the two lines fits in on one row. */
const headlineSize = (lines: string[]) => {
  const longest = Math.max(...lines.map((l) => l.length));
  return longest <= 25 ? 84 : longest <= 30 ? 72 : longest <= 36 ? 60 : 50;
};

export async function payoutImage(segment: string) {
  const payout = await loadPayout(payoutId(segment));
  const lines = payout ? payoutLines(payout) : ["Part of a loss", "comes back."];
  const headline = headlineSize(lines);
  const detail = payout
    ? `Held ${payoutHold(payout)} · ${payoutCoverage(payout)} covered by ${brand.shield}`
    : `${brand.shield} is the protection fund on ${brand.name}.`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: color.surface,
          color: color.ink,
          fontFamily: "Figtree",
          fontWeight: 500,
        }}
      >
        <Glow rgb={color.lilac} alpha={0.5} at="88% 0%" reach={36} />
        <Glow rgb={color.pink} alpha={0.3} at="104% 52%" reach={30} />
        <Glow rgb={color.peach} alpha={0.3} at="84% 108%" reach={30} />

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="46" height="46" viewBox="0 0 32 32" fill="none" stroke={color.ink} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.5 27.5V7.5a2.5 2.5 0 0 1 2.5-2.5h7a2.5 2.5 0 0 1 2.5 2.5v20" strokeWidth="2.6" />
            <path d="M19.5 7 7.5 16.5l12 9.5" strokeWidth="2.2" />
            <path d="M19.5 11.5H27" strokeWidth="2.6" />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.7 }}>{brand.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: headline,
              fontWeight: 600,
              lineHeight: 1.12,
              letterSpacing: -0.03 * headline,
            }}
          >
            <div>{lines[0]}</div>
            <div style={{ color: payout ? color.gain : color.ink }}>{lines[1]}</div>
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: color.ink2 }}>{detail}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 26 }}>
          <div style={{ color: color.ink2 }}>{PAYOUT_CAVEAT}</div>
          <div>{brand.domain}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: await fonts(),
      // a payout that has been sent never changes; anything else (still on its way, unknown, backend down) must be asked again
      headers: { "cache-control": payout?.status === "sent" ? "public, max-age=86400" : "no-store" },
    },
  );
}
