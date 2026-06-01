import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const db    = getSupabaseServer();
    const email = new URL(req.url).searchParams.get("email");

    let q = db
      .from("coach_questions")
      .select("id, user_email, user_name, category, question, answer, answered_at, status, created_at")
      .order("created_at", { ascending: false });

    if (email) q = q.eq("user_email", email);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ questions: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user_email, user_name, category, question } = await req.json();
    if (!user_email || !question?.trim()) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const db = getSupabaseServer();
    const { data, error } = await db
      .from("coach_questions")
      .insert({ user_email, user_name, category: category || "General", question: question.trim(), status: "pending" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ question: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
