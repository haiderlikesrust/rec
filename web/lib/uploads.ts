import { join } from "node:path";

/** Where uploaded coin images live. In Docker it's on the data volume, so images survive updates. */
export const uploadDir = () => process.env.UPLOAD_DIR ?? join(/*turbopackIgnore: true*/ process.cwd(), ".uploads");

export const UPLOAD_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
