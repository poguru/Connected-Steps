import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

const FREE_LIMIT = parseInt(process.env.FOOD_FREE_ANALYSES_LIMIT ?? "3", 10);

export async function GET(req: NextRequest) {
  if (process.env.FOOD_ANALYZER_ENABLED !== "true") {
    return NextResponse.json({ disabled: true, analyses: [], usage: { used: 0, limit: FREE_LIMIT, is_premium: false } });
  }

  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db  = getSupabaseServer();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [historyRes, membershipRes, usageRes] = await Promise.all([
    db.from("food_analyses")
      .select("id, image_data, detected_foods, nutrition, health_score, health_grade, meal_type, created_at")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("memberships")
      .select("status, expires_at")
      .eq("user_email", userEmail)
      .eq("status", "active")
      .maybeSingle(),
    db.from("food_analyses")
      .select("id", { count: "exact", head: true })
      .eq("user_email", userEmail)
      .gte("created_at", monthStart),
  ]);

  const isPremium    = !!(membershipRes.data && new Date(membershipRes.data.expires_at) > now);
  const monthlyCount = usageRes.count ?? 0;

  return NextResponse.json({
    analyses: historyRes.data ?? [],
    usage: {
      used:       monthlyCount,
      limit:      isPremium ? null : FREE_LIMIT,
      is_premium: isPremium,
    },
  });
}

export async function POST(req: NextRequest) {
  if (process.env.FOOD_ANALYZER_ENABLED !== "true") {
    return NextResponse.json({ error: "AI Food Analyzer is coming soon.", code: "DISABLED" }, { status: 503 });
  }

  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    image_data,
    detected_foods,
    nutrition,
    health_score,
    health_grade,
    health_grade_reason,
    healthy_ingredients,
    concerns,
    goal_recommendation,
    missing_nutrients,
    meal_type,
  } = body as Record<string, unknown>;

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("food_analyses")
    .insert({
      user_email:          userEmail,
      image_data:          (image_data as string | null) ?? null,
      detected_foods:      detected_foods ?? [],
      nutrition:           nutrition ?? {},
      health_score:        (health_score as number | null) ?? null,
      health_grade:        (health_grade as string | null) ?? null,
      health_grade_reason: (health_grade_reason as string | null) ?? null,
      healthy_ingredients: healthy_ingredients ?? [],
      concerns:            concerns ?? [],
      goal_recommendation: goal_recommendation ?? null,
      missing_nutrients:   missing_nutrients ?? [],
      meal_type:           (meal_type as string | null) ?? null,
    })
    .select("id, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at });
}
