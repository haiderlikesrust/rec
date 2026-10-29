"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";

/** The connected wallet's base58 address, or undefined. */
export function useAddress() {
  const { publicKey } = useWallet();
  return useMemo(() => publicKey?.toBase58(), [publicKey]);
}
