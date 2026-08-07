/**
 * External Contacts import parser.
 * Supports XLSX and CSV. Returns structured rows with per-row validation errors.
 * Server-side only (uses xlsx package).
 */

import * as XLSX from "xlsx";

export interface ImportRow {
  row:         number;
  full_name:   string;
  company_name?: string;
  designation?:  string;
  email?:        string;
  mobile?:       string;
  whatsapp_number?: string;
  city?:         string;
  state?:        string;
  country?:      string;
  tags?:         string[];
  email_consent?: boolean;
  whatsapp_consent?: boolean;
  sms_consent?:  boolean;
  notes?:        string;
  errors:        string[];
  warnings:      string[];
  isDuplicate?:  { field: "email" | "mobile" | "whatsapp"; existingId: string };
}

// Expected column header → internal field name
const COLUMN_MAP: Record<string, keyof Omit<ImportRow, "row" | "errors" | "warnings" | "isDuplicate">> = {
  // English headers (spec)
  "name":            "full_name",
  "full name":       "full_name",
  "full_name":       "full_name",
  "company":         "company_name",
  "company name":    "company_name",
  "company_name":    "company_name",
  "organisation":    "company_name",
  "organization":    "company_name",
  "designation":     "designation",
  "title":           "designation",
  "job title":       "designation",
  "email":           "email",
  "email address":   "email",
  "email_address":   "email",
  "mobile":          "mobile",
  "phone":           "mobile",
  "mobile number":   "mobile",
  "phone number":    "mobile",
  "whatsapp":        "whatsapp_number",
  "whatsapp number": "whatsapp_number",
  "whatsapp_number": "whatsapp_number",
  "city":            "city",
  "state":           "state",
  "country":         "country",
  "tags":            "tags",
  "tag":             "tags",
  "consent":         "email_consent",
  "email consent":   "email_consent",
  "whatsapp consent":"whatsapp_consent",
  "sms consent":     "sms_consent",
  "notes":           "notes",
  "note":            "notes",
  "remarks":         "notes",
};

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

function normalisePhone(v: string): string {
  const digits = v.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function parseConsentValue(v: string | undefined): boolean {
  if (!v) return false;
  const s = String(v).toLowerCase().trim();
  return ["yes", "true", "1", "y", "agreed", "consent"].includes(s);
}

function parseTags(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
}

function validateEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function parseImportBuffer(
  buffer: Buffer,
  filename: string,
): ImportRow[] {
  const ext  = filename.split(".").pop()?.toLowerCase() ?? "csv";
  const wb   = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const raw  = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });

  if (!raw.length) return [];

  // Map headers
  const headerMap: Record<string, keyof Omit<ImportRow, "row" | "errors" | "warnings" | "isDuplicate">> = {};
  const sampleKeys = Object.keys(raw[0]);
  for (const key of sampleKeys) {
    const norm = normaliseHeader(key);
    if (COLUMN_MAP[norm]) headerMap[key] = COLUMN_MAP[norm];
  }

  return raw.map((rawRow, i) => {
    const row: ImportRow = { row: i + 2, full_name: "", errors: [], warnings: [] };

    for (const [rawKey, field] of Object.entries(headerMap)) {
      const value = String(rawRow[rawKey] ?? "").trim();
      if (!value) continue;

      switch (field) {
        case "full_name":        row.full_name        = value;                   break;
        case "company_name":     row.company_name     = value;                   break;
        case "designation":      row.designation      = value;                   break;
        case "email":            row.email            = value.toLowerCase();     break;
        case "mobile":           row.mobile           = normalisePhone(value);   break;
        case "whatsapp_number":  row.whatsapp_number  = normalisePhone(value);   break;
        case "city":             row.city             = value;                   break;
        case "state":            row.state            = value;                   break;
        case "country":          row.country          = value;                   break;
        case "tags":             row.tags             = parseTags(value);        break;
        case "email_consent":    row.email_consent    = parseConsentValue(value);break;
        case "whatsapp_consent": row.whatsapp_consent = parseConsentValue(value);break;
        case "sms_consent":      row.sms_consent      = parseConsentValue(value);break;
        case "notes":            row.notes            = value;                   break;
      }
    }

    // Validation
    if (!row.full_name) row.errors.push("Name is required");
    if (!row.email && !row.mobile && !row.whatsapp_number) {
      row.warnings.push("No contact information (email, mobile, or WhatsApp)");
    }
    if (row.email && !validateEmail(row.email)) {
      row.errors.push(`Invalid email: ${row.email}`);
      delete row.email;
    }
    if (row.mobile && row.mobile.replace(/\D/g, "").length < 10) {
      row.warnings.push(`Short mobile number: ${row.mobile}`);
    }

    return row;
  });
}

export function generateSampleCsv(): string {
  const header = ["Name","Company","Designation","Email","Mobile","WhatsApp","City","State","Country","Tags","Email Consent","WhatsApp Consent","SMS Consent","Notes"];
  const sample = [
    ["Rahul Sharma","Acme Corp","Marketing Manager","rahul@acme.com","+919876543210","+919876543210","Hyderabad","Telangana","India","Corporate,HR","Yes","Yes","No","Key contact for marathon"],
    ["Priya Reddy","TechStart","CEO","priya@techstart.in","+919999888877","","Bangalore","Karnataka","India","Sponsor","Yes","No","No",""],
    ["Anand Gupta","","","anand@gmail.com","","","Mumbai","Maharashtra","India","Media","No","No","No",""],
  ];
  const rows = [header, ...sample].map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(","));
  return rows.join("\n");
}
