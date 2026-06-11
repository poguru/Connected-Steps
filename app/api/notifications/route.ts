import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// ── Auth helper ───────────────────────────────────────────────────────────────
// Returns the verified email from x-user-token, or null if absent/invalid.
function tokenEmail(req: NextRequest): string | null {
  return verifyUserToken(req.headers.get("x-user-token") ?? "");
}

// GET /api/notifications?email=&before=ISO&limit=20
// Returns paginated notifications + unread count for the user.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email  = searchParams.get("email");
  const before = searchParams.get("before") ?? new Date().toISOString();
  const limit  = Math.min(Number(searchParams.get("limit") ?? 20), 50);

  if (!email) return NextResponse.json({ notifications: [], unread: 0 });

  // Ownership check: the token must belong to the email being queried.
  const caller = tokenEmail(req);
  if (!caller || caller.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();
  const [listRes, countRes] = await Promise.all([
    db
      .from("notifications")
      .select("id, type, title, body, action_url, read_at, created_at")
      .eq("user_email", email.toLowerCase())
      .lt("created_at", before)
      .order("created_at", { ascending: false })
      .limit(limit),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email.toLowerCase())
      .is("read_at", null),
  ]);

  return NextResponse.json({
    notifications: listRes.data ?? [],
    unread:        countRes.count ?? 0,
    has_more:      (listRes.data ?? []).length === limit,
    next_cursor:   (listRes.data ?? []).at(-1)?.created_at ?? null,
  });
}

// POST /api/notifications/mark-all-read  { email }
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  // Ownership check: the token must belong to the email being updated.
  const caller = tokenEmail(req);
  if (!caller || caller.toLowerCase() !== (email as string).toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();
  await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_email", (email as string).toLowerCase())
    .is("read_at", null);

  return NextResponse.json({ success: true });
}
