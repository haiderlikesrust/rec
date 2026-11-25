"use client";

import clsx from "clsx";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { CoinAvatar } from "@/components/CoinAvatar";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
const SIZE = 72;

/**
 * The coin image: a small square that takes a dropped file or opens the file picker, uploads it to /api/upload and
 * hands back the stored URL. `onBusy` reports an upload in flight so the form can hold the launch until it lands;
 * `onError` reports why an upload failed (and clears with an empty string), for the form to show where it has room.
 */
export function ImageWell({
  value,
  symbol,
  onChange,
  onBusy,
  onError,
}: {
  value: string;
  symbol: string;
  onChange: (url: string) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);

  async function upload(file: File) {
    onError("");
    setUploading(true);
    onBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "The upload didn't go through. Try again.");
      onChange(json.url);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
      onBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  return (
    <div className="shrink-0" style={{ width: SIZE }}>
      <button
        type="button"
        aria-label={value ? "Replace the coin image" : "Add a coin image (optional)"}
        title="PNG, JPG, GIF or WEBP, up to 4 MB"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        style={{ width: SIZE, height: SIZE }}
        className={clsx(
          "flex items-center justify-center overflow-hidden rounded-lg border bg-raise transition-colors",
          !(value && !over && !uploading) && "border-dashed",
          over ? "border-signal text-ink" : "border-edge text-ink-2 hover:border-ink-2 hover:text-ink",
        )}
      >
        {uploading ? (
          <Loader2 size={18} className="animate-spin" aria-hidden />
        ) : value && !over ? (
          <CoinAvatar src={value} symbol={symbol || "?"} size={SIZE} className="border-0" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-xs">
            <ImagePlus size={18} aria-hidden />
            {over ? "Drop" : "Image"}
          </span>
        )}
      </button>
      {value && !uploading && (
        <button type="button" onClick={() => onChange("")} className="mt-1.5 block w-full text-center text-xs text-ink-3 hover:text-ink">
          Remove
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
      <p role="status" className="sr-only">
        {uploading ? "Uploading the image" : value ? "Image attached" : ""}
      </p>
    </div>
  );
}
