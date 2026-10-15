"use client";

import { usePathname } from "next/navigation";
import { whatsappSupportLink } from "@/lib/support-whatsapp";
import { SUPPORT_PHONE } from "@/lib/config";
import { floatingReportHidden } from "@/lib/issue-report-placement";
import { FLOATING_BOTTOM_OFFSET } from "@/lib/bottom-bar";
import { useIsPhone } from "@/components/ui/useIsPhone";

/** WhatsApp icon (the standard glyph) */
export function WhatsAppGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.25-8.25 8.25zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.55.12-.16.25-.63.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.64 4.19 3.7.59.25 1.04.4 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.18-.47-.3z" />
    </svg>
  );
}

/** Floating WhatsApp contact on every page except the registration wizard, which has its own bottom bar. */
export default function SupportWhatsApp() {
  const pathname = usePathname();
  const href = whatsappSupportLink(
    SUPPORT_PHONE,
    `Hi, I need help with Connected Steps${pathname ? ` (${pathname})` : ""}.`,
  );
  const phone = useIsPhone();
  if (!href || floatingReportHidden(pathname) || (phone && pathname === "/it-run")) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      style={{
        position: "fixed", right: 16, bottom: FLOATING_BOTTOM_OFFSET, zIndex: 9990,
        width: 50, height: 50, borderRadius: "50%", background: "#25D366", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 6px 20px rgba(0,0,0,0.35)", textDecoration: "none",
      }}
    >
      <WhatsAppGlyph />
    </a>
  );
}
