"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function InvoicePage() {
  const params  = useParams<{ number: string }>();
  const [html,  setHtml]  = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/invoices/${encodeURIComponent(params.number)}`, {
      headers: { "x-user-token": localStorage.getItem("cs_user_token") ?? "" },
    })
      .then(r => r.ok ? r.text() : Promise.reject(r.status))
      .then(setHtml)
      .catch(() => setError("Invoice not found or you don't have permission to view it."));
  }, [params.number]);

  if (error) return (
    <div style={{ minHeight:"100vh", background:"#f5f5f5", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"sans-serif" }}>
      <div style={{ background:"#fff", padding:"2rem", borderRadius:8, maxWidth:400, textAlign:"center" }}>
        <div style={{ fontSize:"2rem", marginBottom:12 }}>⚠️</div>
        <div style={{ fontWeight:600, marginBottom:8 }}>Invoice Not Available</div>
        <div style={{ color:"#666", fontSize:13 }}>{error}</div>
      </div>
    </div>
  );

  if (!html) return (
    <div style={{ minHeight:"100vh", background:"#f5f5f5", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#999", fontFamily:"sans-serif" }}>Loading invoice…</div>
    </div>
  );

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <div style={{ position:"fixed", bottom:16, right:16, zIndex:100 }}>
        <button
          onClick={() => window.print()}
          style={{ padding:"10px 20px", background:"#e8620a", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontFamily:"sans-serif", fontWeight:700, fontSize:13, boxShadow:"0 4px 12px rgba(232,98,10,0.4)" }}
        >
          🖨️ Print / Save as PDF
        </button>
      </div>
    </>
  );
}
