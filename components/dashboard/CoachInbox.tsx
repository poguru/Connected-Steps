"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSupabaseSafe } from "@/lib/supabase";

interface Coach {
  id:   string;
  name: string;
  email:string;
}

interface Conversation {
  id:                   string;
  user_email:           string;
  last_message_at:      string;
  last_message_preview: string | null;
  coach_unread:         number;
  coaches:              { id: string; name: string } | null;
}

interface Message {
  id:           string;
  sender_email: string;
  sender_type:  "user" | "coach";
  body:         string;
  created_at:   string;
  read_at:      string | null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return "just now";
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function CoachInbox() {
  const [coaches,       setCoaches]      = useState<Coach[]>([]);
  const [activeCoach,   setActiveCoach]  = useState<Coach | null>(null);
  const [conversations, setConvos]       = useState<Conversation[]>([]);
  const [activeConv,    setActiveConv]   = useState<Conversation | null>(null);
  const [messages,      setMessages]     = useState<Message[]>([]);
  const [text,          setText]         = useState("");
  const [sending,       setSending]      = useState(false);
  const [loadingConvs,  setLoadingConvs] = useState(false);
  const [loadingMsgs,   setLoadingMsgs]  = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  // Load coaches list
  useEffect(() => {
    fetch("/api/coaches")
      .then(r => r.json())
      .then(d => {
        setCoaches(d.coaches ?? []);
        if (d.coaches?.length) setActiveCoach(d.coaches[0]);
      });
  }, []);

  // Load conversations when active coach changes
  const loadConvos = useCallback(async () => {
    if (!activeCoach) return;
    setLoadingConvs(true);
    setActiveConv(null);
    setMessages([]);
    try {
      const res  = await fetch(`/api/messages/conversations?coach_email=${encodeURIComponent(activeCoach.email)}`);
      const data = await res.json();
      setConvos(data.conversations ?? []);
    } finally {
      setLoadingConvs(false);
    }
  }, [activeCoach]);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  // Load messages when conversation selected
  const loadMessages = useCallback(async () => {
    if (!activeConv) return;
    setLoadingMsgs(true);
    try {
      const res  = await fetch(`/api/messages/${activeConv.id}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
      // Mark as read
      fetch(`/api/messages/${activeConv.id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reader_type: "coach" }),
      });
    } finally {
      setLoadingMsgs(false);
    }
  }, [activeConv]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Scroll to bottom when messages load
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Supabase Realtime: watch for new messages in active conversation
  useEffect(() => {
    if (!activeConv) return;
    const sb = getSupabaseSafe();
    if (!sb) return;
    const channel = sb
      .channel(`coach-inbox:${activeConv.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${activeConv.id}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [activeConv]);

  async function handleSend() {
    if (!text.trim() || !activeConv || !activeCoach || sending) return;
    const body = text.trim();
    setText("");
    setSending(true);

    const optimistic: Message = {
      id:           `opt-${Date.now()}`,
      sender_email: activeCoach.email,
      sender_type:  "coach",
      body,
      created_at:   new Date().toISOString(),
      read_at:      null,
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const res  = await fetch(`/api/messages/${activeConv.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_email: activeCoach.email, sender_type: "coach", body }),
      });
      const data = await res.json();
      setMessages(prev => prev.map(m => m.id === optimistic.id ? data.message : m));
      // Refresh conversation list for updated preview
      loadConvos();
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setText(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#080808", color: "#f0f0f0", fontFamily: "system-ui, sans-serif" }}>

      {/* Sidebar */}
      <div style={{ width: 280, borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column" }}>
        {/* Coach switcher */}
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #1e1e1e" }}>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 10 }}>Coach</div>
          {coaches.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCoach(c)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: activeCoach?.id === c.id ? "rgba(232,98,10,0.12)" : "transparent",
                border: "1px solid " + (activeCoach?.id === c.id ? "rgba(232,98,10,0.3)" : "transparent"),
                borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                color: activeCoach?.id === c.id ? "#e8620a" : "#888",
                fontSize: 13, fontWeight: 600, marginBottom: 4,
              }}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingConvs ? (
            <div style={{ padding: 24, textAlign: "center", color: "#555" }}>Loading…</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 13 }}>No conversations yet.</div>
          ) : conversations.map(conv => {
            const isActive = activeConv?.id === conv.id;
            return (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                style={{
                  display: "flex", width: "100%", alignItems: "center", textAlign: "left", gap: 10,
                  padding: "14px 16px", cursor: "pointer",
                  background: isActive ? "rgba(232,98,10,0.08)" : "transparent",
                  borderLeft: isActive ? "3px solid #e8620a" : "3px solid transparent",
                  border: "none", borderBottom: "1px solid #141414",
                  color: "inherit",
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 18, background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#e8620a", flexShrink: 0 }}>
                  {conv.user_email.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: conv.coach_unread ? 700 : 500, color: conv.coach_unread ? "#f0f0f0" : "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {conv.user_email.split("@")[0]}
                    </span>
                    <span style={{ fontSize: 10, color: "#444", flexShrink: 0, marginLeft: 6 }}>{timeAgo(conv.last_message_at)}</span>
                  </div>
                  {conv.last_message_preview && (
                    <div style={{ fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                      {conv.last_message_preview}
                    </div>
                  )}
                </div>
                {conv.coach_unread > 0 && (
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: "#e8620a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                    {conv.coach_unread}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {activeConv ? (
          <>
            {/* Chat header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: "rgba(232,98,10,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#e8620a" }}>
                {activeConv.user_email.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{activeConv.user_email.split("@")[0]}</div>
                <div style={{ fontSize: 11, color: "#555" }}>{activeConv.user_email}</div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px" }}>
              {loadingMsgs ? (
                <div style={{ textAlign: "center", padding: 40, color: "#555" }}>Loading messages…</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "#444" }}>No messages yet. Say hello!</div>
              ) : (
                messages.map(msg => {
                  const isCoach = msg.sender_type === "coach";
                  return (
                    <div key={msg.id} style={{ display: "flex", justifyContent: isCoach ? "flex-end" : "flex-start", marginBottom: 12 }}>
                      <div style={{ maxWidth: "70%" }}>
                        <div style={{
                          background:    isCoach ? "#e8620a" : "#161616",
                          border:        isCoach ? "none" : "1px solid #222",
                          borderRadius:  16,
                          borderBottomRightRadius: isCoach ? 4 : 16,
                          borderBottomLeftRadius:  isCoach ? 16 : 4,
                          padding:       "10px 14px",
                          fontSize:      14,
                          lineHeight:    1.5,
                          color:         isCoach ? "#fff" : "#ddd",
                          wordBreak:     "break-word",
                        }}>
                          {msg.body}
                        </div>
                        <div style={{ fontSize: 10, color: "#444", marginTop: 3, textAlign: isCoach ? "right" : "left" }}>
                          {fmtTime(msg.created_at)}
                          {isCoach && msg.read_at ? "  ✓✓" : isCoach ? "  ✓" : ""}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={msgEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #1a1a1a", display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                rows={2}
                style={{
                  flex: 1, background: "#111", border: "1px solid #222", borderRadius: 12,
                  padding: "10px 14px", color: "#f0f0f0", fontSize: 14, resize: "none",
                  outline: "none", fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleSend}
                disabled={!text.trim() || sending}
                style={{
                  background: !text.trim() || sending ? "#1e1e1e" : "#e8620a",
                  border:     "none", borderRadius: 12, padding: "10px 20px",
                  color:      !text.trim() || sending ? "#444" : "#fff",
                  fontWeight: 700, fontSize: 14, cursor: !text.trim() || sending ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#444" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#666", marginBottom: 8 }}>Select a conversation</div>
            <div style={{ fontSize: 13, color: "#444" }}>Choose an athlete from the sidebar to start replying.</div>
          </div>
        )}
      </div>
    </div>
  );
}
