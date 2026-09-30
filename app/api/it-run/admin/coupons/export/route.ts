import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

function esc(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
}

function derivedStatus(c: Record<string, unknown>): string {
  if (!c.is_active) return "Disabled";
  const now = Date.now();
  if (c.valid_from && new Date(c.valid_from as string).getTime() > now) return "Scheduled";
  if (c.expires_at && new Date(c.expires_at as string).getTime() < now) return "Expired";
  if (c.max_uses != null && Number(c.use_count) >= Number(c.max_uses)) return "Exhausted";
  return "Active";
}

// GET /api/it-run/admin/coupons/export
// Returns all coupons for the sprint-2 event as a CSV download.
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event } = await db
    .from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: coupons, error } = await db
    .from("it_run_coupons")
    .select("*")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch category names for applicable_category_ids
  const { data: cats } = await db
    .from("it_run_categories")
    .select("id, name")
    .eq("event_id", event.id);
  const catMap = Object.fromEntries((cats ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

  const header = [
    "Code", "Type", "Discount Type", "Discount Value",
    "Min Amount", "Max Uses", "Current Uses", "Remaining Uses",
    "Valid From", "Valid Until", "Applicable Categories",
    "Status", "Description", "Active", "Created At",
  ].join(",");

  const rows = (coupons ?? []).map((c: Record<string, unknown>) => {
    const cats = Array.isArray(c.applicable_category_ids) && c.applicable_category_ids.length > 0
      ? (c.applicable_category_ids as string[]).map(id => catMap[id] ?? id).join("; ")
      : "All";
    const discount = c.discount_type === "flat"
      ? `₹${c.discount_value} flat`
      : `${c.discount_value}% percent`;
    const maxUses = c.max_uses != null ? String(c.max_uses) : "Unlimited";
    const remaining = c.max_uses != null
      ? String(Math.max(0, Number(c.max_uses) - Number(c.use_count ?? 0)))
      : "Unlimited";

    return [
      esc(c.code as string),
      esc(c.coupon_type as string ?? "generic"),
      esc(c.discount_type as string),
      esc(String(c.discount_value)),
      esc(c.min_amount != null ? `₹${c.min_amount}` : ""),
      esc(maxUses),
      esc(String(c.use_count ?? 0)),
      esc(remaining),
      esc(c.valid_from ? new Date(c.valid_from as string).toLocaleString("en-IN") : ""),
      esc(c.expires_at ? new Date(c.expires_at as string).toLocaleString("en-IN") : ""),
      esc(cats),
      esc(derivedStatus(c)),
      esc(c.description as string | null),
      esc(c.is_active ? "Yes" : "No"),
      esc(c.created_at ? new Date(c.created_at as string).toLocaleString("en-IN") : ""),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const filename = `it-run-coupons-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
