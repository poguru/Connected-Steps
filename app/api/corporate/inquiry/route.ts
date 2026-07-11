import { NextRequest, NextResponse } from "next/server";

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? "info@connectedsteps.in";

export async function POST(req: NextRequest) {
  try {
    const { name, company, phone, size, message } = await req.json();
    if (!name || !company || !phone) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const { sendSingleEmail } = await import("@/lib/email-service");
    await sendSingleEmail({
      to:      ADMIN_EMAIL,
      subject: `New corporate inquiry â€” ${company} (${size || "size not specified"})`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#111;border-radius:10px;overflow:hidden;">
          <div style="background:#0d0d0d;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.07);">
            <span style="font-size:1rem;font-weight:700;color:#fff;">Connected Steps</span>
            <span style="font-size:0.8rem;color:#888;margin-left:8px;">Corporate Inquiry</span>
          </div>
          <div style="padding:24px;">
            <table style="width:100%;border-collapse:collapse;font-size:0.875rem;color:#ccc;">
              <tr><td style="padding:6px 0;color:#888;width:120px;">Name</td><td style="color:#fff;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:6px 0;color:#888;">Company</td><td style="color:#fff;font-weight:600;">${company}</td></tr>
              <tr><td style="padding:6px 0;color:#888;">Phone</td><td style="color:#fff;">${phone}</td></tr>
              <tr><td style="padding:6px 0;color:#888;">Team Size</td><td style="color:#fff;">${size || "Not specified"}</td></tr>
              ${message ? `<tr><td style="padding:6px 0;color:#888;vertical-align:top;">Message</td><td style="color:#ddd;">${message}</td></tr>` : ""}
            </table>
            <div style="margin-top:20px;">
              <a href="https://wa.me/${phone.replace(/\D/g, '')}" style="display:inline-block;padding:10px 20px;background:#25D366;color:#fff;border-radius:6px;text-decoration:none;font-size:0.85rem;font-weight:600;">
                Reply on WhatsApp â†’
              </a>
            </div>
          </div>
        </div>`,
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
