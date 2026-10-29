import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { UPLOAD_TYPES, uploadDir } from "@/lib/uploads";

export const runtime = "nodejs";

/** Serves images saved by /api/upload. Names are content hashes, so they cache forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([0-9a-f]{20})\.(png|jpg|gif|webp)$/.exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(join(/*turbopackIgnore: true*/ uploadDir(), file));
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": UPLOAD_TYPES[m[2]!]!, "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
