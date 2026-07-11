/**
 * Convert a Supabase storage object URL to a resized thumbnail via the
 * built-in image transform endpoint. Non-Supabase URLs pass through unchanged.
 *
 * Input:  https://xxx.supabase.co/storage/v1/object/public/bucket/file.jpg
 * Output: https://xxx.supabase.co/storage/v1/render/image/public/bucket/file.jpg?width=480&quality=80
 */
export function thumbUrl(
  url:     string | null | undefined,
  width    = 480,
  quality  = 80,
): string | null {
  if (!url) return null;
  if (!url.includes("/storage/v1/object/public/")) return url;
  const base = url.split("?")[0]; // strip any existing query params
  return (
    base.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
    `?width=${width}&quality=${quality}`
  );
}
