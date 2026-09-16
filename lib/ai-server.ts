// AI orkestrasyonu — tüm sağlayıcılar tek interface arkasında.
// Kurumsal/Gemini: <ES_QUERY> delimiter fallback. OpenAI/OpenRouter/Custom: native tool-call (+fallback).

import { parseTurkishDate } from "./date-tr";
import { histogram, searchLogs } from "./es-server";
import type { AiProvider, EsHit, EsProfile, LogFilter } from "./types";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiContext {
  profile: EsProfile;
  pattern: string;
  timeField: string;
  mappingSummary: string;
  dateGte: string;
  dateLte: string;
  userText: string;
  prevSearchAfter?: unknown[] | null;
}

export interface Orchestrated {
  reply: string;
  dslPreview: string;
  hits: EsHit[];
  total: number | null;
  totalRelation: string;
  nextSearchAfter: unknown[] | null;
  took?: number;
  histogram: { key: number; keyAsString: string; count: number }[];
  dateGte: string;
  dateLte: string;
  suggestedFilters: LogFilter[];
  queryText: string;
}

const AI_TIMEOUT_MS = 90_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`AI ${res.status}: ${text.slice(0, 400)}`);
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new Error("AI geçersiz JSON döndü");
    }
  } finally {
    clearTimeout(timer);
  }
}

export function buildSystemPrompt(ctx: Omit<AiContext, "profile" | "userText"> & { nowIstanbul: string }): string {
  return [
    "Sen bir Elasticsearch log arama asistanısın. Kullanıcı Türkçe veya İngilizce yazabilir; sen Türkçe cevap ver.",
    `Aktif data view: pattern="${ctx.pattern}", timeField="${ctx.timeField}".`,
    `Bilinen alanlar (mapping özeti):\n${ctx.mappingSummary || "(henüz yüklenmedi — genel alan adlarını kullan)"}`,
    `Şu an (İstanbul): ${ctx.nowIstanbul}. Varsayılan aralık: ${ctx.dateGte} .. ${ctx.dateLte} (UTC ISO).`,
    "Log aramak için TEK yol: <ES_QUERY>{...}</ES_QUERY> bloğu üretmek. JSON şeması:",
    '{"queryText": "aranacak metin (boş olabilir)", "timeGte": "ISO|null", "timeLte": "ISO|null",',
    ' "filters": [{"field": "level", "value": "ERROR", "exclude": false}], "size": 25, "histogram": true, "nextPage": false}',
    "Kurallar:",
    "1. ASLA tüm veriyi isteme: size en fazla 50, varsayılan 25. Sayfalama search_after ile yapılır; kullanıcı 'devam/sonraki sayfa' derse nextPage:true gönder, yeni filtre uydurma.",
    "2. Tarihi kullanıcı cümlesinden çıkar ('son 2 saat', 'dün', '12 Eylül 14:00-16:00'...). Yoksa timeGte/timeLte=null bırak (varsayılan aralık kullanılır). Her zaman geçmişe dönük UTC ISO üret.",
    "3. Sadece mapping özetindeki alanları kullan; alan uydurma. Emin değilsen queryText'e yaz, filter yapma.",
    "4. Önce 1-2 cümle ne arayacağını söyle, SONRA ES_QUERY bloğunu koy. Blok dışında JSON yazma.",
    "5. Sana 'ARA SONUCU:' ile sonuç geri verilecek; onu kullanıcıya özetle: hata yoğunluğu, öne çıkan mesajlar, zaman dağılımı. Ham JSON'u aynen yapıştırma.",
  ].join("\n");
}

const ES_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "es_search",
    description: "Elasticsearch'te sayfalı log araması yapar. Asla tüm veriyi çekmez (size<=50).",
    parameters: {
      type: "object",
      properties: {
        queryText: { type: "string", description: "Serbest metin arama" },
        timeGte: { type: "string", description: "Başlangıç (UTC ISO) veya null" },
        timeLte: { type: "string", description: "Bitiş (UTC ISO) veya null" },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              value: { type: "string" },
              exclude: { type: "boolean" },
            },
          },
        },
        size: { type: "number", description: "1-50 arası, varsayılan 25" },
        histogram: { type: "boolean" },
        nextPage: { type: "boolean" },
      },
    },
  },
};

interface ProviderOut {
  text: string;
  toolArgs?: Record<string, unknown>;
}

function normalizeBase(u: string): string {
  return (u || "").trim().replace(/\/+$/, "");
}

