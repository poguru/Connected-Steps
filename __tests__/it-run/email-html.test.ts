import { sanitizeEmailHtml, safeHttpsHref } from "@/lib/it-run-email-html";

describe("sanitizeEmailHtml", () => {
  it("keeps paragraphs, bold, italic, lists and line breaks", () => {
    expect(sanitizeEmailHtml("<p><b>Bold</b> and <i>italic</i></p><ul><li>One</li></ul>Line<br>two"))
      .toBe("<p><b>Bold</b> and <i>italic</i></p><ul><li>One</li></ul>Line<br>two");
  });

  it("drops scripts and event attributes, keeping only their text", () => {
    const out = sanitizeEmailHtml(`<script>alert(1)</script><p onclick="steal()">Hi</p><img src=x onerror=alert(1)>`);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onclick|onerror/i);
    expect(out).toContain("Hi");
  });

  it("keeps https links and drops javascript and plain http links", () => {
    expect(sanitizeEmailHtml(`<a href="https://example.com/x">Venue</a>`))
      .toBe(`<a href="https://example.com/x" style="color:#e8620a;">Venue</a>`);
    expect(sanitizeEmailHtml(`<a href="javascript:alert(1)">Click</a>`)).toBe("Click");
    expect(sanitizeEmailHtml(`<a href="http://example.com">Plain</a>`)).toBe("Plain");
  });

  it("escapes text that looks like markup but is not an allowed tag", () => {
    expect(sanitizeEmailHtml("a < b and c > d")).toBe("a &lt; b and c &gt; d");
    expect(sanitizeEmailHtml("<iframe src=https://evil.test></iframe>Text")).toBe("Text");
  });

  it("escapes quotes in an href so it cannot break out of the attribute", () => {
    const out = sanitizeEmailHtml(`<a href="https://example.com/&quot;onmouseover=x">L</a>`);
    // The quote stays escaped inside the attribute, so nothing new is opened
    expect(out).toBe(`<a href="https://example.com/&quot;onmouseover=x" style="color:#e8620a;">L</a>`);
  });
});

describe("safeHttpsHref", () => {
  it("accepts https addresses and refuses everything else", () => {
    expect(safeHttpsHref("https://connectedsteps.in/it-run")).toBe("https://connectedsteps.in/it-run");
    expect(safeHttpsHref("http://connectedsteps.in")).toBeNull();
    expect(safeHttpsHref("javascript:alert(1)")).toBeNull();
    expect(safeHttpsHref("https://exa mple.com")).toBeNull();
    expect(safeHttpsHref("")).toBeNull();
  });
});
