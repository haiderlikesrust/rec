import clsx from "clsx";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import type { TxState } from "@/lib/tx";

const look = {
  pending: { Icon: LoaderCircle, box: "bg-white/5 text-ink-2", icon: "animate-spin text-ink-2" },
  success: { Icon: CircleCheck, box: "bg-gain-tint text-ink", icon: "text-gain" },
  error: { Icon: CircleAlert, box: "bg-loss-tint text-ink", icon: "text-loss" },
} as const;

/** The line under a form that says what its transaction is doing: an icon for the state, then the message. */
export function TxStatus({ state, className }: { state: TxState; className?: string }) {
  if (state.status === "idle" || !state.message) return null;
  const s = look[state.status];
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={clsx("flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm leading-snug", s.box, className)}>
      <s.Icon size={17} aria-hidden className={clsx("mt-px shrink-0", s.icon)} />
      <span className="min-w-0 break-words">{state.message}</span>
    </p>
  );
}