async function callCorporate(p: AiProvider, messages: ChatMsg[]): Promise<ProviderOut> {
  const url = normalizeBase(p.baseUrl) + "/chat";
  const body = {
    Messages: messages.map((m) => ({
      Content: m.content,
      Role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
    })),
    Username: p.username,
    SelectedBot: p.selectedBot,
    SelectedVersion: p.selectedVersion,
    NodeName: p.nodeName,
  };
  try {
    const raw = (await postJson(url, {}, body)) as { stringContent?: string; content?: string };
    return { text: raw?.stringContent ?? raw?.content ?? "" };
  } catch (e) {
    // Bazı backend'ler system rolünü reddeder → system'i ilk user mesajına gömüp tekrar dene.
    if (messages.some((m) => m.role === "system")) {
      const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
      const rest = messages.filter((m) => m.role !== "system");
      const merged: ChatMsg[] = rest.length
        ? [{ role: "user", content: `[SİSTEM TALİMATI]\n${sys}\n\n${rest[0].content}` }, ...rest.slice(1).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))]
        : [{ role: "user", content: sys }];
      const raw = (await postJson(url, {}, {
        ...body,
        Messages: merged.map((m) => ({ Content: m.content, Role: m.role === "assistant" ? "assistant" : "user" })),
      })) as { stringContent?: string; content?: string };
      return { text: raw?.stringContent ?? raw?.content ?? "" };
    }
    throw e;
  }
}

