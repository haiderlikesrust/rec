import clsx from "clsx";
import type { TxState } from "@/lib/tx";

export function TxStatus({ state, className }: { state: TxState; className?: string }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role="status"
      className={clsx(
        "rounded-xl px-3 py-2 text-xs",
        state.status === "error" && "bg-down-soft text-down",
        state.status === "success" && "bg-up-soft text-up",
        state.status === "pending" && "bg-sunk text-muted",
        className,
      )}
    >
      {state.message}
    </p>
  );
}
