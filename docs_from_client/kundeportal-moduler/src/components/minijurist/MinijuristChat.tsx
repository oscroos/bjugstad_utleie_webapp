"use client";

import { useEffect, useRef, useState } from "react";

interface Msg { role: "user" | "assistant"; content: string; notices?: string[] }

export default function MinijuristChat({ projectId }: { projectId: string }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sikreTraad(): Promise<string> {
    if (threadId) return threadId;
    const r = await fetch("/api/minijuristen/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, shareToKnowledgeBase: share }),
    });
    const { thread } = await r.json();
    setThreadId(thread.id);
    return thread.id;
  }

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const tid = await sikreTraad();
      const r = await fetch("/api/minijuristen/spor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: tid, question: q }),
      });
      const d = await r.json();
      setMessages((m) => [...m, { role: "assistant", content: d.answer ?? d.error ?? "Ukjent feil", notices: d.versionNotices }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Noe gikk galt. Prøv igjen." }]);
    }
    setBusy(false);
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="pt-10 text-center text-sm text-slate-400">
            Still et juridisk spørsmål om kontrakten, NS-standardene eller rapporteringsplikter.
            <br />F.eks. «Hvilke frister gjelder for varsel om endringer etter NS 8407?»
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}>
              {m.content}
              {m.notices && m.notices.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.notices.map((n, j) => (
                    <p key={j} className="rounded-lg bg-orange-100 px-2 py-1 text-xs text-orange-800">⚠ {n}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-slate-400">Minijuristen tenker…</div>}
        <div ref={endRef} />
      </div>
      <div className="border-t border-slate-100 p-3">
        <label className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} disabled={!!threadId} />
          Del anonymisert Q&A til fellesbasen (samtykke)
        </label>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            placeholder="Skriv spørsmålet ditt…"
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button onClick={send} disabled={busy || !input.trim()} className="rounded-lg bg-slate-900 px-5 text-sm font-medium text-white disabled:opacity-50">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
