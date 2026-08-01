/**
 * Shared Supabase Storage upload helpers.
 *
 * All storage operations in the platform follow the same pattern:
 *   1. Buffer the file
 *   2. Upload to a named bucket at a generated path
 *   3. Return the public URL
 *
 * Consumers: every admin/user upload route, lib/invoice-service.ts,
 *            lib/job-handlers.ts, lib/daily-attendance-qr.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface UploadResult {
  path:      string;   // storage-relative path (for future getPublicUrl calls)
  publicUrl: string;   // ready-to-embed public URL
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Uploads a raw buffer to Supabase Storage and returns the public URL.
 * Throws on upload error so callers can handle with a single try/catch.
 */
export async function uploadBuffer(
  db:          SupabaseClient,
  bucket:      string,
  path:        string,
  buffer:      Buffer | Uint8Array,
  contentType: string,
  upsert       = false,
): Promise<UploadResult> {
  const { error } = await db.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert });

  if (error) throw new Error(`[storage] upload failed (${bucket}/${path}): ${error.message}`);

  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

/**
 * Convenience wrapper: reads the buffer from a Blob/File and uploads it.
 */
export async function uploadFile(
  db:     SupabaseClient,
  bucket: string,
  path:   string,
  file:   Blob | File,
  upsert  = false,
): Promise<UploadResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadBuffer(db, bucket, path, buffer, file.type || "application/octet-stream", upsert);
}

// ── Path helpers ──────────────────────────────────────────────────────────────

/** Returns the file extension from a filename/MIME type, without dot. */
export function fileExtension(filename: string, mimeType?: string): string {
  const fromName = filename.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  // Fall back to MIME type
  const mime: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
    "application/pdf": "pdf",
  };
  return (mimeType ? mime[mimeType] : undefined) ?? "bin";
}

/** Generates a timestamped storage path: "{prefix}-{timestamp}.{ext}" */
export function timestampedPath(prefix: string, ext: string): string {
  return `${prefix}-${Date.now()}.${ext}`;
}
