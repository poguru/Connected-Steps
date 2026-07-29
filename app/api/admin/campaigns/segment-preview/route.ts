import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { resolveSegment, filterByConsent, type SegmentType, type SegmentConfig } from "@/lib/campaign-service";

// POST /api/admin/campaigns/segment-preview
// Body: { segment_type, segment_config, channel, message_type, is_transactional }
// Returns: { count, sample: Recipient[] }
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    segment_type:    SegmentType;
    segment_config:  SegmentConfig;
    channel?:        "email" | "whatsapp";
    message_type?:   string;
    is_transactional?: boolean;
  };

  const recipients = await resolveSegment(body.segment_type, body.segment_config ?? {});

  const filtered = body.is_transactional === false
    ? await filterByConsent(
        recipients,
        body.channel ?? "email",
        body.message_type ?? "general_update",
        false,
      )
    : recipients;

  return NextResponse.json({
    count:  filtered.length,
    sample: filtered.slice(0, 5).map(r => ({ email: r.email, name: `${r.firstName} ${r.lastName}`.trim() })),
  });
}
