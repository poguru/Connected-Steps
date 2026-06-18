import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// GET /api/coaches
//   With x-user-token: returns Admin coaches + coaches assigned to this user
//   Without token:     returns all active coaches (admin panel use)
export async function GET(req: NextRequest) {
  try {
    const db        = getSupabaseServer();
    const userToken = req.headers.get("x-user-token");

    if (userToken) {
      const userEmail = verifyUserToken(userToken);
      if (!userEmail) return NextResponse.json({ coaches: [] });

      // 1. Fetch this user's active assignments
      const { data: assignments } = await db
        .from("coach_assignments")
        .select("coach_id")
        .eq("user_email", userEmail.toLowerCase())
        .eq("is_active", true);

      const assignedIds = (assignments ?? []).map((r: { coach_id: string }) => r.coach_id);

      // 2. Fetch admin/system coaches (always visible)
      const { data: adminCoaches } = await db
        .from("coaches")
        .select("id, name, specialization, email, avatar_url, bio, is_admin")
        .eq("is_active", true)
        .eq("is_admin", true)
        .order("name");

      // 3. Fetch assigned coaches (exclude any already in admin list)
      const adminIds = (adminCoaches ?? []).map((c: { id: string }) => c.id);
      const idsToFetch = assignedIds.filter((id: string) => !adminIds.includes(id));

      let assignedCoaches: unknown[] = [];
      if (idsToFetch.length > 0) {
        const { data } = await db
          .from("coaches")
          .select("id, name, specialization, email, avatar_url, bio, is_admin")
          .eq("is_active", true)
          .in("id", idsToFetch)
          .order("name");
        assignedCoaches = data ?? [];
      }

      // Admin coaches first, then assigned coaches
      const coaches = [...(adminCoaches ?? []), ...assignedCoaches];
      return NextResponse.json({ coaches });
    }

    // No token — return all active coaches (for admin panel)
    const { data, error } = await db
      .from("coaches")
      .select("id, name, specialization, email, avatar_url, bio, is_admin")
      .eq("is_active", true)
      .order("is_admin", { ascending: false })
      .order("name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ coaches: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
