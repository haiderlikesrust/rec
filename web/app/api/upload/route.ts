import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Coin image upload.
 * - With PINATA_JWT set: pins to IPFS and returns ipfs://<cid> (portable, what production should use).
 * - Without it: saves under public/uploads and returns /uploads/<hash>.<ext> (local development).
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Use PNG, JPG, GIF or WEBP" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be 4 MB or smaller" }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const jwt = process.env.PINATA_JWT;

  if (jwt) {
    const body = new FormData();
    body.append("file", new Blob([bytes], { type: file.type }), `coin.${ext}`);
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body,
    });
    if (!res.ok) return NextResponse.json({ error: `IPFS pin failed (${res.status})` }, { status: 502 });
    const { IpfsHash } = (await res.json()) as { IpfsHash: string };
    return NextResponse.json({ url: `ipfs://${IpfsHash}` });
  }

  const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 20)}.${ext}`;
  const dir = join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), bytes);
  return NextResponse.json({ url: `/uploads/${name}` });
}
