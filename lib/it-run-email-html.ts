/**
 * The HTML an admin may put in an event update, reduced to a short safe list: paragraphs, line breaks, bold, italic,
 * lists, and links to https addresses. Anything else is dropped, and its text is kept as plain text. Scripts, styles and
 * event attributes never survive. Pure, so it can be tested directly.
 */

const ALLOWED_TAGS = new Set(["p", "br", "b", "strong", "i", "em", "ul", "ol", "li", "a"]);
const MAX_HREF_LENGTH = 500;
const TAG = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)>$/;

function escapeText(text: string): string {
  // Entities already written by the admin are kept; a bare & is escaped
  return text
    .replace(/&(?!#?\w+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The link target when it is an https address, otherwise null. */
export function safeHttpsHref(href: string): string | null {
  const value = href.trim();
  if (value.length === 0 || value.length > MAX_HREF_LENGTH || /\s/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname) return null;
  return url.toString();
}

function attribute(tagAttributes: string, name: string): string | null {
  const match = new RegExp(`${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`, "i").exec(tagAttributes);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/** Keeps the allowed tags and https links, escapes all other text, and drops everything else. */
export function sanitizeEmailHtml(input: string): string {
  const parts = input.split(/(<[^<>]*>)/);
  let out = "";
  // Only a link that was actually opened is closed, so a dropped link leaves no stray closing tag
  let anchorOpen = false;
  for (const part of parts) {
    if (part === "") continue;
    const tag = TAG.exec(part);
    if (!tag) {
      out += escapeText(part);
      continue;
    }
    const closing = tag[1] === "/";
    const name = tag[2].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;
    if (name === "a") {
      if (closing) { if (anchorOpen) out += "</a>"; anchorOpen = false; continue; }
      const href = attribute(tag[3] ?? "", "href");
      const safe = href ? safeHttpsHref(href) : null;
      // A link without a safe https target keeps its text, not the link
      if (safe) { out += `<a href="${escapeText(safe)}" style="color:#e8620a;">`; anchorOpen = true; }
      continue;
    }
    if (name === "br") { out += "<br>"; continue; }
    out += closing ? `</${name}>` : `<${name}>`;
  }
  return out;
}
