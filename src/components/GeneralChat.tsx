import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

interface ChatMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name: string | null;
  sender_role: string | null;
}

export default function GeneralChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  // Track animation state
  const [closing, setClosing] = useState(false);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, sender_id, body, created_at, sender_name, sender_role")
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((data as ChatMessage[]) ?? []);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
    loadMessages();

    const channel = supabase
      .channel("public:chat_messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => loadMessages()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Escape key closes chat
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !myId) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from("chat_messages")
        .insert({ sender_id: myId, body: draft.trim() });
      if (error) throw error;
      setDraft("");
      await loadMessages();
    } catch (err: any) {
      console.error("Failed to send chat message:", err.message);
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate("/"); // fallback → login page
      }
    }, 300); // match animation duration
  };

  return (
    <div
      className={`flex flex-col h-[32rem] max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transform transition-all duration-300 ${
        closing ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
      }`}
    >
      <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 bg-slate-50">
        <div>
          <h2 className="text-lg font-bold text-gray-900">General Chat</h2>
          <p className="text-xs text-gray-500">Open room for all members of the academy.</p>
        </div>
        {/* Close button */}
        <button
          onClick={handleClose}
          className="text-red-500 hover:text-red-700 font-bold text-lg transition"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400 mt-8">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === myId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    mine ? "bg-cyan-600 text-white" : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {!mine && (
                    <div className="text-xs font-semibold text-cyan-700 mb-0.5">
                      {m.sender_name || "Member"}
                      {m.sender_role && m.sender_role !== "student" && (
                        <span className="ml-1 uppercase text-[10px] text-gray-400">
                          {m.sender_role}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-sm break-words">{m.body}</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      mine ? "text-cyan-100" : "text-gray-400"
                    }`}
                  >
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className="flex items-center gap-2 border-t border-gray-200 p-3"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition"
        >
          Send
        </button>
      </form>
    </div>
  );
}
