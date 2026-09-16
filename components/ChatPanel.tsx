"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { ensureActiveProfilePassword, passwordError, passwordMissing } from "@/lib/defaults";
import { resolvePreset } from "@/lib/date-tr";
import { uid, useStore } from "@/lib/store";
import type { AiSearchResult, ChatMessage, ChatSession } from "@/lib/types";
import type { ChatMsg } from "@/lib/ai-server";

const QUICK = [
  "Son 1 saatteki ERROR loglarını bul",
  "Son 24 saatte en çok hata veren servis hangisi?",
  "Bugünkü loglarda timeout geçenleri göster",
];

export default function ChatPanel() {
  const s = useStore();
  const ai = s.activeAi();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const session: ChatSession | null =
    s.sessions.find((x) => x.id === s.activeSessionId) ?? null;
  const messages: ChatMessage[] = session?.messages ?? [];
  const sortedSessions = [...s.sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  function scrollDown() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function newChat() {
    const now = Date.now();
    const sess: ChatSession = {
      id: uid(), title: "Yeni sohbet", messages: [],
      prevSearchAfter: null, createdAt: now, updatedAt: now,
    };
    const st = useStore.getState();
    st.set({ sessions: [...st.sessions, sess].slice(-20), activeSessionId: sess.id });
  }

  function deleteChat() {
    if (!session) return;
    if (!window.confirm(`"${session.title}" silinsin mi?`)) return;
    s.deleteSession(session.id);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || s.busy) return;
    const st = useStore.getState();
    const sid = st.ensureSession();
    const userMsg: ChatMessage = { id: uid(), role: "user", content, createdAt: Date.now() };
    st.pushSessionMessage(userMsg);
    st.set({ busy: true, lastError: "" });
    setInput("");
    scrollDown();

    const fail = (msg: string) => {
      const cur = useStore.getState();
      cur.pushSessionMessage({ id: uid(), role: "assistant", content: msg, createdAt: Date.now() });
      cur.set({ busy: false });
      scrollDown();
    };

    try {
      let pf = st.activeProfile();
      if (passwordMissing(pf)) pf = await ensureActiveProfilePassword();
      if (passwordMissing(pf)) {
        fail("Hata: " + passwordError(pf));
        return;
      }
      const cur = useStore.getState();
      const view = cur.activeDataView();
      const range = cur.preset === "ozel"
        ? { gte: cur.customGte, lte: cur.customLte }
        : resolvePreset(cur.preset);
      const sess = cur.sessions.find((x) => x.id === sid);
      const history: ChatMsg[] = (sess?.messages ?? [userMsg])
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await api<AiSearchResult>("/api/ai/chat", {
        provider: cur.activeAi(),
        messages: history,
        context: {
          profile: pf,
          pattern: view.pattern,
          timeField: view.timeField,
          mappingSummary: cur.mappingSummary,
          dateGte: range.gte,
          dateLte: range.lte,
          userText: content,
          prevSearchAfter: sess?.prevSearchAfter ?? null,
        },
      });
      const asg: ChatMessage = {
        id: uid(), role: "assistant", content: res.reply,
        dslPreview: res.dslPreview, hits: res.hits.length, createdAt: Date.now(),
        apply: {
          queryText: res.queryText,
          filters: res.suggestedFilters,
          dateGte: res.dateGte,
          dateLte: res.dateLte,
          dslPreview: res.dslPreview,
          total: res.total,
          totalRelation: res.totalRelation,
          hitCount: res.hits.length,
        },
      };
      const cur2 = useStore.getState();
      cur2.pushSessionMessage(asg);
      cur2.patchSession(sid, { prevSearchAfter: res.nextSearchAfter });
      cur2.set({ busy: false });
    } catch (e) {
      fail("Hata: " + (e as Error).message);
      return;
    }
    scrollDown();
  }

  function applyToTable(m: ChatMessage) {
    const r = m.apply;
    if (!r) return;
    const st = useStore.getState();
    st.resetPaging();
    st.set({
      queryText: r.queryText,
      filters: r.filters,
      preset: "ozel",
      customGte: r.dateGte,
      customLte: r.dateLte,
      searchNonce: st.searchNonce + 1,
    });
  }

  const inp = "w-full rounded border border-kibana-border bg-kibana-bg px-2 py-1.5 text-sm outline-none focus:border-kibana-accent";

  return (
    <div className="flex h-full flex-col rounded border border-kibana-border bg-kibana-panel">
      <div className="flex items-center gap-2 border-b border-kibana-border p-2">
        <span className="text-sm font-semibold">AI Chat</span>
        <select
          className="ml-auto max-w-[150px] rounded border border-kibana-border bg-kibana-bg px-1 py-1 text-xs"
          value={s.activeAiId}
          onChange={(e) => s.set({ activeAiId: e.target.value })}
          title="Aktif AI sağlayıcı (BYOK)"
        >
          {s.aiProviders.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1 border-b border-kibana-border p-2">
        <select
          className="min-w-0 flex-1 rounded border border-kibana-border bg-kibana-bg px-1 py-1 text-xs"
          value={session?.id ?? ""}
          onChange={(e) => s.selectSession(e.target.value)}
          title="Sohbet geçmişi — seçip kaldığın yerden devam et"
        >
          {sortedSessions.length === 0 && <option value="">Henüz sohbet yok</option>}
          {sortedSessions.map((x) => (
            <option key={x.id} value={x.id}>{x.title} ({x.messages.length})</option>
          ))}
        </select>
        <button
          className="shrink-0 rounded border border-kibana-border px-2 py-1 text-xs hover:border-kibana-accent"
          title="Yeni sohbet başlat"
          onClick={newChat}
        >
          + Yeni
        </button>
        <button
          className="shrink-0 rounded border border-kibana-border px-2 py-1 text-xs hover:border-kibana-accent"
          title="Bu sohbeti sil"
          disabled={!session}
          onClick={deleteChat}
        >
          🗑
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {messages.length === 0 && (
          <div className="text-xs text-kibana-muted">
            <p className="mb-2">Örnek sorular (tarihi cümlede verebilirsin, AI algılar):</p>
            {QUICK.map((q) => (
              <button key={q} className="mb-1 block w-full rounded border border-kibana-border p-1.5 text-left hover:border-kibana-accent" onClick={() => void send(q)}>
                {q}
              </button>
            ))}
            <p className="mt-2">Aktif: <b>{ai.name}</b> • Data view: <b>{s.activeDataView().pattern}</b></p>
            <p className="mt-1">Sohbetler kaydedilir — yukarıdan eski bir sohbete dönüp devam edebilirsin.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`rounded p-2 text-sm ${m.role === "user" ? "bg-kibana-accent/15" : "bg-kibana-panel2"}`}>
            <div className="mb-1 text-[11px] text-kibana-muted">{m.role === "user" ? "Sen" : ai.name}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.role === "assistant" && m.apply && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-kibana-muted">Bu sayfada {m.apply.hitCount} kayıt • toplam {m.apply.total === null ? "?" : m.apply.totalRelation === "gte" ? `${m.apply.total}+` : m.apply.total}</span>
                <button className="accent-ink rounded border border-kibana-accent px-2 py-0.5" onClick={() => applyToTable(m)}>
                  Tabloya uygula
                </button>
                {m.apply.dslPreview && (
                  <details>
                    <summary className="cursor-pointer text-kibana-muted">DSL</summary>
                    <pre className="codebox mt-1 max-h-40 overflow-auto p-1 text-[11px]">{m.apply.dslPreview}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
        {s.busy && <div className="text-xs text-kibana-muted">AI düşünüyor… (önce arar, sonra özetler)</div>}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-1 border-t border-kibana-border p-2">
        <input
          className={inp} placeholder="Logları anlat: son 2 saatte hata logları…"
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
        />
        <button className="btn-primary rounded px-3 text-sm font-semibold disabled:opacity-40" disabled={s.busy} onClick={() => void send()}>
          ➤
        </button>
      </div>
    </div>
  );
}
