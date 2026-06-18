"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseSafe } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Coach {
  id:             string;
  name:           string;
  specialization: string | null;
  avatar_url:     string | null;
  is_admin?:      boolean;
}

interface Conversation {
  id:                   string;
  user_email:           string;
  last_message_at:      string | null;
  last_message_preview: string | null;
  user_unread:          number;
  coaches:              Coach | null;
}

interface Message {
  id:           string;
  sender_email: string;
  sender_type:  "user" | "coach";
  body:         string;
  created_at:   string;
  read_at:      string | null;
}

// A "contact" merges a coach with their conversation (or null if not started)
interface Contact {
  coach:        Coach;
  conversation: Conversation | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return "just now";
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function CoachAvatar({ coach, size, border }: { coach: Coach; size: number; border?: string }) {
  const borderStyle = border ?? "2px solid var(--cs-orange)";
  if (coach.avatar_url) {
    return (
      <img
        src={coach.avatar_url} alt={coach.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: borderStyle, flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "oklch(0.72 0.19 49 / 15%)", border: borderStyle,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.34 + "px", fontWeight: 800, color: "var(--cs-orange)", flexShrink: 0,
    }}>
      {initials(coach.name)}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const router = useRouter();

  const [userEmail,      setUserEmail]      = useState<string | null>(null);
  const [contacts,       setContacts]       = useState<Contact[]>([]);
  const [activeContact,  setActiveContact]  = useState<Contact | null>(null);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [input,          setInput]          = useState("");
  const [sending,        setSending]        = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [starting,       setStarting]       = useState(false); // creating new conversation
  const [messagesLoading,setMessagesLoading]= useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Auth check ──────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cs_user");
      if (!stored) { router.replace("/auth?redirect=/messages"); return; }
      setUserEmail(JSON.parse(stored).email);
    } catch {
      router.replace("/auth?redirect=/messages");
    }
  }, [router]);

  // ── Data fetch: coaches + conversations → unified contact list ──────────────

  const loadContacts = useCallback(async () => {
    const token = localStorage.getItem("cs_user_token") ?? "";

    const [coachRes, convRes] = await Promise.all([
      fetch("/api/coaches", { headers: { "x-user-token": token } }).then(r => r.json()),
      fetch("/api/messages/conversations", { headers: { "x-user-token": token } }).then(r => r.json()),
    ]);

    const coaches:       Coach[]        = coachRes.coaches ?? [];
    const conversations: Conversation[] = convRes.conversations ?? [];

    // Build a map: coach_id → conversation
    const convByCoachId = new Map<string, Conversation>();
    for (const conv of conversations) {
      if (conv.coaches?.id) convByCoachId.set(conv.coaches.id, conv);
    }

    // Every coach gets a contact slot
    const merged: Contact[] = coaches.map(coach => ({
      coach,
      conversation: convByCoachId.get(coach.id) ?? null,
    }));

    // Add any conversations whose coach is not in the assigned list
    // (edge case: coach was unassigned after conversation started)
    for (const conv of conversations) {
      if (conv.coaches?.id && !coaches.find(c => c.id === conv.coaches!.id)) {
        merged.push({ coach: conv.coaches, conversation: conv });
      }
    }

    // Sort: conversations with messages first (most recent), then unstarted coaches
    merged.sort((a, b) => {
      const aTime = a.conversation?.last_message_at ?? "";
      const bTime = b.conversation?.last_message_at ?? "";
      if (aTime && bTime) return bTime.localeCompare(aTime);
      if (aTime) return -1;
      if (bTime) return 1;
      return a.coach.name.localeCompare(b.coach.name);
    });

    return merged;
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    setLoading(true);
    loadContacts().then(merged => {
      setContacts(merged);
      setLoading(false);
    });
  }, [userEmail, loadContacts]);

  // ── Open a conversation thread ───────────────────────────────────────────────

  const openContact = useCallback(async (contact: Contact) => {
    if (contact.conversation) {
      setActiveContact(contact);
      return;
    }

    // No conversation yet — create one
    setStarting(true);
    const token = localStorage.getItem("cs_user_token") ?? "";
    const res = await fetch("/api/messages/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-token": token,               // ← critical: was missing before
      },
      body: JSON.stringify({ coach_id: contact.coach.id }),
    });
    const data = await res.json();
    setStarting(false);

    if (data.conversation) {
      const newConv: Conversation = { ...data.conversation, coaches: contact.coach };
      const newContact: Contact   = { coach: contact.coach, conversation: newConv };
      setContacts(prev => prev.map(c => c.coach.id === contact.coach.id ? newContact : c));
      setActiveContact(newContact);
    }
  }, []);

  // ── Fetch messages when active conversation changes ──────────────────────────

  const fetchMessages = useCallback(async (convId: string) => {
    const res  = await fetch(`/api/messages/${convId}?limit=50`);
    const data = await res.json();
    return (data.messages ?? []) as Message[];
  }, []);

  const markRead = useCallback((convId: string) => {
    const token = localStorage.getItem("cs_user_token") ?? "";
    fetch(`/api/messages/${convId}/read`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "x-user-token": token },
      body:    JSON.stringify({ reader_type: "user" }),
    }).then(r => {
      if (r.ok) {
        setContacts(prev => prev.map(c =>
          c.conversation?.id === convId
            ? { ...c, conversation: { ...c.conversation!, user_unread: 0 } }
            : c
        ));
        setActiveContact(prev => prev?.conversation?.id === convId
          ? { ...prev, conversation: { ...prev.conversation!, user_unread: 0 } }
          : prev
        );
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeContact?.conversation) { setMessages([]); return; }
    const convId = activeContact.conversation.id;

    setMessagesLoading(true);
    fetchMessages(convId).then(msgs => {
      setMessages(msgs);
      setMessagesLoading(false);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
    });
    markRead(convId);

    // Prefer Supabase realtime; fall back to 15s polling if unavailable.
    const supabase = getSupabaseSafe();
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;

    const startFallback = () => {
      if (fallbackPoll) return;
      fallbackPoll = setInterval(() => {
        fetchMessages(convId).then(msgs => {
          setMessages(prev => {
            if (msgs.length === prev.length && msgs[msgs.length - 1]?.id === prev[prev.length - 1]?.id) return prev;
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
            markRead(convId);
            return msgs;
          });
        });
      }, 15000);
    };

    if (!supabase) { startFallback(); return () => { if (fallbackPoll) clearInterval(fallbackPoll); }; }

    const channel = supabase
      .channel(`conv-${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev; // deduplicate
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
            return [...prev, msg];
          });
          markRead(convId);
        }
      )
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startFallback();
      });

    return () => {
      supabase.removeChannel(channel);
      if (fallbackPoll) clearInterval(fallbackPoll);
    };
  }, [activeContact?.conversation?.id, fetchMessages, markRead]); // eslint-disable-line

  // ── Send message ────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!input.trim() || !activeContact?.conversation || !userEmail || sending) return;
    setSending(true);
    const body = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const res  = await fetch(`/api/messages/${activeContact.conversation.id}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ sender_email: userEmail, sender_type: "user", body }),
    });
    const data = await res.json();
    if (data.message) {
      setMessages(prev => [...prev, data.message as Message]);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
      // Update preview in contact list
      setContacts(prev => prev.map(c =>
        c.conversation?.id === activeContact.conversation!.id
          ? { ...c, conversation: { ...c.conversation!, last_message_preview: body, last_message_at: new Date().toISOString() } }
          : c
      ));
    }
    setSending(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const activeCoach = activeContact?.coach ?? null;
  const totalUnread = contacts.reduce((s, c) => s + (c.conversation?.user_unread ?? 0), 0);

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--muted-foreground)", fontSize: "0.9rem" }}>Loading…</div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100dvh", background: "var(--background)", color: "var(--foreground)",
      display: "flex", flexDirection: "column", maxWidth: 680, margin: "0 auto",
    }}>

      {/* ── Sticky header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg-glass)", backdropFilter: "blur(18px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        paddingTop: "env(safe-area-inset-top)",
      }}>

        {/* Inbox header */}
        {!activeContact && (
          <div style={{ padding: "1rem 1.25rem 0" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>
              Messages
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "0.875rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                Inbox
              </div>
              {totalUnread > 0 && (
                <div style={{ background: "var(--cs-orange)", color: "#fff", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
                  {totalUnread} new
                </div>
              )}
            </div>
          </div>
        )}

        {/* Thread header */}
        {activeContact && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem 1rem" }}>
            <button
              onClick={() => { setActiveContact(null); setMessages([]); }}
              aria-label="Back to inbox"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "6px", borderRadius: 8, display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <CoachAvatar coach={activeCoach!} size={38} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeCoach!.name}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--cs-orange)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {activeCoach!.specialization ?? "Running Coach"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80" }} />
              <span style={{ fontSize: "11px", color: "#4ade80", fontWeight: 600 }}>Active</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Inbox: list of contacts ── */}
      {!activeContact && (
        <div style={{ flex: 1, padding: "1rem 1.25rem" }}>

          {contacts.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "4rem", textAlign: "center", gap: "1rem" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <div style={{ fontSize: "1rem", fontWeight: 700 }}>No coaches yet</div>
              <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.6, maxWidth: 260 }}>
                Your coach will be assigned shortly. Check back soon.
              </p>
            </div>
          ) : (
            <>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem" }}>
                Your Coaches
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
                {contacts.map((contact, i) => {
                  const conv   = contact.conversation;
                  const unread = conv?.user_unread ?? 0;

                  return (
                    <button
                      key={contact.coach.id}
                      onClick={() => openContact(contact)}
                      disabled={starting}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: "0.875rem",
                        padding: "1rem 1.25rem", background: "transparent", border: "none",
                        borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        cursor: starting ? "wait" : "pointer", textAlign: "left",
                        fontFamily: "var(--font-body)", transition: "background 0.12s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      {/* Avatar with online dot */}
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <CoachAvatar coach={contact.coach} size={48} />
                        <div style={{ position: "absolute", bottom: 1, right: 1, width: 10, height: 10, borderRadius: "50%", background: "#4ade80", border: "2px solid var(--background)" }} />
                      </div>

                      {/* Name + preview */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.95rem", fontWeight: unread > 0 ? 700 : 600, color: "var(--foreground)" }}>
                          {contact.coach.name}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                          {conv?.last_message_preview
                            ? conv.last_message_preview
                            : contact.coach.specialization ?? "Running Coach"}
                        </div>
                      </div>

                      {/* Right side: time / start-chat / unread */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        {conv ? (
                          <>
                            <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                              {timeAgo(conv.last_message_at)}
                            </span>
                            {unread > 0 && (
                              <div style={{ background: "var(--cs-orange)", color: "#fff", fontSize: "11px", fontWeight: 700, minWidth: 18, height: 18, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                                {unread}
                              </div>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--cs-orange)", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.2)", padding: "4px 10px", borderRadius: 999 }}>
                            {starting ? "Opening…" : "Start Chat"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Thread view ── */}
      {activeContact && (
        <>
          {/* Messages list */}
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
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>Say hello to your coach!</div>
                <div style={{ fontSize: "0.8rem", lineHeight: 1.6, maxWidth: 260 }}>
                  Ask about your training plan, next session, or anything running-related.
                </div>
              </div>
            ) : (
              messages.map(msg => {
                const isUser = msg.sender_type === "user";
                return (
                  <div key={msg.id} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                    {!isUser && activeCoach && (
                      <div style={{ flexShrink: 0, alignSelf: "flex-end", marginRight: 6, marginBottom: 2 }}>
                        <CoachAvatar coach={activeCoach} size={28} border="1px solid var(--cs-orange)" />
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
                        <div style={{ fontSize: "0.87rem", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {msg.body}
                        </div>
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

          {/* Input bar */}
          <div
            className="cs-messages-input-bar"
            style={{ borderTop: "1px solid var(--border)", padding: "0.65rem 0.875rem", display: "flex", gap: "0.5rem", alignItems: "flex-end", background: "var(--background)" }}
          >
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
