"use client";

// Tarayıcı tarafı yardımcıları.

export async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error) throw new Error(String(data.error || `İstek hatası (${res.status})`));
  return data as T;
}

/** "logs-*" gibi glob'u RegExp'e çevirir. */
export function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${esc}$`);
}

/** Noktalı alan adı hem düz key hem nested path olabilir — ikisini de dener. */
export function getField(source: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  let cur: unknown = source;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function str(v: unknown, max = 500): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function fmtNum(n: number | null): string {
  if (n === null) return "?";
  return new Intl.NumberFormat("tr-TR").format(n);
}

export function levelColor(level: string): string {
  const l = level.toUpperCase();
  if (/(ERROR|FATAL|CRIT)/.test(l)) return "lv-err";
  if (/WARN/.test(l)) return "lv-warn";
  if (/(INFO|INFORMATION)/.test(l)) return "lv-info";
  if (/DEBUG/.test(l)) return "lv-dbg";
  return "lv-rest";
}

/** Geçerli ISO mu? */
export function isIso(s: string): boolean {
  return !Number.isNaN(Date.parse(s));
}

/** datetime-local input değeri (İstanbul duvar saati) → UTC ISO. */
export function localToIso(local: string): string {
  // "2026-09-16T14:30" İstanbul duvar saati kabul edilir (UTC+3 sabit).
  const m = local.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return "";
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 3 * 3600 * 1000;
  return new Date(utc).toISOString();
}

/** UTC ISO → datetime-local (İstanbul). */
export function isoToLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const w = new Date(d.getTime() + 3 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())}T${p(w.getUTCHours())}:${p(w.getUTCMinutes())}`;
}
