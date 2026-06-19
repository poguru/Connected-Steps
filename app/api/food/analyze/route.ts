import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

const FREE_LIMIT = parseInt(process.env.FOOD_FREE_ANALYSES_LIMIT ?? "3", 10);

const GOAL_CONTEXTS: Record<string, string> = {
  "5k":       "The user is training for a 5K run. Prioritise carbohydrate timing for energy, lean protein for muscle repair, and hydration.",
  "10k":      "The user is training for a 10K run. Emphasise energy-sustaining complex carbs, lean protein, and iron-rich foods.",
  "half":     "The user is training for a half marathon. Focus on glycogen fuelling, electrolyte balance, and post-run recovery nutrition.",
  "full":     "The user is training for a full marathon. Carb loading strategy, long-run fuelling, and full recovery nutrition are critical.",
  "ultra":    "The user is training for an ultra marathon. High calorie needs, fat adaptation, gut-friendly foods, and sustained energy.",
  "speed":    "The user is focused on speed and pace improvement. Quick-digesting energy sources, caffeine timing, and fast-acting protein.",
  "fitness":  "The user wants general health and fitness. Balanced macros, whole foods, adequate fibre, and moderate portions.",
  "weight":   "The user wants to lose weight. Focus on calorie deficit, high-satiety foods, preserving lean muscle with protein, and fibre.",
  "strength": "The user wants to build strength and muscle. Prioritise high protein intake, complex carbs for training energy, and recovery nutrition.",
};

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db  = getSupabaseServer();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [membershipRes, usageRes] = await Promise.all([
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

  if (!isPremium && monthlyCount >= FREE_LIMIT) {
    return NextResponse.json({
      error:   "FREE_LIMIT_REACHED",
      message: `You've used all ${FREE_LIMIT} free analyses this month. Upgrade to Premium for unlimited meal analyses.`,
      limit:   FREE_LIMIT,
      used:    monthlyCount,
    }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { image_base64, meal_type, goal } = body as {
    image_base64?: string;
    meal_type?: string;
    goal?: string;
  };

  if (!image_base64) return NextResponse.json({ error: "image_base64 required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI service not configured" }, { status: 500 });

  // Strip data-URL prefix and detect media type
  const mediaType  = image_base64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
  const base64Data = image_base64.replace(/^data:image\/[a-z]+;base64,/, "");

  const goalContext = GOAL_CONTEXTS[goal ?? ""] ?? GOAL_CONTEXTS["fitness"];

  const prompt = `You are a professional nutritionist AI specialising in Indian and international cuisines. Analyse the food in this image carefully.

User's fitness goal: ${goalContext}

Return ONLY a valid JSON object — no markdown, no extra text, no code fences:

{
  "detected_foods": [
    { "name": "food item name", "quantity": "estimated portion (e.g. 1 cup, 150g, 2 pieces)", "confidence": 0.85 }
  ],
  "nutrition": {
    "calories": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0,
    "fiber_g": 0,
    "sugar_g": 0,
    "sodium_mg": 0,
    "confidence": 0.75
  },
  "health_score": 75,
  "health_grade": "Good",
  "health_grade_reason": "Brief one-sentence explanation of the score.",
  "healthy_ingredients": ["specific healthy component 1", "specific healthy component 2"],
  "concerns": ["specific concern 1 (e.g. High saturated fat)", "specific concern 2"],
  "goal_recommendation": {
    "summary": "One sentence tailored to the user's goal.",
    "tips": ["Actionable tip 1", "Actionable tip 2"],
    "add_foods": ["Suggested food addition 1", "Suggested food addition 2"]
  },
  "missing_nutrients": [
    { "nutrient": "Nutrient name", "suggestion": "How to get it from food" }
  ]
}

Rules:
- health_score is 0–100 (100 = optimal whole-food meal, 0 = very unhealthy)
- health_grade must be exactly one of: "Excellent", "Good", "Average", "Needs Improvement"
- Be specific about Indian foods: rice, dal, roti, paneer, sabzi, biryani, idli, dosa, curry, sambar, chole, rajma, khichdi, etc.
- Estimate portions realistically based on visible plate/bowl size
- If no food is visible, set detected_foods to [] and health_score to 0 with grade "Needs Improvement"
- Keep all text concise and practical — no padding`;

  try {
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key":         apiKey,
      },
      body: JSON.stringify({
        model:      process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type:   "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      let anthropicType = "";
      let anthropicMsg  = "";
      try {
        const j   = JSON.parse(errText) as { error?: { type?: string; message?: string } };
        anthropicType = j?.error?.type    ?? "";
        anthropicMsg  = j?.error?.message ?? "";
      } catch { /* non-JSON error body */ }
      console.error("[food/analyze] Anthropic error:", { status: aiResponse.status, type: anthropicType, message: anthropicMsg });

      if (aiResponse.status === 401) {
        return NextResponse.json({ error: "AI service key is invalid or expired. Please contact support." }, { status: 500 });
      }
      if (aiResponse.status === 429) {
        return NextResponse.json({ error: "AI service is temporarily overloaded. Please try again in a few seconds." }, { status: 503 });
      }
      if (aiResponse.status === 400 || aiResponse.status === 404) {
        return NextResponse.json({ error: "Unable to process this image. Please try a clearer, well-lit photo." }, { status: 422 });
      }
      return NextResponse.json({ error: `AI analysis unavailable (${aiResponse.status}). Please try again shortly.` }, { status: 502 });
    }

    const aiData = await aiResponse.json() as {
      content?: { type: string; text: string }[];
    };
    const textBlock = aiData.content?.find(c => c.type === "text");
    if (!textBlock) return NextResponse.json({ error: "No response from AI" }, { status: 500 });

    // Parse JSON — Claude occasionally wraps it in markdown fences
    let analysis;
    try {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      analysis = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("[food/analyze] JSON parse failed:", textBlock.text.slice(0, 200));
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({
      analysis,
      meal_type: meal_type ?? null,
      usage: {
        used:       monthlyCount + 1,
        limit:      isPremium ? null : FREE_LIMIT,
        is_premium: isPremium,
      },
    });
  } catch (e) {
    console.error("[food/analyze] Unexpected error:", e);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
