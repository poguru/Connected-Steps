/**
 * Shared HTML email layout primitives for Connected Steps transactional emails.
 *
 * All emails follow the same structure:
 *   emailWrapper(
 *     emailHeader()   ← black header + orange accent bar
 *     ... body rows ...
 *     emailFooter()   ← grey footer with address + WhatsApp link
 *   )
 *
 * Consumers: lib/notify.ts, lib/session-reminder-email.ts,
 *            lib/weekly-digest-email.ts, lib/daily-attendance-qr.ts,
 *            and any future transactional email builder.
 *
 * Design tokens:
 *   Background:  #f4f4f5
 *   Card bg:     #ffffff, border-radius: 12px
 *   Header bg:   #0a0a0a (brand black)
 *   Accent:      #e8620a (brand orange)
 *   Muted text:  #888888, #aaaaaa
 *   Body text:   #555555
 *   Footer bg:   #f9f9f9
 */

import {
  APP_URL,
  SUPPORT_WHATSAPP_URL,
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_ORANGE,
  BRAND_ADDRESS,
} from "@/lib/config";

// ── Shell ─────────────────────────────────────────────────────────────────────

/**
 * Wraps arbitrary table row content in the standard email HTML shell.
 * Pass the output of emailHeader() + body rows + emailFooter() as `rows`.
 */
export function emailWrapper(rows: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      ${rows}
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Header ────────────────────────────────────────────────────────────────────

/**
 * Standard black header with brand name and orange accent bar.
 * @param tagline - Overridable tagline; defaults to brand tagline.
 * @param accentColor - Accent bar color; defaults to brand orange.
 */
export function emailHeader(
  tagline    = BRAND_TAGLINE,
  accentColor = BRAND_ORANGE,
): string {
  return `
  <tr><td style="background:#0a0a0a;padding:28px 40px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">${BRAND_NAME}</div>
    <div style="font-size:11px;color:${BRAND_ORANGE};letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">${tagline}</div>
  </td></tr>
  <tr><td style="height:4px;background:${accentColor};"></td></tr>`;
}

// ── Footer ────────────────────────────────────────────────────────────────────

/**
 * Standard grey footer with address, WhatsApp link, and homepage link.
 */
export function emailFooter(): string {
  return `
  <tr><td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:20px 40px;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;color:#aaa;">${BRAND_ADDRESS}</p>
    <p style="margin:0;font-size:11px;color:#ccc;">Questions? <a href="${SUPPORT_WHATSAPP_URL}" style="color:${BRAND_ORANGE};text-decoration:none;">WhatsApp us</a> · <a href="${APP_URL}" style="color:${BRAND_ORANGE};text-decoration:none;">connectedsteps.in</a></p>
  </td></tr>`;
}

// ── Button ────────────────────────────────────────────────────────────────────

/**
 * Orange CTA button centered in a table row.
 * Wrap in <table cellpadding="0" cellspacing="0" style="margin:0 auto Xpx;"> at the call site
 * when you need margin control, or use emailCTARow() for a full row.
 */
export function emailButton(label: string, href: string, bg = BRAND_ORANGE): string {
  return `<tr><td style="background:${bg};border-radius:6px;">
    <a href="${href}" style="display:block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">${label}</a>
  </td></tr>`;
}

/**
 * A centered CTA button wrapped in its own table, with bottom margin.
 * Use inside emailWrapper rows.
 */
export function emailCTARow(label: string, href: string, marginBottom = "32px", bg = BRAND_ORANGE): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:0 auto ${marginBottom};">
    ${emailButton(label, href, bg)}
  </table>`;
}

// ── Info card ─────────────────────────────────────────────────────────────────

/**
 * A bordered info card with two-column label/value rows.
 * @param rows - Array of [label, value] pairs.
 */
export function emailInfoCard(rows: [string, string][], marginBottom = "32px"): string {
  const rowHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:5px 0;font-size:13px;color:#888;width:38%;vertical-align:top;">${label}</td>
      <td style="padding:5px 0;font-size:14px;color:#0a0a0a;font-weight:600;">${value}</td>
    </tr>`).join("");
  return `
  <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:12px;padding:20px 24px;margin-bottom:${marginBottom};">
    <table width="100%" cellpadding="0" cellspacing="0">${rowHtml}</table>
  </div>`;
}

// ── Alert box ─────────────────────────────────────────────────────────────────

/**
 * An orange-tinted alert/callout box.
 */
export function emailAlert(html: string): string {
  return `
  <div style="background:#fff8f0;border:1px solid #fde0bc;border-radius:10px;padding:14px 18px;margin-bottom:28px;">
    <p style="margin:0;font-size:13px;color:#c05c00;line-height:1.6;">${html}</p>
  </div>`;
}
