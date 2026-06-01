"use client";

import { useEffect, useState } from "react";

export default function FloatingContact() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  function handleAskCommunity() {
    const user = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    if (!user) {
      window.location.href = `/auth?redirect=${encodeURIComponent("/?ask=1#community")}`;
      return;
    }
    sessionStorage.setItem("cs_open_ask", "1");
    const section = document.getElementById("community");
    if (section) section.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <style>{`
        @keyframes fcPop {
          0%   { opacity: 0; transform: scale(0) translateY(16px); }
          70%  { transform: scale(1.1) translateY(-3px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .fc-ask { animation: ${visible ? "fcPop 0.45s cubic-bezier(0.34,1.56,0.64,1) 0s both" : "none"}; }
        .fc-wa  { animation: ${visible ? "fcPop 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.1s both" : "none"}; }
        .fc-ig  { animation: ${visible ? "fcPop 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.2s both" : "none"}; }
        .fc-icon:hover { transform: scale(1.12) !important; }
        .fc-ask-btn:hover { opacity: 0.88; transform: translateY(-1px); }
      `}</style>

      <div style={{
        position: "fixed",
        bottom: "24px",
        right: "20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "10px",
        zIndex: 1000,
      }}>

        {/* Ask the community */}
        <div className="fc-ask">
          <button
            className="fc-ask-btn"
            onClick={handleAskCommunity}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              background: "var(--cs-orange)",
              color: "#fff",
              border: "none",
              borderRadius: "24px",
              fontSize: "12px",
              fontWeight: 700,
              fontFamily: "var(--font-body, sans-serif)",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(232,98,10,0.45)",
              transition: "opacity 0.2s, transform 0.2s",
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            Ask the community
          </button>
        </div>

        {/* Social icons row */}
        <div style={{ display: "flex", gap: "10px" }}>

          {/* WhatsApp */}
          <div className="fc-wa">
            <a
              href="https://wa.me/9703620570"
              target="_blank"
              rel="noopener noreferrer"
              title="Chat on WhatsApp"
              className="fc-icon"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#25D366",
                boxShadow: "0 3px 12px rgba(37,211,102,0.45)",
                transition: "transform 0.2s",
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.556 4.122 1.528 5.855L.057 23.882a.5.5 0 00.61.61l6.086-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.7-.51-5.25-1.4l-.38-.22-3.9.94.97-3.82-.25-.4A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
            </a>
          </div>

          {/* Instagram */}
          <div className="fc-ig">
            <a
              href="https://www.instagram.com/connected_steps/"
              target="_blank"
              rel="noopener noreferrer"
              title="Follow on Instagram"
              className="fc-icon"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                boxShadow: "0 3px 12px rgba(220,39,67,0.4)",
                transition: "transform 0.2s",
                flexShrink: 0,
              }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </a>
          </div>

        </div>
      </div>
    </>
  );
}
