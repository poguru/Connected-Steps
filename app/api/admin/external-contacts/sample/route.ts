import { NextResponse } from "next/server";
import { generateSampleCsv } from "@/lib/external-contacts-import";

// GET /api/admin/external-contacts/sample — download sample CSV template
export async function GET() {
  const csv = generateSampleCsv();
  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-import-template.csv"`,
      "Cache-Control":       "no-store",
    },
  });
}
