"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api, fmtNum, getField, isIso, levelColor, localToIso, str } from "@/lib/client";
import { PRESETS, formatTR, resolvePreset } from "@/lib/date-tr";
import { uid, useStore } from "@/lib/store";
import { ensureActiveProfilePassword, passwordError, passwordMissing } from "@/lib/defaults";
import type { EsHit } from "@/lib/types";

interface HistBucket {
  key: number;
  keyAsString: string;
  count: number;
}

function csvEsc(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/** Uzun metin hücresi: kısa gösterir, "devamı" ile çekmece gibi açılır. */function CellValue({ value, max = 200 }: { value: unknown; max?: number }) {
  const [open, setOpen] = useState(false);
  const full = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  if (!full || full.length <= max) return <>{full}</>;
  return (
    <span>
      {open ? full : full.slice(0, max) + "…"}
      <button
        className="ml-1 rounded border border-kibana-border px-1 text-[11px] text-kibana-muted hover:border-kibana-accent hover:text-sky-200"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {open ? "kapat" : "devamı"}
      </button>
    </span>
  );
}

/** HTTP status kodu mu? (ResponseStatusCode, status, statusCode, status_code...) */
function isStatusCodeField(field: string, value: unknown): boolean {
  if (!/(statuscode|status_code|response.?status|^status$)/i.test(field)) return false;
  const n =
    typeof value === "number" ? value
    : typeof value === "string" && /^\s*\d{3}\s*$/.test(value) ? Number(value)
    : NaN;
  return Number.isInteger(n) && n >= 100 && n < 600;
}

/** 2xx yeşil, 4xx/5xx kırmızı, diğerleri sarı rozet. */
function StatusBadge({ code }: { code: number }) {
  const cls = code >= 200 && code < 300 ? "badge-ok" : code >= 400 ? "badge-err" : "badge-warn";
  return (
    <span className={`${cls} inline-block rounded border px-1.5 py-0.5 font-mono text-xs font-semibold`}>
      {code}
    </span>
  );
}

/** Nested objeyi Kibana tarzı "a.b.c" satırlarına düzleştirir. */
function flatten(
  source: Record<string, unknown>,
  prefix = "",
  out: { field: string; value: unknown }[] = []
): { field: string; value: unknown }[] {
  for (const [k, v] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flatten(v as Record<string, unknown>, path, out);
    } else {
      out.push({ field: path, value: v });
    }
  }
  return out;
}

