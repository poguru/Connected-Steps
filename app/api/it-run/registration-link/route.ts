import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";

// POST /api/it-run/registration-link
// Generates a deep link to registration details for email
// User can access their own registration without email token
export async function POST(req: NextRequest) {
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { registration_id } = await req.json() as { registration_id: string };

  if (!registration_id) {
    return NextResponse.json(
      { error: "registration_id is required" },
      { status: 400 }
    );
  }

  const db = getSupabaseServer();

  // Verify registration belongs to user
  const { data: reg, error } = await db
    .from("it_run_registrations")
    .select("id, registration_code")
    .eq("id", registration_id)
    .eq("linked_user_email", userEmail)
    .single();

  if (error || !reg) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  // Return authenticated link
  // User is already authenticated via session cookie
  // No additional token needed
  const registrationLink = `/it-run/registrations/${registration_id}`;
  const myRegistrationsLink = `/it-run/my-registrations`;

  return NextResponse.json({
    registration_link: registrationLink,
    my_registrations_link: myRegistrationsLink,
    registration_code: reg.registration_code,
  });
}
