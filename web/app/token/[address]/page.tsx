import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSolanaAddress, type Coin } from "@cook/shared";
import { TokenView } from "@/components/token/TokenView";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:42069";

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  if (!isSolanaAddress(address)) return { title: "Coin" };
  try {
    const res = await fetch(`${API}/api/coins/${address}`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!res.ok) return { title: "Coin" };
    const coin = (await res.json()) as Coin;
    return { title: `${coin.name} (${coin.symbol})`, description: coin.description || undefined };
  } catch {
    return { title: "Coin" };
  }
}

export default async function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isSolanaAddress(address)) notFound();
  return <TokenView address={address} />;
}
