import { NextRequest, NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p","br","div","span","h1","h2","h3","h4","h5","h6",
    "strong","b","em","i","u","s","strike","del","sup","sub",
    "ul","ol","li","blockquote","pre","code","hr",
    "a","img","table","thead","tbody","tr","th","td","mark",
  ],
  allowedAttributes: {
    "*":   ["style","class"],
    "a":   ["href","target","rel"],
    "img": ["src","alt","width","height","style"],
  },
  allowedSchemes: ["https","http","mailto"],
};

// GET /api/admin/comm-templates/[id]
// Returns the full template including body_html (used when loading into the editor).
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();
  const { data, error } = await db.from("comm_templates").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template: data });
}

// PATCH /api/admin/comm-templates/[id]
// Partial update: name, subject, body_html, description, status
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    name?: string; subject?: string; body_html?: string;
    description?: string; status?: string;
    action?: "duplicate" | "archive" | "activate";
  };

  // Handle shorthand action aliases
  if (body.action === "archive")  body.status = "archived";
  if (body.action === "activate") body.status = "active";

  if (body.action === "duplicate") {
    const db = getSupabaseServer();
    const { data: src } = await db.from("comm_templates").select("*").eq("id", id).single();
    if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: dup, error } = await db
      .from("comm_templates")
      .insert({
        name:        `${src.name} (Copy)`,
        subject:     src.subject,
        body_html:   src.body_html,
        description: src.description,
        status:      "draft",
      })
      .select("id, name, subject, description, status, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template: dup }, { status: 201 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name       !== undefined) updates.name        = body.name.trim();
  if (body.subject    !== undefined) updates.subject     = body.subject.trim();
  if (body.body_html  !== undefined) updates.body_html   = sanitizeHtml(body.body_html, SANITIZE_OPTIONS);
  if (body.description !== undefined) updates.description = body.description?.trim() ?? null;
  if (body.status     !== undefined) {
    if (!["draft", "active", "archived"].includes(body.status))
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("comm_templates")
    .update(updates)
    .eq("id", id)
    .select("id, name, subject, description, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template: data });
}

// DELETE /api/admin/comm-templates/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();
  const { error } = await db.from("comm_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
