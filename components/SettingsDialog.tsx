"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { uid, useStore } from "@/lib/store";
import type { AiProvider, AiProviderType, EsProfile } from "@/lib/types";

const AI_TYPES: { id: AiProviderType; label: string }[] = [
  { id: "corporate", label: "Kurumsal AI (özel backend)" },
  { id: "openai", label: "OpenAI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "gemini", label: "Google Gemini" },
  { id: "custom", label: "Custom (OpenAI-uyumlu)" },
];

const blankEs = (): EsProfile => ({
  id: uid(), name: "", esUrl: "https://", authType: "basic",
  username: "", password: "", apiKey: "", insecure: true,
  defaultPattern: "logs-*", timeField: "@timestamp",
});

const blankAi = (): AiProvider => ({
  id: uid(), name: "", type: "custom", baseUrl: "", apiKey: "", model: "",
  username: "", selectedBot: "", selectedVersion: "", nodeName: "", extraHeaders: {},
});

export default function SettingsDialog() {
  const s = useStore();
  const [tab, setTab] = useState<"es" | "ai">("es");
  const [selEs, setSelEs] = useState("");
  const [selAi, setSelAi] = useState("");
  const [esForm, setEsForm] = useState<EsProfile | null>(null);
  const [aiForm, setAiForm] = useState<AiProvider | null>(null);
  const [headersText, setHeadersText] = useState("{}");
  const [msg, setMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    if (s.settingsOpen) {
      setSelEs(s.activeProfileId);
      setSelAi(s.activeAiId);
      setMsg("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.settingsOpen]);

  useEffect(() => {
    setEsForm(s.profiles.find((p) => p.id === selEs) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selEs, s.profiles, s.settingsOpen]);

  useEffect(() => {
    const a = s.aiProviders.find((p) => p.id === selAi) ?? null;
    setAiForm(a);
    setHeadersText(JSON.stringify(a?.extraHeaders ?? {}, null, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selAi, s.aiProviders, s.settingsOpen]);

  if (!s.settingsOpen) return null;

  const inp = "w-full rounded border border-kibana-border bg-kibana-bg px-2 py-1.5 text-sm outline-none focus:border-kibana-accent";
  const lbl = "mb-1 block text-xs text-kibana-muted";
  const btn = "rounded border border-kibana-border bg-kibana-panel2 px-3 py-1.5 text-sm hover:border-kibana-accent disabled:opacity-40";

  async function loadDefaultPassword() {
    if (!esForm) return;
    setMsg("");
    try {
      const res = await fetch("/api/es/defaults", { cache: "no-store" });
      const d = (await res.json()) as { es: { url: string; username: string; password: string } };
      setEsForm({
        ...esForm,
        esUrl: d.es.url || esForm.esUrl,
        username: d.es.username || esForm.username,
        password: d.es.password || esForm.password,
      });
      setMsg(d.es.password ? "Varsayılan yüklendi — Kaydet'e basmayı unutma." : ".env.local dosyasında şifre yok.");
    } catch (e) {
      setMsg("Hata: " + (e as Error).message);
    }
  }

  async function testEs() {
    if (!esForm) return;
    setTesting(true);
    setMsg("");
    try {
      const r = await api<{ cluster: string; version: string }>("/api/es/test", { profile: esForm });
      setMsg(`OK — cluster: ${r.cluster}, sürüm: ${r.version}`);
    } catch (e) {
      setMsg("Hata: " + (e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function testAi() {
    if (!aiForm) return;
    setTesting(true);
    setMsg("");
    try {
      const r = await api<{ reply: string }>("/api/ai/test", { provider: aiForm });
      setMsg("OK — cevap: " + r.reply);
    } catch (e) {
      setMsg("Hata: " + (e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  function saveAi() {
    if (!aiForm || !aiForm.name.trim()) {
      setMsg("İsim zorunlu.");
      return;
    }
    try {
      const extra = headersText.trim() ? (JSON.parse(headersText) as Record<string, string>) : {};
      s.upsertAi({ ...aiForm, extraHeaders: extra });
      setSelAi(aiForm.id);
      setMsg("Kaydedildi (bu tarayıcıda saklanır).");
    } catch {
      setMsg("Ek header'lar geçerli JSON olmalı.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => s.set({ settingsOpen: false })}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded border border-kibana-border bg-kibana-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Ayarlar (BYOK)</h2>
          <div className="ml-4 flex gap-1">
            <button className={`${btn} ${tab === "es" ? "border-kibana-accent" : ""}`} onClick={() => { setTab("es"); setMsg(""); }}>Elasticsearch</button>
            <button className={`${btn} ${tab === "ai" ? "border-kibana-accent" : ""}`} onClick={() => { setTab("ai"); setMsg(""); }}>AI Sağlayıcılar</button>
          </div>
          <button className={`${btn} ml-auto`} onClick={() => s.set({ settingsOpen: false })}>Kapat ✕</button>
        </div>
        <p className="mb-3 text-xs text-kibana-muted">
          Anahtarlar/şifreler yalnızca bu tarayıcıda (localStorage) saklanır, repoya veya sunucuya yazılmaz. Her istek anlık olarak iletilir.
        </p>

        {tab === "es" && (
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="space-y-1">
              {s.profiles.map((p) => (
                <button key={p.id} className={`block w-full rounded border p-1.5 text-left text-sm ${selEs === p.id ? "border-kibana-accent" : "border-kibana-border"}`} onClick={() => setSelEs(p.id)}>
                  {p.name}
                </button>
              ))}
              <button className={btn} onClick={() => { const b = blankEs(); s.upsertProfile(b); setSelEs(b.id); }}>+ Yeni profil</button>
            </div>
            {esForm && (
              <div className="space-y-2">
                <div><label className={lbl}>Ad</label><input className={inp} value={esForm.name} onChange={(e) => setEsForm({ ...esForm, name: e.target.value })} /></div>
                <div><label className={lbl}>Elastic URL</label><input className={inp} value={esForm.esUrl} onChange={(e) => setEsForm({ ...esForm, esUrl: e.target.value })} placeholder="https://host:9200/" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lbl}>Auth tipi</label>
                    <select className={inp} value={esForm.authType} onChange={(e) => setEsForm({ ...esForm, authType: e.target.value as "basic" | "apiKey" })}>
                      <option value="basic">Basic (user+şifre)</option>
                      <option value="apiKey">API Key</option>
                    </select>
                  </div>
                  <div><label className={lbl}>Varsayılan pattern</label><input className={inp} value={esForm.defaultPattern} onChange={(e) => setEsForm({ ...esForm, defaultPattern: e.target.value })} /></div>
                </div>
                {esForm.authType === "basic" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={lbl}>Kullanıcı</label><input className={inp} value={esForm.username} onChange={(e) => setEsForm({ ...esForm, username: e.target.value })} /></div>
                    <div><label className={lbl}>Şifre</label><input className={inp} type={showSecrets ? "text" : "password"} value={esForm.password} onChange={(e) => setEsForm({ ...esForm, password: e.target.value })} /></div>
                  </div>
                ) : (
                  <div><label className={lbl}>API Key</label><input className={inp} type={showSecrets ? "text" : "password"} value={esForm.apiKey} onChange={(e) => setEsForm({ ...esForm, apiKey: e.target.value })} /></div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  <span className={esForm.password || esForm.apiKey ? "dot-g" : "danger-text"}>
                    {esForm.password || esForm.apiKey ? "● Kimlik bilgisi kayıtlı" : "● Kimlik bilgisi boş — aramalar çalışmaz"}
                  </span>
                  <button className={`${btn} ml-auto`} onClick={loadDefaultPassword}>.env.local varsayılanını yükle</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lbl}>Time field</label><input className={inp} value={esForm.timeField} onChange={(e) => setEsForm({ ...esForm, timeField: e.target.value })} /></div>
                  <label className="flex items-end gap-2 pb-2 text-xs text-kibana-muted">
                    <input type="checkbox" checked={esForm.insecure} onChange={(e) => setEsForm({ ...esForm, insecure: e.target.checked })} />
                    Self-signed sertifikaya izin ver (server-proxy)
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs text-kibana-muted">
                  <input type="checkbox" checked={showSecrets} onChange={(e) => setShowSecrets(e.target.checked)} /> gizli alanları göster
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={btn} onClick={() => { s.upsertProfile(esForm); setMsg("Kaydedildi."); }}>Kaydet</button>
                  <button className={btn} disabled={testing} onClick={testEs}>{testing ? "Test ediliyor…" : "Bağlantıyı test et"}</button>
                  <button className={btn} onClick={() => s.set({ activeProfileId: esForm.id })}>Aktif yap</button>
                  <button className="btn-danger rounded border px-3 py-1.5 text-sm" onClick={() => { s.removeProfile(esForm.id); setSelEs(s.profiles[0]?.id ?? ""); }}>Sil</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "ai" && (
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="space-y-1">
              {s.aiProviders.map((p) => (
                <button key={p.id} className={`block w-full rounded border p-1.5 text-left text-sm ${selAi === p.id ? "border-kibana-accent" : "border-kibana-border"} ${s.activeAiId === p.id ? "font-semibold" : ""}`} onClick={() => setSelAi(p.id)}>
                  {p.name} <span className="text-[11px] text-kibana-muted">({p.type}){s.activeAiId === p.id ? " ●" : ""}</span>
                </button>
              ))}
              <button className={btn} onClick={() => { const b = blankAi(); s.upsertAi(b); setSelAi(b.id); }}>+ Yeni (custom)</button>
            </div>
            {aiForm && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lbl}>Ad</label><input className={inp} value={aiForm.name} onChange={(e) => setAiForm({ ...aiForm, name: e.target.value })} /></div>
                  <div><label className={lbl}>Tip</label>
                    <select className={inp} value={aiForm.type} onChange={(e) => setAiForm({ ...aiForm, type: e.target.value as AiProviderType })}>
                      {AI_TYPES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
                    </select>
                  </div>
                </div>
                {aiForm.type === "corporate" ? (
                  <>
                    <div><label className={lbl}>Base URL</label><input className={inp} value={aiForm.baseUrl} onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })} placeholder="https://ai-backend.example.com" /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className={lbl}>Username</label><input className={inp} value={aiForm.username} onChange={(e) => setAiForm({ ...aiForm, username: e.target.value })} /></div>
                      <div><label className={lbl}>NodeName</label><input className={inp} value={aiForm.nodeName} onChange={(e) => setAiForm({ ...aiForm, nodeName: e.target.value })} /></div>
                      <div><label className={lbl}>SelectedBot</label><input className={inp} value={aiForm.selectedBot} onChange={(e) => setAiForm({ ...aiForm, selectedBot: e.target.value })} /></div>
                      <div><label className={lbl}>SelectedVersion</label><input className={inp} value={aiForm.selectedVersion} onChange={(e) => setAiForm({ ...aiForm, selectedVersion: e.target.value })} /></div>
                    </div>
                  </>
                ) : (
                  <>
                    <div><label className={lbl}>Base URL {aiForm.type === "gemini" ? "(boş = Google)" : ""}</label><input className={inp} value={aiForm.baseUrl} onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })} placeholder={aiForm.type === "openai" ? "https://api.openai.com/v1" : aiForm.type === "openrouter" ? "https://openrouter.ai/api/v1" : ""} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className={lbl}>API Key</label><input className={inp} type={showSecrets ? "text" : "password"} value={aiForm.apiKey} onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })} /></div>
                      <div><label className={lbl}>Model</label><input className={inp} value={aiForm.model} onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })} placeholder="gpt-4o-mini" /></div>
                    </div>
                    <div><label className={lbl}>Ek header&apos;lar (JSON)</label><textarea className={`${inp} font-mono`} rows={2} value={headersText} onChange={(e) => setHeadersText(e.target.value)} /></div>
                  </>
                )}
                <label className="flex items-center gap-2 text-xs text-kibana-muted">
                  <input type="checkbox" checked={showSecrets} onChange={(e) => setShowSecrets(e.target.checked)} /> gizli alanları göster
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={btn} onClick={saveAi}>Kaydet</button>
                  <button className={btn} disabled={testing} onClick={testAi}>{testing ? "Test ediliyor…" : "Test et"}</button>
                  <button className={btn} onClick={() => s.set({ activeAiId: aiForm.id })}>Aktif yap</button>
                  <button className="btn-danger rounded border px-3 py-1.5 text-sm" onClick={() => { s.removeAi(aiForm.id); setSelAi(s.aiProviders[0]?.id ?? ""); }}>Sil</button>
                </div>
              </div>
            )}
          </div>
        )}

        {msg && <div className="mt-3 rounded border border-kibana-border bg-kibana-bg p-2 text-sm">{msg}</div>}
      </div>
    </div>
  );
}
