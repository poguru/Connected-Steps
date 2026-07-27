export function parseCsvSimple(text: string): Record<string, string>[] {
  const lines   = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? "").trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === "," && !inQuote) {
      result.push(current); current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

export interface ValidationError { row: number; field: string; error: string; }

const REQUIRED_FIELDS: Record<string, string[]> = {
  participants:  ["first_name", "last_name", "email"],
  registrations: ["event_id", "participant_email", "race_id"],
  volunteers:    ["name", "email", "role"],
  merchandise:   ["name", "sku", "price"],
  sponsors:      ["name", "tier", "contact_email"],
  coupons:       ["code", "discount_type", "discount_value"],
};

export function validateImportRows(
  rows: Record<string, string>[],
  entityType: string,
): { valid_rows: number; error_rows: number; validation_report: ValidationError[][] } {
  const required       = REQUIRED_FIELDS[entityType] ?? [];
  const validation_report: ValidationError[][] = [];
  let valid_rows  = 0;
  let error_rows  = 0;

  rows.forEach((row, i) => {
    const errors: ValidationError[] = [];

    for (const field of required) {
      if (!row[field]?.trim()) {
        errors.push({ row: i + 2, field, error: `${field} is required` });
      }
    }

    // Type-specific extra validation
    if (entityType === "participants" && row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push({ row: i + 2, field: "email", error: "Invalid email format" });
    }
    if (entityType === "coupons") {
      const dtype = row.discount_type;
      if (dtype && !["percent", "fixed"].includes(dtype)) {
        errors.push({ row: i + 2, field: "discount_type", error: 'Must be "percent" or "fixed"' });
      }
      const dval = Number(row.discount_value);
      if (row.discount_value && (isNaN(dval) || dval <= 0)) {
        errors.push({ row: i + 2, field: "discount_value", error: "Must be a positive number" });
      }
    }
    if (entityType === "merchandise") {
      const price = Number(row.price);
      if (row.price && (isNaN(price) || price < 0)) {
        errors.push({ row: i + 2, field: "price", error: "Must be a non-negative number" });
      }
    }

    validation_report.push(errors);
    if (errors.length === 0) valid_rows++; else error_rows++;
  });

  return { valid_rows, error_rows, validation_report };
}
