import { getSupabaseServer } from "./supabase-server";
import type { EmailAttachment } from "./email-service";

export interface AttachmentMeta {
  name:      string;
  mime_type: string;
  size:      number;
  path:      string;
}

const BUCKET = "email-attachments";

/**
 * Downloads each attachment from Supabase Storage and returns base64-encoded
 * content ready for the ZeptoMail payload.
 *
 * Failures are logged and skipped — a missing attachment must not block
 * email delivery.
 */
export async function loadAttachmentsAsBase64(
  metas: AttachmentMeta[],
): Promise<EmailAttachment[]> {
  if (!metas.length) return [];
  const db = getSupabaseServer();

  const results = await Promise.allSettled(
    metas.map(async (m) => {
      const { data, error } = await db.storage.from(BUCKET).download(m.path);
      if (error || !data) {
        console.error("[email-attachments] download failed:", m.path, error?.message);
        return null;
      }
      const content = Buffer.from(await data.arrayBuffer()).toString("base64");
      return { content, mime_type: m.mime_type, name: m.name } satisfies EmailAttachment;
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<EmailAttachment | null> => r.status === "fulfilled")
    .map(r => r.value)
    .filter((a): a is EmailAttachment => a !== null);
}
