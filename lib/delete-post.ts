import { getSupabaseServer } from "@/lib/supabase-server";

type DB = ReturnType<typeof getSupabaseServer>;

/**
 * Deletes a user post and its associated storage object (if any).
 * Returns { found: false } when the post doesn't exist.
 * Storage removal errors are silently swallowed — the row is always deleted.
 */
export async function deletePostWithCleanup(
  postId: string,
  db: DB
): Promise<{ found: boolean }> {
  const { data: post } = await db
    .from("user_posts")
    .select("id, photo_url")
    .eq("id", postId)
    .single();

  if (!post) return { found: false };

  if (post.photo_url) {
    const key = post.photo_url.split("/user-posts/").at(-1);
    if (key) await db.storage.from("user-posts").remove([key]).catch(() => {});
  }

  await db.from("user_posts").delete().eq("id", postId);
  return { found: true };
}
