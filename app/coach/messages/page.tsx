"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCoach } from "../layout";
import { createClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  id:                   string;
  user_email:           string;
  last_message_at:      string | null;
  last_message_preview: string | null;
  coach_unread:         number;
  coaches:              { id: string; name: string; specialization: string | null } | null;
}

interface Message {
  id:          string;
  sender_email: string;
  sender_type: "user" | "coach";
  body:        string;
  created_at:  string;
  read_at:     string | null;
}

interface UserInfo { first_name: string; last_name: string; email: string; }

// ── Supabase client for realtime (anon key, read-only) ────────────────────────
function getSupabaseRealtime() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function coachToken(): string {
  if (typeof window === "undefined") return "";
  return document.cookie.split(";").find(c => c.trim().startsWith("cs_coach_session="))?.split("=")?.[1] ?? "";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CoachMessagesPage() {
  const coach = useCoach();

  const [convs,        setConvs]        = useState<Conversation[]>([]);
  const [activeConv,   setActiveConv]   = useState<Conversation | null>(null);
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [userInfo,     setUserInfo]     = useState<UserInfo | null>(null);
  const [body,         setBody]         = useState("");
  const [loading,      setLoading]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [search,       setSearch]       = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [showList, setShowList] = useState(!isMobile || !activeConv);

  // ── Fetch conversations ───────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!coach) return;
    const res  = await fetch(`/api/messages/conversations?coach_email=${encodeURIComponent(coach.email)}`, {
      headers: { "x-coach-token": coachToken() },
    });
    if (res.ok) {
      const d = await res.json();
      setConvs(d.conversations ?? []);
    }
    setLoading(false);
  }, [coach]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Load messages for selected conversation ───────────────────────────────
  const loadMessages = useCallback(async (conv: Conversation) => {
    setMessages([]);
    const res = await fetch(`/api/messages/${conv.id}?limit=50`, {
      headers: { "x-coach-token": coachToken() },
    });
    if (res.ok) {
      const d = await res.json();
      setMessages((d.messages ?? []).reverse());
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
    // Fetch user info
    const userRes = await fetch(`/api/messages/conversations?email=${encodeURIComponent(conv.user_email)}`, {
      headers: { "x-user-token": "" },
    }).catch(() => null);
    // Fallback: just show email
    setUserInfo({ first_name: conv.user_email.split("@")[0], last_name: "", email: conv.user_email });
    // Mark as read
    await fetch(`/api/messages/${conv.id}/read`, {
      method: "PATCH", headers: { "Content-Type": "application/json", "x-coach-token": coachToken() },
      body: JSON.stringify({ reader_type: "coach" }),
    });
    setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, coach_unread: 0 } : c));
  }, []);

  function selectConv(conv: Conversation) {
    setActiveConv(conv);
    loadMessages(conv);
    if (isMobile) setShowList(false);
  }

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConv) return;
    const db = getSupabaseRealtime();
    if (!db) return;
    const channel = db.channel(`conv-${activeConv.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${activeConv.id}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => [...prev, msg]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [activeConv?.id]);

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || !activeConv || !coach) return;
    setSending(true);
    const text = body.trim();
    setBody("");
    try {
      await fetch(`/api/messages/${activeConv.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-coach-token": coachToken() },
        body: JSON.stringify({ body: text }),
      });
      loadConversations();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  // ── Filter conversations ──────────────────────────────────────────────────
  const filtered = convs.filter(c =>
    !search || c.user_email.toLowerCase().includes(search.toLowerCase()) ||
    (c.last_message_preview ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = convs.reduce((s, c) => s + (c.coach_unread ?? 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden", background: "#080808" }}>

      {/* ── Conversation list ── */}
      {(showList || !isMobile) && (
        <div style={{ width: isMobile ? "100%" : 300, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          {/* Header */}
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                Messages {totalUnread > 0 && <span style={{ background: "#e8620a", color: "#fff", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 999, marginLeft: 6 }}>{totalUnread}</span>}
              </div>
            </div>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              style={{ width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f0f0f0", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
            />
          </div>

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <div style={{ padding: "2rem", textAlign: "center", color: "#555", fontSize: 13 }}>Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#555", fontSize: 13 }}>
                {search ? "No conversations match." : "No active conversations yet."}
              </div>
            )}
            {filtered.map(conv => {
              const isActive  = activeConv?.id === conv.id;
              const hasUnread = conv.coach_unread > 0;
              return (
                <div key={conv.id} onClick={() => selectConv(conv)}
                  style={{ padding: "12px 16px", cursor: "pointer", background: isActive ? "rgba(232,98,10,0.08)" : "transparent", borderLeft: `2px solid ${isActive ? "#e8620a" : "transparent"}`, transition: "background 0.1s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e8620a22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#e8620a", flexShrink: 0 }}>
                      {conv.user_email.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: hasUnread ? 700 : 500, color: "#f0f0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                          {conv.user_email.split("@")[0]}
                        </span>
                        {conv.last_message_at && <span style={{ fontSize: 10, color: "#555" }}>{timeAgo(conv.last_message_at)}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                          {conv.last_message_preview ?? "No messages yet"}
                        </span>
                        {hasUnread && <span style={{ background: "#e8620a", color: "#fff", fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 999, flexShrink: 0 }}>{conv.coach_unread}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Chat panel ── */}
      {(!showList || !isMobile) && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {activeConv ? (
            <>
              {/* Chat header */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
                {isMobile && (
                  <button onClick={() => setShowList(true)} style={{ background: "none", border: "none", color: "#e8620a", cursor: "pointer", fontSize: 18, padding: 0, marginRight: 4 }}>←</button>
                )}
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e8620a22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#e8620a" }}>
                  {activeConv.user_email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{activeConv.user_email.split("@")[0]}</div>
                  <div style={{ fontSize: 11, color: "#555" }}>{activeConv.user_email}</div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {messages.map(msg => {
                  const isCoach = msg.sender_type === "coach";
                  return (
                    <div key={msg.id} style={{ display: "flex", justifyContent: isCoach ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "75%", padding: "8px 12px", borderRadius: isCoach ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        background: isCoach ? "#e8620a" : "rgba(255,255,255,0.08)",
                        color: "#fff", fontSize: 13, lineHeight: 1.5,
                      }}>
                        <div>{msg.body}</div>
                        <div style={{ fontSize: 10, color: isCoach ? "rgba(255,255,255,0.6)" : "#555", marginTop: 3, textAlign: "right" }}>
                          {timeAgo(msg.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <form onSubmit={sendMessage} style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8 }}>
                <input
                  ref={inputRef}
                  value={body} onChange={e => setBody(e.target.value)}
                  placeholder="Type a message…"
                  disabled={sending}
                  style={{ flex: 1, padding: "10px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, color: "#f0f0f0", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                />
                <button type="submit" disabled={sending || !body.trim()}
                  style={{ width: 40, height: 40, borderRadius: "50%", background: body.trim() ? "#e8620a" : "rgba(255,255,255,0.08)", border: "none", cursor: body.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </form>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 14, flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "2rem" }}>💬</div>
              <div>Select a conversation to start messaging</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