/** Kibana tarzı kayıt detayı: Tablo / JSON sekmeli, tipli, +/- filtre butonlu. */
function DocDetail({ hit, colSpan }: { hit: EsHit; colSpan: number }) {
  const [tab, setTab] = useState<"table" | "json">("table");
  const fields = useStore((s) => s.fields);
  const rows = useMemo(
    () => flatten(hit._source).sort((a, b) => a.field.localeCompare(b.field)),
    [hit]
  );
  const typeOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fields) if (!m.has(f.name)) m.set(f.name, f.type);
    return m;
  }, [fields]);

  function addFilter(field: string, value: unknown, exclude: boolean) {
    const v = str(value, 500);
    if (!v) return;
    const st = useStore.getState();
    if (st.filters.some((f) => f.field === field && f.value === v && f.exclude === exclude)) return;
    // Kibana gibi: filtreyi ekle ve hemen yeniden ara
    st.resetPaging();
    st.set({
      filters: [...st.filters, { id: uid(), field, value: v, exclude }],
      searchNonce: st.searchNonce + 1,
    });
  }

  const tabBtn = (active: boolean) =>
    `rounded border px-2 py-0.5 ${active ? "chip-inc" : "border-kibana-border text-kibana-muted hover:border-kibana-accent"}`;

  return (
    <tr>
      <td />
      <td colSpan={colSpan} className="codebox p-2">
        <div className="mb-1 flex items-center gap-2 text-xs text-kibana-muted">
          <span className="truncate">{hit._index} • {hit._id}</span>
          <span className="ml-auto flex shrink-0 gap-1">
            <button className={tabBtn(tab === "table")} onClick={() => setTab("table")}>Tablo</button>
            <button className={tabBtn(tab === "json")} onClick={() => setTab("json")}>JSON</button>
          </span>
        </div>
        {tab === "json" ? (
          <pre className="max-h-96 overflow-auto text-xs">{JSON.stringify(hit._source, null, 2)}</pre>
        ) : (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {rows.map((r) => {
                const prim = r.value === null || ["string", "number", "boolean"].includes(typeof r.value);
                const t = typeOf.get(r.field);
                return (
                  <tr key={r.field} className="border-b border-kibana-border/40 hover:bg-kibana-panel2">
                    <td className="accent-ink w-52 max-w-[280px] break-all p-1 align-top">
                      {r.field}
                      {t && <span className="ml-1 text-[10px] text-kibana-muted">({t})</span>}
                    </td>
                    <td className="break-all p-1 align-top">
                      {isStatusCodeField(r.field, r.value)
                        ? <StatusBadge code={Number(r.value)} />
                        : <CellValue value={r.value} max={300} />}
                    </td>
                    <td className="w-14 shrink-0 p-1 text-right align-top">
                      {prim && str(r.value, 500) !== "" && (
                        <>
                          <button className="accent-ink mr-1 rounded border border-kibana-border px-1.5 hover:border-kibana-accent" title={`Filtrele: ${r.field} = değer`} onClick={() => addFilter(r.field, r.value, false)}>+</button>
                          <button className="btn-danger rounded border px-1.5" title={`Hariç tut: ${r.field} = değer`} onClick={() => addFilter(r.field, r.value, true)}>−</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

export default function Explorer() {
  const s = useStore();
  const profile = s.activeProfile();
  const dv = s.activeDataView();

  const [loading, setLoading] = useState(false);
  const [hist, setHist] = useState<HistBucket[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [showDsl, setShowDsl] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fField, setFField] = useState("");
  const [fValue, setFValue] = useState("");
  const [fExclude, setFExclude] = useState(false);
  const lastNext = useRef<unknown[] | null>(null);

  function resolveRange(): { gte: string; lte: string } {
    if (s.preset === "ozel") return { gte: s.customGte, lte: s.customLte };
    return resolvePreset(s.preset);
  }

  async function doSearch(dir: "new" | "next" | "prev") {
    const st = useStore.getState();
    let pf = st.activeProfile();
    const view = st.activeDataView();
    const range = st.preset === "ozel" ? { gte: st.customGte, lte: st.customLte } : resolvePreset(st.preset);
    if (!isIso(range.gte) || !isIso(range.lte)) {
      st.set({ lastError: "Geçersiz tarih aralığı. Özel tarihler için iki alanı da doldurun." });
      return;
    }
    if (passwordMissing(pf)) pf = await ensureActiveProfilePassword();
    if (passwordMissing(pf)) {
      st.set({ lastError: passwordError(pf) });
      return;
    }
    const searchAfter =
      dir === "new" ? null : dir === "next" ? lastNext.current : (st.searchAfterStack[st.page - 1] ?? null);
    st.set({ busy: true, lastError: "" });
    setLoading(true);
    try {
      const res = await api<{
        hits: typeof st.hits;
        total: number | null;
        totalRelation: string;
        nextSearchAfter: unknown[] | null;
        took?: number;
        dsl: unknown;
      }>("/api/es/search", {
        profile: pf,
        index: view.pattern,
        queryText: st.queryText,
        timeField: view.timeField,
        gte: range.gte,
        lte: range.lte,
        filters: st.filters,
        size: st.pageSize,
        searchAfter,
      });
      lastNext.current = null; // aşağıda yöne göre doğru değer atanır
      const common = {
        hits: res.hits,
        total: res.total,
        totalRelation: res.totalRelation,
        dslPreview: JSON.stringify(res.dsl, null, 2),
        lastTook: res.took,
        searched: true,
      };
      if (dir === "new") {
        lastNext.current = res.nextSearchAfter;
        st.set({ ...common, searchAfterStack: [null], page: 0 });
      } else if (dir === "next") {
        // Bu sayfayı getiren anahtar = bir önceki sayfanın next anahtarıydı.
        lastNext.current = res.nextSearchAfter;
        st.set({
          ...common,
          searchAfterStack: [...st.searchAfterStack.slice(0, st.page + 1), searchAfter],
          page: st.page + 1,
        });
      } else {
        const newPage = Math.max(0, st.page - 1);
        // İleri anahtarı stack'te zaten kayıtlı.
        lastNext.current = st.searchAfterStack[newPage + 1] ?? null;
        st.set({ ...common, page: newPage });
      }
      setExpanded({});
      void fetchHist(pf, view.pattern, view.timeField, range.gte, range.lte);
    } catch (e) {
      st.set({ lastError: (e as Error).message });
    } finally {
      st.set({ busy: false });
      setLoading(false);
    }
  }

  async function fetchHist(pf: typeof profile, index: string, timeField: string, gte: string, lte: string) {
    const st = useStore.getState();
    setHistLoading(true);
    try {
      const res = await api<{ buckets: HistBucket[] }>("/api/es/histogram", {
        profile: pf, index, queryText: st.queryText, timeField, gte, lte, filters: st.filters,
      });
      setHist(res.buckets);
    } catch {
      setHist([]);
    } finally {
      setHistLoading(false);
    }
  }

  // Chat "Tabloya uygula" tetikleyicisi
  const nonce = s.searchNonce;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    void doSearch("new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const totalStr =
    s.total === null ? "?" : s.totalRelation === "gte" ? `${fmtNum(s.total)}+` : fmtNum(s.total);
  const maxCount = hist.reduce((m, b) => Math.max(m, b.count), 0);

  // Efektif kolonlar: kayıtlarda hiç geçmeyen kolon gizlenir (örn. level var ama Level yoksa).
  const configuredCols = dv.visibleFields.length > 0 ? dv.visibleFields : ["@timestamp", "message"];
  const cols = useMemo(() => {
    if (s.hits.length === 0) return configuredCols;
    const present = configuredCols.filter((f) => s.hits.some((h) => getField(h._source, f) !== undefined));
    if (present.length > 0) return present;
    const keys = Object.keys(s.hits[0]._source);
    const pick = (re: RegExp) => keys.find((k) => re.test(k));
    const fb: string[] = [];
    for (const k of [pick(/timestamp|time|date/i), pick(/level|severity/i), pick(/message|msg|text|template/i), ...keys]) {
      if (k && !fb.includes(k)) fb.push(k);
      if (fb.length >= 4) break;
    }
    return fb.length > 0 ? fb : keys.slice(0, 4);
  }, [configuredCols, s.hits]);
  const hiddenCols = s.hits.length > 0 ? configuredCols.filter((c) => !cols.includes(c)) : [];

  function exportCsv() {
    const lines = [cols.map(csvEsc).join(",")];
    for (const h of s.hits) {
      lines.push(cols.map((c) => csvEsc(str(getField(h._source, c), 300))).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `logfinder-sayfa-${s.page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const btn = "rounded border border-kibana-border bg-kibana-panel2 px-3 py-1.5 text-sm hover:border-kibana-accent disabled:opacity-40";
  const inp = "rounded border border-kibana-border bg-kibana-bg px-2 py-1.5 text-sm outline-none focus:border-kibana-accent";

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Sorgu barı */}
      <div className="flex flex-wrap items-center gap-2 rounded border border-kibana-border bg-kibana-panel p-2">
        <input
          className={`${inp} min-w-[200px] flex-1`}
          placeholder="Ara: error payment timeout… (boş = tümü)"
          value={s.queryText}
          onChange={(e) => s.set({ queryText: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && void doSearch("new")}
        />
        <select className={inp} value={s.preset} onChange={(e) => s.set({ preset: e.target.value })}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {s.preset === "ozel" && (
          <>
            <input
              type="datetime-local" className={inp} value={s.customGte}
              onChange={(e) => s.set({ customGte: localToIso(e.target.value) })}
            />
            <input
              type="datetime-local" className={inp} value={s.customLte}
              onChange={(e) => s.set({ customLte: localToIso(e.target.value) })}
            />
          </>
        )}
        <select
          className={inp} value={s.pageSize}
          onChange={(e) => s.set({ pageSize: Number(e.target.value) })}
          title="Sayfa başına kayıt (en fazla 100 — toplu çekme yok)"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>{n}/sayfa</option>
          ))}
        </select>
        <button className="btn-primary rounded px-4 py-1.5 text-sm font-semibold disabled:opacity-40" disabled={loading || s.busy} onClick={() => void doSearch("new")}>
          {loading ? "Aranıyor…" : "Ara"}
        </button>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2 rounded border border-kibana-border bg-kibana-panel p-2">
        <span className="text-xs text-kibana-muted">Filtreler:</span>
        {s.filters.map((f) => (
          <span key={f.id} className={`rounded border px-2 py-0.5 text-xs ${f.exclude ? "chip-exc" : "chip-inc"}`}>
            {f.exclude ? "−" : "+"} {f.field} = {f.value}
            <button className="ml-1 text-kibana-muted hover:text-white" onClick={() => s.set({ filters: s.filters.filter((x) => x.id !== f.id) })}>✕</button>
          </span>
        ))}
        <input className={`${inp} w-32`} placeholder="alan (level)" value={fField} onChange={(e) => setFField(e.target.value)} list="lf-fields" />
        <input className={`${inp} w-32`} placeholder="değer (ERROR)" value={fValue} onChange={(e) => setFValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFilter()} />
        <label className="flex items-center gap-1 text-xs text-kibana-muted">
          <input type="checkbox" checked={fExclude} onChange={(e) => setFExclude(e.target.checked)} /> hariç
        </label>
        <button className={btn} onClick={addFilter}>Ekle</button>
        <datalist id="lf-fields">
          {s.fields.slice(0, 200).map((f) => (
            <option key={f.name} value={f.name} />
          ))}
        </datalist>
      </div>

      {s.lastError && (
        <div className="alert-err rounded border p-2 text-sm">{s.lastError}</div>
      )}

      {/* Histogram */}
      <div className="rounded border border-kibana-border bg-kibana-panel p-2">
        <div className="mb-1 flex items-center justify-between text-xs text-kibana-muted">
          <span>Zaman dağılımı {histLoading ? "(yükleniyor…)" : ""}</span>
          <span>{s.searched ? `Toplam: ${totalStr} • Sayfa ${s.page + 1} • ${s.lastTook ?? "?"} ms` : "Henüz arama yapılmadı"}</span>
        </div>
        <div className="flex h-16 items-end gap-[2px]">
          {hist.length === 0 && <div className="text-xs text-kibana-muted">—</div>}
          {hist.map((b) => (
            <div
              key={b.key}
              title={`${b.keyAsString}: ${fmtNum(b.count)}`}
              className="min-w-[2px] flex-1 rounded-t bg-kibana-accent/70 hover:bg-kibana-accent"
              style={{ height: `${maxCount ? Math.max(4, Math.round((b.count / maxCount) * 100)) : 0}%` }}
            />
          ))}
        </div>
      </div>

      {hiddenCols.length > 0 && s.searched && (
        <div className="rounded border border-kibana-border bg-kibana-panel p-1.5 text-xs text-kibana-muted">
          Şu kolonlar kayıtlarda bulunamadığı için gizlendi: <b>{hiddenCols.join(", ")}</b>
          {" "}(Sol panel → ALANLAR&apos;dan gerçek alan adlarını işaretleyin.)
        </div>
      )}

      {/* Tablo */}
      <div className="min-h-0 flex-1 overflow-auto rounded border border-kibana-border bg-kibana-panel">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-kibana-panel2">
            <tr>
              <th className="w-8 border-b border-kibana-border p-1" />
              {cols.map((c) => (
                <th key={c} className="border-b border-kibana-border p-1 text-left font-semibold text-kibana-muted">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.hits.map((h) => {
              return (
                <Fragment key={h._id}>
                  <tr key={h._id} className="cursor-pointer border-b border-kibana-border/50 hover:bg-kibana-panel2" onClick={() => setExpanded((e) => ({ ...e, [h._id]: !e[h._id] }))}>
                    <td className="p-1 text-center text-kibana-muted">{expanded[h._id] ? "▾" : "▸"}</td>
                    {cols.map((c) => (
                      <td key={c} className={`max-w-[420px] break-all p-1 ${/level|severity/i.test(c) ? levelColor(str(getField(h._source, c))) : ""}`}>
                        {/timestamp|time|date/i.test(c)
                          ? formatTR(str(getField(h._source, c)))
                          : isStatusCodeField(c, getField(h._source, c))
                            ? <StatusBadge code={Number(getField(h._source, c))} />
                            : <CellValue value={getField(h._source, c)} />}
                      </td>
                    ))}
                  </tr>
                  {expanded[h._id] && (
                    <DocDetail key={h._id + "-x"} hit={h} colSpan={cols.length} />
                  )}
                </Fragment>
              );
            })}
            {s.searched && s.hits.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="p-4 text-center text-kibana-muted">Kayıt bulunamadı.</td></tr>
            )}
            {!s.searched && (
              <tr><td colSpan={cols.length + 1} className="p-4 text-center text-kibana-muted">Arama yapın veya chat&apos;ten isteyin.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sayfalama */}
      <div className="flex flex-wrap items-center gap-2 rounded border border-kibana-border bg-kibana-panel p-2 text-sm">
        <button className={btn} disabled={s.page === 0 || loading} onClick={() => void doSearch("prev")}>← Önceki</button>
        <span className="text-kibana-muted">Sayfa {s.page + 1}</span>
        <button className={btn} disabled={!lastNext.current || loading || s.hits.length < s.pageSize} onClick={() => void doSearch("next")}>Sonraki →</button>
        <button className={btn} disabled={s.hits.length === 0} onClick={exportCsv}>Bu sayfayı indir (CSV, {s.hits.length})</button>
        <button className={btn} onClick={() => setShowDsl((v) => !v)}>DSL {showDsl ? "gizle" : "göster"}</button>
        <span className="ml-auto text-xs text-kibana-muted">Toplu çekme yok — her sayfada en fazla {s.pageSize} kayıt.</span>
      </div>
      {showDsl && s.dslPreview && (
        <pre className="codebox max-h-48 overflow-auto rounded border border-kibana-border p-2 text-xs">{s.dslPreview}</pre>
      )}
    </div>
  );

  function addFilter() {
    if (!fField.trim() || !fValue) return;
    s.set({ filters: [...s.filters, { id: uid(), field: fField.trim(), value: fValue, exclude: fExclude }] });
    setFField("");
    setFValue("");
    setFExclude(false);
  }
}