async function callOpenAICompatible(p: AiProvider, messages: ChatMsg[], withTools: boolean): Promise<ProviderOut> {
  const base = normalizeBase(p.baseUrl);
  const url = base.endsWith("/chat/completions") ? base : base + "/chat/completions";
  const headers: Record<string, string> = { ...p.extraHeaders };
  if (p.apiKey) headers["Authorization"] = `Bearer ${p.apiKey}`;
  if (p.type === "openrouter") {
    headers["HTTP-Referer"] = headers["HTTP-Referer"] ?? "http://localhost:3000";
    headers["X-Title"] = headers["X-Title"] ?? "LogFinder";
  }
  const raw = (await postJson(url, headers, {
    model: p.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: 0.2,
    max_tokens: 2000,
    ...(withTools ? { tools: [ES_SEARCH_TOOL], tool_choice: "auto" } : {}),
  })) as {
    choices?: { message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
    error?: { message?: string };
  };
  if (raw.error) throw new Error("AI: " + (raw.error.message ?? "bilinmeyen hata"));
  const msg = raw.choices?.[0]?.message;
  const tc = msg?.tool_calls?.find((t) => t.function?.name === "es_search");
  let toolArgs: Record<string, unknown> | undefined;
  if (tc?.function?.arguments) {
    try {
      toolArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      toolArgs = undefined;
    }
  }
  return { text: msg?.content ?? "", toolArgs };
}

async function callGemini(p: AiProvider, messages: ChatMsg[]): Promise<ProviderOut> {
  const base = normalizeBase(p.baseUrl) || "https://generativelanguage.googleapis.com";
  const url = `${base}/v1beta/models/${encodeURIComponent(p.model)}:generateContent?key=${encodeURIComponent(p.apiKey)}`;
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const raw = (await postJson(url, { ...p.extraHeaders }, {
    ...(sys ? { system_instruction: { parts: [{ text: sys }] } } : {}),
    contents,
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
  })) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
  if (raw.error) throw new Error("Gemini: " + (raw.error.message ?? "bilinmeyen hata"));
  const text = (raw.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("");
  return { text };
}

export async function callProvider(p: AiProvider, messages: ChatMsg[], withTools: boolean): Promise<ProviderOut> {
  if (p.type === "corporate") return callCorporate(p, messages);
  if (p.type === "gemini") return callGemini(p, messages);
  return callOpenAICompatible(p, messages, withTools);
}

/** <ES_QUERY>{...}</ES_QUERY> bloğunu bulup parse eder; yoksa null. */
export function extractEsQuery(text: string): Record<string, unknown> | null {
  const m = text.match(/<ES_QUERY>\s*(\{[\s\S]*?\})\s*<\/ES_QUERY>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asFilters(v: unknown): LogFilter[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 10).map((f) => {
    const o = f as Record<string, unknown>;
    return {
      id: Math.random().toString(36).slice(2, 9),
      field: String(o.field ?? ""),
      value: String(o.value ?? ""),
      exclude: o.exclude === true,
    };
  }).filter((f) => f.field && f.value);
}

const EMPTY: Orchestrated = {
  reply: "", dslPreview: "", hits: [], total: null, totalRelation: "eq",
  nextSearchAfter: null, histogram: [], dateGte: "", dateLte: "", suggestedFilters: [], queryText: "",
};

export async function testProvider(p: AiProvider): Promise<{ ok: boolean; reply: string }> {
  const out = await callProvider(p, [{ role: "user", content: "Merhaba. Sadece 'ok' yaz." }], false);
  return { ok: true, reply: out.text.slice(0, 500) || "(boş cevap)" };
}

function summarizeHits(hits: EsHit[]): string {
  return hits.slice(0, 5).map((h, i) => {
    const s = h._source as Record<string, unknown>;
    const pick = (keys: string[]) => keys.map((k) => s[k]).find((v) => v !== undefined && v !== null);
    const time = String(pick(["@timestamp", "timestamp", "time", "event_time"]) ?? "?");
    const level = String(pick(["level", "log.level", "severity", "log_level"]) ?? "-");
    const msg = String(pick(["message", "msg", "log", "error.message"]) ?? JSON.stringify(s).slice(0, 300));
    return `${i + 1}. [${time}] ${level} ${msg.slice(0, 300)}`;
  }).join("\n");
}

export async function orchestrate(
  provider: AiProvider,
  history: ChatMsg[],
  ctx: AiContext
): Promise<Orchestrated> {
  const userText = ctx.userText;
  const parsed = parseTurkishDate(userText) ?? { gte: ctx.dateGte, lte: ctx.dateLte };
  const nowIstanbul = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date());
  const system = buildSystemPrompt({
    pattern: ctx.pattern, timeField: ctx.timeField, mappingSummary: ctx.mappingSummary,
    dateGte: parsed.gte, dateLte: parsed.lte, nowIstanbul,
  });

  // 1. tur: sorguyu al
  const first = await callProvider(provider, [{ role: "system", content: system }, ...history], true);
  const q = first.toolArgs ?? extractEsQuery(first.text);
  if (!q) {
    return { ...EMPTY, reply: first.text || "(AI boş cevap döndü)", dateGte: parsed.gte, dateLte: parsed.lte };
  }

  // 2. validate + çalıştır (AI asla ham DSL yazmaz; server kurar → pagination/size garantili)
  const size = Math.min(Math.max(Math.floor(Number(q.size ?? 25) || 25), 1), 50);
  const gte = typeof q.timeGte === "string" && q.timeGte ? q.timeGte : parsed.gte;
  const lte = typeof q.timeLte === "string" && q.timeLte ? q.timeLte : parsed.lte;
  const filters = asFilters(q.filters);
  const queryText = typeof q.queryText === "string" ? q.queryText.slice(0, 500) : "";
  const searchAfter = q.nextPage === true && ctx.prevSearchAfter ? ctx.prevSearchAfter : undefined;

  const res = await searchLogs(ctx.profile, {
    index: (typeof q.index === "string" && q.index) || ctx.pattern,
    queryText, timeField: ctx.timeField, gte, lte, filters, size, searchAfter,
  });
  const hist = q.histogram === true
    ? (await histogram(ctx.profile, { index: ctx.pattern, queryText, timeField: ctx.timeField, gte, lte, filters })).buckets
    : [];

  // 3. tur: sonucu özetlet
  const totalStr = res.total === null ? "bilinmiyor" : res.totalRelation === "gte" ? `${res.total}+` : `${res.total}`;
  const followup: ChatMsg[] = [
    { role: "system", content: system },
    ...history,
    { role: "assistant", content: first.text },
    {
      role: "user",
      content: `ARA SONUCU: toplam=${totalStr} kayıt, bu sayfada ${res.hits.length} kayıt (${res.took ?? "?"}ms).\nÖrnek kayıtlar:\n${summarizeHits(res.hits) || "(kayıt yok)"}\n\nBunu Türkçe özetle. Ham JSON yapıştırma.`,
    },
  ];
  let reply = "";
  try {
    reply = (await callProvider(provider, followup, false)).text;
  } catch {
    reply = "";
  }
  if (!reply) {
    reply = res.hits.length === 0
      ? `Kayıt bulunamadı (${totalStr}). Tarih aralığını genişletmeyi veya filtreleri gevşetmeyi deneyin.`
      : `Toplam ${totalStr} kayıt bulundu, ilk ${res.hits.length} kayıt listelendi.`;
  }

  return {
    reply,
    dslPreview: JSON.stringify(res.dsl, null, 2),
    hits: res.hits,
    total: res.total,
    totalRelation: res.totalRelation,
    nextSearchAfter: res.nextSearchAfter,
    took: res.took,
    histogram: hist,
    dateGte: gte,
    dateLte: lte,
    suggestedFilters: filters,
    queryText,
  };
}
