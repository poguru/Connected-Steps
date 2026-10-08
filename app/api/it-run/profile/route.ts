import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";

// GET /api/it-run/profile
// Returns auto-fill data for the authenticated CS user:
//   - Basic profile from the users table
//   - Most recent IT Run participant data (for blood group, emergency contact, etc.)
// Requires cs_user_session cookie.
export async function GET(req: NextRequest) {
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  // Fetch CS profile (email is already normalized to lowercase)
  const { data: user, error: userErr } = await db
    .from("users")
    .select("first_name, last_name, phone, date_of_birth")
    .eq("email", userEmail)
    .maybeSingle<{
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      date_of_birth: string | null;
    }>();

  if (userErr) {
    console.error("[it-run/profile] user lookup error:", userErr.message);
  }

  // Fetch most recent IT Run participant data for this email
  // (blood group, emergency contacts, company, t-shirt, BIB name, etc.)
  const { data: lastPart, error: partErr } = await db
    .from("it_run_participants")
    .select(`
      bib_name, gender, blood_group, emergency_name, emergency_phone,
      company_name, employee_id, tshirt_size, food_preference, medical_conditions
    `)
    .eq("email", userEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      bib_name: string | null;
      gender: string | null; blood_group: string | null;
      emergency_name: string | null; emergency_phone: string | null;
      company_name: string | null; employee_id: string | null;
      tshirt_size: string | null; food_preference: string | null;
      medical_conditions: string | null;
    }>();

  if (partErr) {
    console.error("[it-run/profile] participant lookup error:", partErr.message);
  }

  return NextResponse.json({
    firstName:        user?.first_name       ?? "",
    lastName:         user?.last_name        ?? "",
    bibName:          lastPart?.bib_name     ?? "",
    mobile:           user?.phone            ?? "",
    dob:              user?.date_of_birth    ?? "",
    gender:           lastPart?.gender       ?? "",
    bloodGroup:       lastPart?.blood_group  ?? "",
    emergencyName:    lastPart?.emergency_name  ?? "",
    emergencyPhone:   lastPart?.emergency_phone ?? "",
    companyName:      lastPart?.company_name    ?? "",
    employeeId:       lastPart?.employee_id     ?? "",
    tshirtSize:       lastPart?.tshirt_size     ?? "",
    foodPreference:   lastPart?.food_preference ?? "",
    medicalConditions: lastPart?.medical_conditions ?? "",
  });
}
