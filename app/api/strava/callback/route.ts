import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/dashboard?strava=denied", req.url));
  }

  try {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL("/dashboard?strava=error", req.url));
    }

    const data = await res.json();

    const params = new URLSearchParams({
      strava:        "connected",
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    String(data.expires_at),
      athlete_id:    String(data.athlete.id),
      athlete_name:  `${data.athlete.firstname} ${data.athlete.lastname}`,
    });

    return NextResponse.redirect(new URL(`/dashboard?${params}`, req.url));
  } catch {
    return NextResponse.redirect(new URL("/dashboard?strava=error", req.url));
  }
}
