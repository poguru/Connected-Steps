import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { answer } = await req.json();
    if (!answer?.trim()) {
      return NextResponse.json({ error: "Answer cannot be empty." }, { status: 400 });
    }

    const db = getSupabaseServer();
    const { data, error } = await db
      .from("coach_questions")
      .update({ answer: answer.trim(), answered_at: new Date().toISOString(), status: "answered" })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ question: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
