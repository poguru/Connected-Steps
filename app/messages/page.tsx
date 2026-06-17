"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Coach {
  id: string;
  name: string;
  specialization: string | null;
  avatar_url: string | null;
}

interface Conversation {
  id: string;
  user_email: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  user_unread: number;
  coaches: Coach | null;
}

interface Message {
  id: string;
  sender_email: string;
  sender_type: "user" | "coach";
  body: string;
  created_at: string;
  read_at: string | null;
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function MessagesPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cs_user");
      if (!stored) { router.push("/login"); return; }
      setUserEmail(JSON.parse(stored).email);
    } catch {
      router.push("/login");
    }
  }, [router]);

  const fetchConversations = useCallback(async (email: string) => {
    const res = await fetch(`/api/messages/conversations?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    return (data.conversations ?? []) as Conversation[];
  }, []);

  const fetchMessages = useCallback(async (convId: string) => {
    const res = await fetch(`/api/messages/${convId}?limit=50`);
    const data = await res.json();
    return (data.messages ?? []) as Message[];
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    setLoading(true);
    fetchConversations(userEmail).then(convs => {
      setConversations(convs);
      if (convs.length > 0) {
        setActiveConv(convs[0]);
      } else {
        fetch("/api/coaches").then(r => r.json()).then(d => setCoaches(d.coaches ?? []));
      }
      setLoading(false);
    });
  }, [userEmail, fetchConversations]);

  useEffect(() => {
    if (!activeConv) return;
    setMessagesLoading(true);
    fetchMessages(activeConv.id).then(msgs => {
      setMessages(msgs);
      setMessagesLoading(false);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
    });

    fetch(`/api/messages/${activeConv.id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reader_type: "user" }),
    }).catch(() => {});

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchMessages(activeConv.id).then(msgs => {
        setMessages(prev => {
          const lastNew = msgs[msgs.length - 1]?.id;
          const lastOld = prev[prev.length - 1]?.id;
          if (msgs.length !== prev.length || lastNew !== lastOld) {
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
            return msgs;
          }
          return prev;
        });
      });
    }, 5000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeConv, fetchMessages]);

  const startConversation = async (coach: Coach) => {
    if (!userEmail) return;
    const res = await fetch("/api/messages/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_email: userEmail, coach_id: coach.id }),
    });
    const data = await res.json();
    if (data.conversation) {
      const conv: Conversation = { ...data.conversation, coaches: coach };
      setConversations([conv]);
      setActiveConv(conv);
      setCoaches([]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeConv || !userEmail || sending) return;
    setSending(true);
    const body = input.trim();
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    const res = await fetch(`/api/messages/${activeConv.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender_email: userEmail, sender_type: "user", body }),
    });
    const data = await res.json();
    if (data.message) {
      setMessages(prev => [...prev, data.message as Message]);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
    setSending(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const coach = activeConv?.coaches ?? null;

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--muted-foreground)", fontSize: "0.9rem" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--background)", color: "var(--foreground)", display: "flex", flexDirection: "column", maxWidth: 680, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem 1rem", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(12px)", paddingTop: "calc(0.85rem + env(safe-area-inset-top))" }}>
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "6px", borderRadius: 8, display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {coach ? (
          <>
            {coach.avatar_url ? (
              <img src={coach.avatar_url} alt={coach.name} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "2px solid var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", fontWeight: 800, color: "var(--cs-orange)", flexShrink: 0 }}>
                {initials(coach.name)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{coach.name}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--cs-orange)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{coach.specialization ?? "Running Coach"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80" }} />
              <span style={{ fontSize: "11px", color: "#4ade80", fontWeight: 600 }}>Active</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)" }}>Chat with Your Coach</div>
        )}
      </div>

      {/* ── No conversation: pick a coach ── */}
      {!activeConv && coaches.length > 0 && (
        <div style={{ flex: 1, padding: "1.5rem 1rem" }}>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.85rem", marginBottom: "1.25rem", lineHeight: 1.6 }}>
            Choose a coach to start a conversation:
          </p>
          {coaches.map(c => (
            <button
              key={c.id}
              onClick={() => startConversation(c)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.875rem", padding: "0.9rem 1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, cursor: "pointer", marginBottom: "0.75rem", textAlign: "left", fontFamily: "var(--font-body)", transition: "border-color 0.15s" }}
            >
              {c.avatar_url ? (
                <img src={c.avatar_url} alt={c.name} style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "2px solid var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 800, color: "var(--cs-orange)", flexShrink: 0 }}>
                  {initials(c.name)}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)" }}>{c.name}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: 2 }}>{c.specialization ?? "Running Coach"}</div>
              </div>
              <span style={{ color: "var(--cs-orange)", fontSize: "0.85rem", fontWeight: 700, flexShrink: 0 }}>Chat →</span>
            </button>
          ))}
        </div>
      )}

      {/* ── No conversations, no coaches loaded yet ── */}
      {!activeConv && coaches.length === 0 && !loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>💬</div>
          <div style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>No coaches available</div>
          <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            Your coach will reach out shortly. Check back soon.
          </p>
        </div>
      )}

      {/* ── Messages thread ── */}
      {activeConv && (
        <>
          <div
            className="cs-messages-list"
            style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {messagesLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
                Loading messages…
              </div>
            ) : messages.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", color: "var(--muted-foreground)", gap: "0.75rem", paddingTop: "3rem" }}>
                <div style={{ fontSize: "2.5rem" }}>👋</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>Say hello to your coach!</div>
                <div style={{ fontSize: "0.8rem", lineHeight: 1.6, maxWidth: 260 }}>Ask about your training plan, next session, or anything running-related.</div>
              </div>
            ) : (
              messages.map(msg => {
                const isUser = msg.sender_type === "user";
                return (
                  <div key={msg.id} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                    {!isUser && coach?.avatar_url && (
                      <img src={coach.avatar_url} alt={coach.name} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0, alignSelf: "flex-end", marginRight: 6, marginBottom: 2 }} />
                    )}
                    {!isUser && !coach?.avatar_url && coach && (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "1px solid var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 800, color: "var(--cs-orange)", flexShrink: 0, alignSelf: "flex-end", marginRight: 6, marginBottom: 2 }}>
                        {initials(coach.name)}
                      </div>
                    )}
                    <div style={{ maxWidth: "72%" }}>
                      <div style={{
                        padding: "0.6rem 0.9rem",
                        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        background: isUser ? "var(--gradient-accent)" : "var(--surface)",
                        border: isUser ? "none" : "1px solid var(--border)",
                        color: isUser ? "var(--accent-foreground)" : "var(--foreground)",
                        boxShadow: isUser ? "0 2px 12px oklch(0.72 0.19 49 / 30%)" : "var(--shadow-sm)",
                      }}>
                        <div style={{ fontSize: "0.87rem", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.body}</div>
                      </div>
                      <div style={{ fontSize: "10px", marginTop: "3px", textAlign: isUser ? "right" : "left", color: "var(--muted-foreground)", paddingLeft: isUser ? 0 : 4, paddingRight: isUser ? 4 : 0 }}>
                        {new Date(msg.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                        {isUser && msg.read_at && " · Seen"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ── */}
          <div className="cs-messages-input-bar" style={{ borderTop: "1px solid var(--border)", padding: "0.65rem 0.875rem", display: "flex", gap: "0.5rem", alignItems: "flex-end", background: "var(--background)" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Message your coach…"
              rows={1}
              style={{ flex: 1, resize: "none", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "0.6rem 0.9rem", fontSize: "0.9rem", color: "var(--foreground)", fontFamily: "var(--font-body)", outline: "none", maxHeight: 120, lineHeight: 1.5, overflowY: "auto" }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              aria-label="Send message"
              style={{
                flexShrink: 0, width: 44, height: 44, borderRadius: 12,
                background: !input.trim() || sending ? "rgba(255,255,255,0.06)" : "var(--gradient-accent)",
                border: "none",
                cursor: !input.trim() || sending ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: !input.trim() || sending ? "var(--muted-foreground)" : "white",
                boxShadow: input.trim() && !sending ? "0 2px 12px oklch(0.72 0.19 49 / 35%)" : "none",
                transition: "all 0.15s",
              }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
