"use client";

import { useEffect, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import Explorer from "@/components/Explorer";
import SettingsDialog from "@/components/SettingsDialog";
import { api } from "@/lib/client";
import { ensureEnvDefaults, ensureActiveProfilePassword, passwordError, passwordMissing } from "@/lib/defaults";
import { THEME_LABEL, applyTheme, nextTheme } from "@/lib/theme";
import { uid, useStore } from "@/lib/store";
import type { CapsField } from "@/lib/es-server";

/** Index isimlerindeki tarih/sayı eklerini atıp "önek-*" tavsiyeleri üretir. */
function suggestPatterns(rows: { index: string }[]): { pattern: string; count: number }[] {
  const groups = new Map<string, number>();
  for (const r of rows) {
    if (r.index.startsWith(".")) continue;
    const base = r.index
      .replace(/-\d{4}\.\d{2}(\.\d{2})?$/, "")
      .replace(/-\d{6}$/, "")
      .replace(/-\d{4,}$/, "");
    if (!base) continue;
    const pattern = base + "-*";
    groups.set(pattern, (groups.get(pattern) ?? 0) + 1);
  }
  return Array.from(groups.entries())
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

export default function Home() {  const s = useStore();
  const profile = s.activeProfile();
  const dv = s.activeDataView();

  // SSR varsayılan state ile çizer, localStorage'daki kayıtlı state farklı olabilir
  // → hydration mismatch olmaması için ilk render'ı bekle.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [pattern, setPattern] = useState(dv.pattern);
  const [timeField, setTimeField] = useState(dv.timeField);
  const [fieldSearch, setFieldSearch] = useState("");
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState("");
  const [dateFields, setDateFields] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<{ pattern: string; count: number }[]>([]);
  const [suggLoading, setSuggLoading] = useState(false);

  // İlk açılış: .env.local'deki varsayılanları doldur, sonra tavsiyeleri getir
  useEffect(() => {
    (async () => {
      await ensureEnvDefaults();
      void loadSuggestions();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tema uygula + sistem değişimini dinle
  useEffect(() => {
    applyTheme(s.theme);
    if (s.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const fn = () => applyTheme("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [s.theme]);

  // Data view değişince formu senkronla + alanları yükle
  useEffect(() => {
    setPattern(dv.pattern);
    setTimeField(dv.timeField);
    void loadFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.activeDataViewId, s.activeProfileId]);

  async function loadFields() {
    const st = useStore.getState();
    let pf = st.activeProfile();
    const view = st.activeDataView();
    if (passwordMissing(pf)) pf = await ensureActiveProfilePassword();
    if (passwordMissing(pf)) {
      setFieldsError(passwordError(pf));
      return;
    }
    if (!view.pattern) return; // view henüz yok (tohumlar yükleniyor olabilir)
    setFieldsLoading(true);
    setFieldsError("");
    try {
      const res = await api<{ fields: CapsField[]; dateFields: string[] }>("/api/es/fields", {
        profile: pf, index: view.pattern,
      });
      const summary = res.fields
        .filter((f) => f.searchable)
        .slice(0, 150)
        .map((f) => `${f.name} (${f.type})`)
        .join("\n");
      st.set({ fields: res.fields, mappingSummary: summary });
      // Görünür kolonlarda kayıtlarda olmayan ad varsa birebir (büyük/küçük harf duyarsız)
      // eşleşmeyle düzelt: örn. level → Level, message → MessageTemplate
      const names = new Set(res.fields.map((f) => f.name));
      const lower = new Map<string, string>();
      for (const f of res.fields) {
        const k = f.name.toLocaleLowerCase("tr");
        if (!lower.has(k)) lower.set(k, f.name);
      }
      const fixed = view.visibleFields.map((v) =>
        names.has(v) ? v : (lower.get(v.toLocaleLowerCase("tr")) ?? v)
      );
      if (fixed.join("\n") !== view.visibleFields.join("\n")) {
        st.upsertDataView({ ...st.activeDataView(), visibleFields: fixed });
      }
      setDateFields(res.dateFields);
      if (!view.timeField && res.dateFields.length > 0) {
        const tf = res.dateFields.includes("@timestamp") ? "@timestamp" : res.dateFields[0];
        setTimeField(tf);
        st.upsertDataView({ ...view, timeField: tf });
      }
    } catch (e) {
      setFieldsError((e as Error).message);
    } finally {
      setFieldsLoading(false);
    }
  }

  /** Indexlerden tavsiye pattern'ler üretir (liste göstermeden, sadece selectbox için). */
  async function loadSuggestions() {
    const st = useStore.getState();
    let pf = st.activeProfile();
    if (passwordMissing(pf)) pf = await ensureActiveProfilePassword();
    if (passwordMissing(pf)) return;
    setSuggLoading(true);
    try {
      const res = await api<{ indices: { index: string }[] }>("/api/es/indices", { profile: pf });
      setSuggestions(suggestPatterns(res.indices));
    } catch {
      // sessiz — butonla tekrar denenebilir
    } finally {
      setSuggLoading(false);
    }
  }

  /** Tavsiye seçimi: view yoksa oluşturur, seçer, formu doldurur. */
  function addSuggestedView(suggestion: string) {
    if (!suggestion) return;
    const st = useStore.getState();
    const pf = st.activeProfile();
    const existing = st.dataViews.find((d) => d.profileId === pf.id && d.pattern === suggestion);
    if (existing) {
      switchView(existing.id);
      return;
    }
    const v = {
      id: uid(), profileId: pf.id, title: suggestion, pattern: suggestion,
      timeField: pf.timeField || "@timestamp", visibleFields: ["@timestamp", "level", "message"],
    };
    st.upsertDataView(v);
    switchView(v.id);
  }

  function switchProfile(id: string) {
    s.set({ activeProfileId: id, hits: [], total: null, searched: false, lastError: "", fields: [], mappingSummary: "" });
    s.resetPaging();
    const first = s.dataViews.find((d) => d.profileId === id);
    if (first) s.set({ activeDataViewId: first.id });
    setSuggestions([]);
    void loadSuggestions();
  }

  function switchView(id: string) {
    const v = s.dataViews.find((d) => d.id === id);
    s.set({ activeDataViewId: id, hits: [], total: null, searched: false, lastError: "" });
    s.resetPaging();
    // Formu anında doldur (alttaki senkron effect de aynısını yapar)
    if (v) {
      setPattern(v.pattern);
      setTimeField(v.timeField);
    }
  }

  function saveView() {
    if (!pattern.trim()) return;
    s.upsertDataView({
      ...dv,
      title: pattern.trim(),
      pattern: pattern.trim(),
      timeField: timeField || "@timestamp",
    });
    void loadFields();
  }

  function newView() {
    const v = {
      id: uid(), profileId: profile.id, title: profile.defaultPattern || "logs-*",
      pattern: profile.defaultPattern || "logs-*",
      timeField: profile.timeField || "@timestamp", visibleFields: ["@timestamp", "level", "message"],
    };
    s.upsertDataView(v);
    s.set({ activeDataViewId: v.id });
  }

  function toggleField(name: string) {
    const has = dv.visibleFields.includes(name);
    s.upsertDataView({
      ...dv,
      visibleFields: has ? dv.visibleFields.filter((f) => f !== name) : [...dv.visibleFields, name],
    });
  }

  const filteredFields = s.fields.filter((f) =>
    !fieldSearch || f.name.toLocaleLowerCase("tr").includes(fieldSearch.toLocaleLowerCase("tr"))
  );

  const inp = "w-full rounded border border-kibana-border bg-kibana-bg px-2 py-1.5 text-sm outline-none focus:border-kibana-accent";
  const btn = "rounded border border-kibana-border bg-kibana-panel2 px-2 py-1.5 text-xs hover:border-kibana-accent disabled:opacity-40";

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-kibana-bg text-sm text-kibana-muted">
        Yükleniyor…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-kibana-bg text-kibana-text">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-kibana-border bg-kibana-panel px-3 py-2">
        <span className="font-bold">🔎 LogFinder</span>
        <span className="hidden text-xs text-kibana-muted sm:inline">AI destekli log bulucu (salt-okuma • sayfalı)</span>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <label className="text-xs text-kibana-muted">Profil:</label>
          <select className="rounded border border-kibana-border bg-kibana-bg px-1 py-1 text-sm" value={s.activeProfileId} onChange={(e) => switchProfile(e.target.value)}>
            {s.profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          <label className="text-xs text-kibana-muted">Data view:</label>
          <select className="rounded border border-kibana-border bg-kibana-bg px-1 py-1 text-sm" value={s.activeDataViewId} onChange={(e) => switchView(e.target.value)}>
            {s.dataViews.filter((d) => d.profileId === profile.id).map((d) => (<option key={d.id} value={d.id}>{d.title}</option>))}
          </select>
          <button className="rounded border border-kibana-border bg-kibana-panel2 px-3 py-1 hover:border-kibana-accent" title="Tema değiştir" onClick={() => s.set({ theme: nextTheme(s.theme) })}>{THEME_LABEL[s.theme]}</button>
          <button className="rounded border border-kibana-border bg-kibana-panel2 px-3 py-1 hover:border-kibana-accent" onClick={() => s.set({ settingsOpen: true })}>⚙ Ayarlar</button>
        </div>
      </header>

      {/* Gövde */}
      <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2 xl:flex-row xl:overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full shrink-0 space-y-2 overflow-auto xl:w-[270px]">
          <div className="rounded border border-kibana-border bg-kibana-panel p-2">
            <div className="mb-1 text-xs font-semibold text-kibana-muted">VIEW&apos;LER (seçmek için tıkla)</div>
            <div className="mb-1 flex gap-1">
              <select
                className={`${inp} text-xs`}
                value=""
                onChange={(e) => addSuggestedView(e.target.value)}
                title="Indexlerden üretilen tavsiye pattern'ler"
              >
                <option value="">
                  {suggLoading ? "Tavsiyeler yükleniyor…" : `Tavsiye pattern seç… (${suggestions.length})`}
                </option>
                {suggestions.map((g) => (
                  <option key={g.pattern} value={g.pattern}>
                    {g.pattern} ({g.count})
                  </option>
                ))}
              </select>
              <button className={`${btn} shrink-0`} onClick={() => void loadSuggestions()} title="Tavsiyeleri yenile">
                {suggLoading ? "…" : "↻"}
              </button>
            </div>
            <div className="space-y-1">
              {s.dataViews.filter((d) => d.profileId === profile.id).map((d) => (
                <div key={d.id} className={`rounded border px-1.5 py-1 text-xs ${d.id === s.activeDataViewId ? "chip-inc" : "border-kibana-border"}`}>
                  <button className="block w-full truncate text-left font-semibold hover:underline" title={`Seç: ${d.pattern}`} onClick={() => switchView(d.id)}>
                    {d.title}
                  </button>
                  <div className="truncate text-[11px] text-kibana-muted" title={d.pattern}>{d.pattern} • {d.timeField}</div>
                </div>
              ))}
              {s.dataViews.filter((d) => d.profileId === profile.id).length === 0 && (
                <div className="text-xs text-kibana-muted">View yok — aşağıdan + Yeni ile ekle.</div>
              )}
            </div>
          </div>

          <div className="rounded border border-kibana-border bg-kibana-panel p-2">
            <div className="mb-1 text-xs font-semibold text-kibana-muted">SEÇİLİ VIEW&apos;İ DÜZENLE</div>
            <label className="mb-1 block text-xs text-kibana-muted">Index pattern</label>
            <input className={inp} value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="logs-*" />
            <label className="mb-1 mt-2 block text-xs text-kibana-muted">Time field</label>
            <select className={inp} value={timeField} onChange={(e) => setTimeField(e.target.value)}>
              {timeField && !dateFields.includes(timeField) && <option value={timeField}>{timeField}</option>}
              {dateFields.map((f) => (<option key={f} value={f}>{f}</option>))}
              {dateFields.length === 0 && <option value="@timestamp">@timestamp</option>}
            </select>
            <div className="mt-2 flex gap-1">
              <button className={btn} onClick={saveView}>Kaydet</button>
              <button className={btn} onClick={newView}>+ Yeni</button>
            </div>
          </div>

          <div className="rounded border border-kibana-border bg-kibana-panel p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-kibana-muted">ALANLAR ({s.fields.length})</span>
              <button className={btn} disabled={fieldsLoading} onClick={loadFields}>{fieldsLoading ? "…" : "Yenile"}</button>
            </div>
            {fieldsError && <div className="danger-text mb-1 text-xs">{fieldsError}</div>}
            <input className={`${inp} mb-1`} placeholder="Alan ara…" value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} />
            <div className="max-h-64 overflow-auto text-xs">
              {filteredFields.slice(0, 150).map((f) => (
                <label key={f.name} className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-kibana-panel2">
                  <input type="checkbox" checked={dv.visibleFields.includes(f.name)} onChange={() => toggleField(f.name)} />
                  <span className="truncate" title={`${f.name} (${f.type})`}>{f.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-kibana-muted">{f.type}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* Explorer */}
        <section className="min-h-[520px] min-w-0 flex-1 xl:min-h-0">
          <Explorer />
        </section>

        {/* Chat */}
        <section className="min-h-[420px] w-full shrink-0 xl:min-h-0 xl:w-[380px]">
          <ChatPanel />
        </section>
      </main>

      <SettingsDialog />
    </div>
  );
}
