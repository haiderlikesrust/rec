import clsx from "clsx";
import Link from "next/link";
import { brand } from "@gantry/shared";

/**
 * The brand mark: a launch tower. A frame with rounded shoulders, one brace folding across it and a service arm
 * reaching out to the right. Round caps and joins on a 32-unit grid, so it stays soft and clear at 16px.
 *
 * It is a single-colour mark drawn in `currentColor` (ink by default): a text-colour class recolours it.
 * The whole identity lives here and in `app/icon.svg` (the same geometry on a rounded charcoal square): swap those
 * two to change the logo. The name next to it is always `brand.name`, never a literal.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("shrink-0 text-ink", className)}
      aria-hidden
    >
      {/* frame */}
      <path d="M7.5 27.5V7.5a2.5 2.5 0 0 1 2.5-2.5h7a2.5 2.5 0 0 1 2.5 2.5v20" strokeWidth="2.6" />
      {/* brace */}
      <path d="M19.5 7 7.5 16.5l12 9.5" strokeWidth="2.2" />
      {/* service arm */}
      <path d="M19.5 11.5H27" strokeWidth="2.6" />
    </svg>
  );
}

/** The name in the body face: semibold, tight, in the case `brand.name` is written. Size it with a text-size class. */
export function Wordmark({ className }: { className?: string }) {
  return <span className={clsx("leading-none font-semibold tracking-[-0.02em]", className)}>{brand.name}</span>;
}

/** Mark and wordmark as the link home. */
export function Logo({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <Link href="/" aria-label={`${brand.name} home`} className={clsx("inline-flex shrink-0 items-center gap-2 rounded-sm text-ink", className)}>
      <LogoMark size={size} />
      <Wordmark className="text-[19px]" />
    </Link>
  );
}
