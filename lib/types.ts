// Ortak tipler — client + server'da kullanılır.

export type EsAuthType = "basic" | "apiKey";

export interface EsProfile {
  id: string;
  name: string;
  esUrl: string;
  authType: EsAuthType;
  username: string;
  /** BYOK: sadece tarayıcıda saklanır, repoya asla gömülmez. */
  password: string;
  apiKey: string;
  /** Self-signed/internal CA için (sadece Next→ES yönünde geçerli). */
  insecure: boolean;
  defaultPattern: string;
  timeField: string;
}

export type AiProviderType = "corporate" | "openai" | "openrouter" | "gemini" | "custom";

export interface AiProvider {
  id: string;
  name: string;
  type: AiProviderType;
  /** Kurumsal AI: https://host (sonuna /chat eklenir). Diğerleri: OpenAI-uyumlu base URL. Gemini: boşsa Google default. */
  baseUrl: string;
  /** BYOK: sadece tarayıcıda saklanır. Kurumsal AI'da kullanılmaz. */
  apiKey: string;
  /** openai/openrouter/custom/gemini model adı. */
  model: string;
  // --- Kurumsal AI alanları ---
  username: string;
  selectedBot: string;
  selectedVersion: string;
  nodeName: string;
  extraHeaders: Record<string, string>;
}

export interface DataView {
  id: string;
  profileId: string;
  title: string;
  pattern: string;
  timeField: string;
  visibleFields: string[];
}

export interface LogFilter {
  id: string;
  field: string;
  value: string;
  exclude: boolean;
}

export interface FieldInfo {
  name: string;
  type: string;
  searchable: boolean;
  aggregatable: boolean;
}

export interface EsHit {
  _index: string;
  _id: string;
  sort?: unknown[];
  _source: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  dslPreview?: string;
  hits?: number;
  createdAt: number;
  /** Tabloya uygula için gereken özet (oturumlar arası kalıcı, ham hitler saklanmaz). */
  apply?: {
    queryText: string;
    filters: LogFilter[];
    dateGte: string;
    dateLte: string;
    dslPreview: string;
    total: number | null;
    totalRelation: string;
    hitCount: number;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  /** "devam/sonraki sayfa" için oturumun son arama anahtarı. */
  prevSearchAfter: unknown[] | null;
  createdAt: number;
  updatedAt: number;
}

export interface AiSearchResult {
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

export interface DateRange {
  gte: string;
  lte: string;
  label: string;
}
