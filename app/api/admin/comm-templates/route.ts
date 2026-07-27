import { NextRequest, NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

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

// GET /api/admin/comm-templates
// Returns all saved email templates, newest first.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("comm_templates")
    .select("id, name, subject, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

// POST /api/admin/comm-templates
// Body: { name, subject, body_html }
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; subject?: string; body_html?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!body.subject?.trim()) return NextResponse.json({ error: "subject is required" }, { status: 400 });
  if (!body.body_html?.trim()) return NextResponse.json({ error: "body_html is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("comm_templates")
    .insert({
      name:      body.name.trim(),
      subject:   body.subject.trim(),
      body_html: sanitizeHtml(body.body_html, SANITIZE_OPTIONS),
    })
    .select("id, name, subject, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data }, { status: 201 });
}
