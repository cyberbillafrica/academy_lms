import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuthStore } from "../store/authStore";

// Reusable inbox for staff (admin/instructor) and reused-shape for any role.
// Reads direct_messages (RLS scopes to rows where you are sender or recipient),
// marks received messages read on load, and lets you reply to the sender.
// sender_name/sender_role are denormalized (trigger-filled) so no profile join.

interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  subject: string | null;
  body: string;
  is_read: boolean;
  sender_name: string | null;
  sender_role: string | null;
  created_at: string;
}

const THEME = {
  light: {
    card: "bg-white border border-gray-100 shadow-sm",
    heading: "text-gray-800",
    sub: "text-gray-500",
    row: "border border-gray-100 bg-gray-50/50",
    name: "text-[#1B2A6B]",
    body: "text-gray-700",
    meta: "text-gray-400",
    input: "bg-white border border-gray-300 text-gray-900 focus:ring-[#3AAA35]",
    button: "bg-[#1B2A6B] hover:bg-[#152154] text-white",
    badge: "bg-[#F47920]/10 text-[#F47920]",
    newBadge: "bg-[#3AAA35]/10 text-[#3AAA35]",
    empty: "text-gray-400",
  },
  dark: {
    card: "bg-slate-900 border border-slate-800",
    heading: "text-white",
    sub: "text-slate-400",
    row: "bg-slate-950 border border-slate-800",
    name: "text-slate-100",
    body: "text-slate-300",
    meta: "text-slate-500",
    input: "bg-slate-900 border border-slate-700 text-slate-100 focus:ring-cyan-500",
    button: "bg-cyan-600 hover:bg-cyan-700 text-white",
    badge: "bg-cyan-500/10 text-cyan-400",
    newBadge: "bg-emerald-500/10 text-emerald-400",
    empty: "text-slate-500",
  },
} as const;

export default function MessagesPanel({ variant = "light" }: { variant?: "light" | "dark" }) {
  const profile = useAuthStore((s) => s.profile);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [isReplying, setIsReplying] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const t = THEME[variant];

  const load = useCallback(async () => {
    const myId = profile?.id;
    if (!myId) return;

    const { data } = await supabase
      .from("direct_messages")
      .select("id, sender_id, recipient_id, subject, body, is_read, sender_name, sender_role, created_at")
      .order("created_at", { ascending: false });

    const rows = (data as DirectMessage[]) || [];
    setMessages(rows);
    setLoading(false);

    // Mark received-unread as read (recipient can update is_read per RLS).
    const unreadIds = rows.filter((m) => !m.is_read && m.recipient_id === myId).map((m) => m.id);
    if (unreadIds.length > 0) {
      await supabase.from("direct_messages").update({ is_read: true }).in("id", unreadIds);
      setMessages((prev) => prev.map((m) => (unreadIds.includes(m.id) ? { ...m, is_read: true } : m)));
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReply(msg: DirectMessage) {
    const draft = replyDrafts[msg.id]?.trim();
    if (!draft || !profile?.id) return;
    setIsReplying(msg.id);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: profile.id,
        recipient_id: msg.sender_id, // reply goes back to whoever sent it
        subject: msg.subject ? `Re: ${msg.subject}` : "Re:",
        body: draft,
      });
      if (error) {
        console.error("Reply failed:", error.message);
        alert("Could not send reply: " + error.message);
        return;
      }
      setReplyDrafts((prev) => ({ ...prev, [msg.id]: "" }));
      await load();
    } finally {
      setIsReplying(null);
    }
  }

  const unreadCount = messages.filter((m) => !m.is_read && m.recipient_id === profile?.id).length;

  return (
    <div className={`p-6 rounded-xl ${t.card}`}>
      <div className="flex items-center justify-between mb-1">
        <h2 className={`text-xl font-bold ${t.heading}`}>📥 Inbox</h2>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${t.badge}`}>
              {unreadCount} new
            </span>
          )}
          <button onClick={load} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${t.button}`}>
            Refresh
          </button>
        </div>
      </div>
      <p className={`text-xs mb-4 ${t.sub}`}>Messages and replies from students &amp; staff.</p>

      {loading ? (
        <p className={`text-sm text-center py-6 ${t.empty}`}>Loading messages…</p>
      ) : messages.length === 0 ? (
        <p className={`text-sm text-center py-6 ${t.empty}`}>No messages yet.</p>
      ) : (
        <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
          {messages.map((msg) => {
            const fromMe = msg.sender_id === profile?.id;
            return (
              <div key={msg.id} className={`rounded-xl p-4 space-y-2 ${t.row}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm ${t.name}`}>
                      {fromMe ? "You" : (msg.sender_name || "User")}
                    </span>
                    {!fromMe && msg.sender_role && (
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${t.badge}`}>
                        {msg.sender_role}
                      </span>
                    )}
                    {!fromMe && !msg.is_read && (
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${t.newBadge}`}>
                        New
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] ${t.meta}`}>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                {msg.subject && <p className={`text-xs font-semibold ${t.sub}`}>{msg.subject}</p>}
                <p className={`text-sm whitespace-pre-wrap ${t.body}`}>{msg.body}</p>

                {/* Reply to whoever sent it (RLS enforces who you're allowed to message). */}
                {!fromMe && (
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="text"
                      placeholder="Write a reply…"
                      value={replyDrafts[msg.id] || ""}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                      className={`flex-1 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${t.input}`}
                    />
                    <button
                      disabled={isReplying === msg.id}
                      onClick={() => handleReply(msg)}
                      className={`font-bold text-xs px-4 py-2 rounded-lg transition-all active:scale-95 disabled:opacity-50 ${t.button}`}
                    >
                      {isReplying === msg.id ? "Sending…" : "Reply"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
