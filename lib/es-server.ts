// Elasticsearch erişim katmanı — GÜVENLİK KURALI:
// Bu dosya SADECE HTTP GET üretir. POST/PUT/DELETE burada yoktur ve
// bir allowlist dışında hiçbir path'e istek atılmaz.
// Sayfalama: search_after zorunlu, sayfa boyu en fazla 100. scroll/PIT/from yok.

import http from "node:http";
import https from "node:https";
import type { EsHit, EsProfile, LogFilter } from "./types";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 10;
export const ES_TIMEOUT_MS = 30_000;

/** Elastic'e giden izinli yollar (hepsi salt-okuma). */
const ALLOWED = [
  /^\/$/,
  /^\/_cat\/indices(\?.*)?$/,
  /^\/_cluster\/health(\?.*)?$/,
  /^\/[^/]+\/_mapping(\?.*)?$/,
  /^\/[^/]+\/_field_caps(\?.*)?$/,
  /^\/[^/]+\/_search(\?.*)?$/,
];

export function assertAllowed(path: string): void {
  if (!ALLOWED.some((re) => re.test(path))) {
    throw new Error("İzin verilmeyen ES yolu (salt-okuma dışı): " + path);
  }
}

function authHeader(profile: EsProfile): string | null {
  if (profile.authType === "apiKey" && profile.apiKey) return `ApiKey ${profile.apiKey}`;
  if (profile.authType === "basic" && (profile.username || profile.password)) {
    return "Basic " + Buffer.from(`${profile.username}:${profile.password}`, "utf8").toString("base64");
  }
  return null;
}

/** Ham GET — bu modüldeki tek HTTP çağrısı. */
export function esGet(profile: EsProfile, path: string): Promise<unknown> {
  assertAllowed(path);
  const base = profile.esUrl.endsWith("/") ? profile.esUrl : profile.esUrl + "/";
  const url = new URL(path, base);
  const lib = url.protocol === "https:" ? https : http;
  const headers: Record<string, string> = { Accept: "application/json" };
  const auth = authHeader(profile);
  if (auth) headers["Authorization"] = auth;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      { method: "GET", headers, rejectUnauthorized: !(profile.insecure ?? true) } as never,
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Elasticsearch ${status}: ${body.slice(0, 500)}`));
            return;
          }
          try {
            resolve(body ? JSON.parse(body) : null);
          } catch {
            reject(new Error("ES geçersiz JSON döndü"));
          }
        });
      }
    );
    req.on("error", (e) => reject(new Error("ES bağlantı hatası: " + (e as Error).message)));
    req.setTimeout(ES_TIMEOUT_MS, () => req.destroy(new Error("ES zaman aşımı (30sn)")));
    req.end();
  });
}

export interface BoolQueryArgs {
  queryText?: string;
  timeField: string;
  gte?: string;
  lte?: string;
  filters?: LogFilter[];
}

/** Ortak bool sorgusu (search + histogram aynı filtreyi kullanır). */
export function buildBoolQuery(args: BoolQueryArgs): Record<string, unknown> {
  const { timeField, gte, lte, filters } = args;
  const queryText = (args.queryText ?? "").slice(0, 500);
  const must: unknown[] = [];
  const mustNot: unknown[] = [];
  const filter: unknown[] = [];

  if (queryText.trim()) {
    must.push({
      simple_query_string: { query: queryText, default_operator: "and", lenient: true },
    });
  }
  if ((gte || lte) && timeField) {
    const range: Record<string, string> = {};
    if (gte) range.gte = gte;
    if (lte) range.lte = lte;
    filter.push({ range: { [timeField]: range } });
  }
  for (const f of (filters ?? []).slice(0, 10)) {
    if (!f.field || f.value === undefined || f.value === "") continue;
    const term = { term: { [f.field]: f.value } };
    if (f.exclude) mustNot.push(term);
    else must.push(term);
  }
  return { bool: { must, must_not: mustNot, filter } };
}

export function clampSize(size?: number): number {
  const n = Math.floor(size ?? DEFAULT_PAGE_SIZE);
  if (Number.isNaN(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(n, 1), MAX_PAGE_SIZE);
}

export interface SearchArgs extends BoolQueryArgs {
  index: string;
  size?: number;
  searchAfter?: unknown[] | null;
}

export interface SearchResult {
  hits: EsHit[];
  total: number | null;
  totalRelation: string;
  nextSearchAfter: unknown[] | null;
  took?: number;
  dsl: Record<string, unknown>;
}

function searchPath(index: string, dsl: Record<string, unknown>): string {
  const source = JSON.stringify(dsl);
  const path =
    `/${index}/_search?source_content_type=application/json&source=` + encodeURIComponent(source);
  // Netty varsayılan satır limitine takılmamak için guard (DSL zaten küçük tutulur).
  if (path.length > 7000) throw new Error("Sorgu URL limitini aşıyor; metni kısaltın veya filtre azaltın.");
  return path;
}

export async function searchLogs(profile: EsProfile, args: SearchArgs): Promise<SearchResult> {
  const timeField = args.timeField || "@timestamp";
  const size = clampSize(args.size);
  const dsl: Record<string, unknown> = {
    size,
    track_total_hits: true,
    // NOT: tiebreaker olarak _id KULLANMA — bu cluster'da _id fielddata kapalı
    // ("Fielddata access on the _id field is disallowed") ve sorgu 0 sonuç dönüyor.
    // _shard_doc da PIT istediği için (PIT = POST gerektirir, yasak) kullanılamaz.
    // Bu yüzden tek alanla sıralanır; aynı milisaniyedeki kayıtlar sayfa sınırında
    // nadiren tekrarlayabilir/atlayabilir — toplam sayı (total) her zaman doğrudur.
    sort: [{ [timeField]: { order: "desc" } }],
    query: buildBoolQuery({ ...args, timeField }),
  };
  if (args.searchAfter && Array.isArray(args.searchAfter)) dsl.search_after = args.searchAfter;

  const raw = (await esGet(profile, searchPath(args.index, dsl))) as {
    took?: number;
    hits?: { total?: number | { value?: number; relation?: string }; hits?: EsHit[] };
  };
  const hits = raw.hits?.hits ?? [];
  const t = raw.hits?.total;
  const total = typeof t === "number" ? t : (t?.value ?? null);
  const totalRelation = typeof t === "number" ? "eq" : (t?.relation ?? "eq");
  const nextSearchAfter = hits.length > 0 ? (hits[hits.length - 1].sort ?? null) : null;
  return { hits, total, totalRelation, nextSearchAfter, took: raw.took, dsl };
}

function pickInterval(spanMs: number): string {
  if (spanMs <= 3 * 3_600_000) return "5m";
  if (spanMs <= 24 * 3_600_000) return "30m";
  if (spanMs <= 7 * 86_400_000) return "3h";
  if (spanMs <= 31 * 86_400_000) return "1d";
  return "7d";
}

export async function histogram(
  profile: EsProfile,
  args: BoolQueryArgs & { index: string }
): Promise<{ buckets: { key: number; keyAsString: string; count: number }[]; interval: string }> {
  const timeField = args.timeField || "@timestamp";
  const span = Date.parse(args.lte ?? "") - Date.parse(args.gte ?? "");
  const interval = pickInterval(Number.isFinite(span) && span > 0 ? span : 3_600_000);
  const dsl = {
    size: 0,
    track_total_hits: false,
    query: buildBoolQuery({ ...args, timeField }),
    aggs: {
      h: {
        date_histogram: {
          field: timeField,
          fixed_interval: interval,
          min_doc_count: 0,
          extended_bounds: { min: args.gte, max: args.lte },
        },
      },
    },
  };
  const raw = (await esGet(profile, searchPath(args.index, dsl))) as {
    aggregations?: { h?: { buckets?: { key?: number; key_as_string?: string; doc_count?: number }[] } };
  };
  const buckets = (raw.aggregations?.h?.buckets ?? []).map((b) => ({
    key: b.key ?? 0,
    keyAsString: b.key_as_string ?? "",
    count: b.doc_count ?? 0,
  }));
  return { buckets, interval };
}

export interface IndexInfo {
  index: string;
  health: string;
  status: string;
  docsCount: number | null;
  storeSize: string;
}

export async function catIndices(profile: EsProfile): Promise<IndexInfo[]> {
  const raw = (await esGet(
    profile,
    "/_cat/indices?format=json&h=index,health,status,docs.count,store.size&s=index"
  )) as Record<string, string>[];
  return (Array.isArray(raw) ? raw : []).slice(0, 5000).map((r) => ({
    index: r.index ?? "",
    health: r.health ?? "",
    status: r.status ?? "",
    docsCount: r["docs.count"] ? Number(r["docs.count"]) : null,
    storeSize: r["store.size"] ?? "",
  }));
}

export interface CapsField {
  name: string;
  type: string;
  searchable: boolean;
  aggregatable: boolean;
}

export async function fieldCaps(profile: EsProfile, index: string): Promise<CapsField[]> {
  const raw = (await esGet(profile, `/${index}/_field_caps?fields=*`)) as {
    fields?: Record<string, Record<string, { searchable?: boolean; aggregatable?: boolean }>>;
  };
  const fields = raw.fields ?? {};
  return Object.entries(fields)
    .slice(0, 2000)
    .map(([name, types]) => {
      const entries = Object.entries(types);
      return {
        name,
        type: entries[0]?.[0] ?? "unknown",
        searchable: entries.some(([, v]) => v.searchable),
        aggregatable: entries.some(([, v]) => v.aggregatable),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function rootInfo(profile: EsProfile): Promise<{ cluster: string; version: string }> {
  const raw = (await esGet(profile, "/")) as { cluster_name?: string; version?: { number?: string } };
  return { cluster: raw.cluster_name ?? "?", version: raw.version?.number ?? "?" };
}
