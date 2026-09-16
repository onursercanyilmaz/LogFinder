"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiProvider, ChatMessage, ChatSession, DataView, EsHit, EsProfile, FieldInfo, LogFilter } from "./types";
import type { ThemeMode } from "./theme";

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

const DEFAULT_PROFILE: EsProfile = {
  id: "default",
  name: "Varsayılan Profil",
  esUrl: "",
  authType: "basic",
  username: "",
  password: "",
  apiKey: "",
  insecure: true,
  defaultPattern: "",
  timeField: "@timestamp",
};

/** Kayıtlı view yokken kullanılan boş görünüm (değerler env'den dolar). */
const BLANK_VIEW: DataView = {
  id: "",
  profileId: "",
  title: "",
  pattern: "",
  timeField: "@timestamp",
  visibleFields: ["@timestamp", "level", "message"],
};

const CORPORATE_AI: AiProvider = {
  id: "ai-corporate",
  name: "Kurumsal AI",
  type: "corporate",
  baseUrl: "",
  apiKey: "",
  model: "",
  username: "",
  selectedBot: "",
  selectedVersion: "",
  nodeName: "",
  extraHeaders: {},
};

const OPENAI: AiProvider = {
  id: "ai-openai", name: "OpenAI", type: "openai",
  baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini",
  username: "", selectedBot: "", selectedVersion: "", nodeName: "", extraHeaders: {},
};

const OPENROUTER: AiProvider = {
  id: "ai-openrouter", name: "OpenRouter", type: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1", apiKey: "", model: "anthropic/claude-sonnet-4",
  username: "", selectedBot: "", selectedVersion: "", nodeName: "", extraHeaders: {},
};

const GEMINI: AiProvider = {
  id: "ai-gemini", name: "Gemini", type: "gemini",
  baseUrl: "", apiKey: "", model: "gemini-2.0-flash",
  username: "", selectedBot: "", selectedVersion: "", nodeName: "", extraHeaders: {},
};

interface Store {
  profiles: EsProfile[];
  activeProfileId: string;
  dataViews: DataView[];
  activeDataViewId: string;
  aiProviders: AiProvider[];
  activeAiId: string;

  queryText: string;
  preset: string;
  customGte: string;
  customLte: string;
  filters: LogFilter[];
  pageSize: number;

  hits: EsHit[];
  total: number | null;
  totalRelation: string;
  searchAfterStack: (unknown[] | null)[];
  page: number;
  dslPreview: string;
  lastTook?: number;
  lastError: string;
  searched: boolean;

  fields: FieldInfo[];
  mappingSummary: string;

  chat: ChatMessage[];
  sessions: ChatSession[];
  activeSessionId: string;
  settingsOpen: boolean;
  busy: boolean;
  /** Chat "tabloya uygula" dediğinde Explorer'ı tetikler. */
  searchNonce: number;
  theme: ThemeMode;

  set: (p: Partial<Store>) => void;
  upsertProfile: (p: EsProfile) => void;
  removeProfile: (id: string) => void;
  upsertDataView: (d: DataView) => void;
  upsertAi: (a: AiProvider) => void;
  removeAi: (id: string) => void;
  activeProfile: () => EsProfile;
  activeDataView: () => DataView;
  activeAi: () => AiProvider;
  resetPaging: () => void;
  /** Aktif oturumu döner (yoksa null). */
  activeSession: () => ChatSession | null;
  /** Aktif oturum yoksa açar, id döner. */
  ensureSession: () => string;
  pushSessionMessage: (msg: ChatMessage) => void;
  patchSession: (id: string, p: Partial<ChatSession>) => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      profiles: [DEFAULT_PROFILE],
      activeProfileId: "default",
      dataViews: [],
      activeDataViewId: "",
      aiProviders: [CORPORATE_AI, OPENAI, OPENROUTER, GEMINI],
      activeAiId: "ai-corporate",

      queryText: "",
      preset: "son15dk",
      customGte: "",
      customLte: "",
      filters: [],
      pageSize: 10,

      hits: [],
      total: null,
      totalRelation: "eq",
      searchAfterStack: [null],
      page: 0,
      dslPreview: "",
      lastTook: undefined,
      lastError: "",
      searched: false,

      fields: [],
      mappingSummary: "",

      chat: [],
      sessions: [],
      activeSessionId: "",
      settingsOpen: false,
      busy: false,
      searchNonce: 0,
      theme: "system",

      set: (p) => set(p),
      upsertProfile: (p) =>
        set((s) => ({
          profiles: s.profiles.some((x) => x.id === p.id)
            ? s.profiles.map((x) => (x.id === p.id ? p : x))
            : [...s.profiles, p],
        })),
      removeProfile: (id) =>
        set((s) => {
          const profiles = s.profiles.filter((x) => x.id !== id);
          if (profiles.length === 0) return s;
          return {
            profiles,
            activeProfileId: s.activeProfileId === id ? profiles[0].id : s.activeProfileId,
          };
        }),
      upsertDataView: (d) =>
        set((s) => ({
          dataViews: s.dataViews.some((x) => x.id === d.id)
            ? s.dataViews.map((x) => (x.id === d.id ? d : x))
            : [...s.dataViews, d],
        })),
      upsertAi: (a) =>
        set((s) => ({
          aiProviders: s.aiProviders.some((x) => x.id === a.id)
            ? s.aiProviders.map((x) => (x.id === a.id ? a : x))
            : [...s.aiProviders, a],
        })),
      removeAi: (id) =>
        set((s) => {
          const aiProviders = s.aiProviders.filter((x) => x.id !== id);
          if (aiProviders.length === 0) return s;
          return {
            aiProviders,
            activeAiId: s.activeAiId === id ? aiProviders[0].id : s.activeAiId,
          };
        }),
      activeProfile: () => {
        const s = get();
        return s.profiles.find((x) => x.id === s.activeProfileId) ?? s.profiles[0] ?? DEFAULT_PROFILE;
      },
      activeDataView: () => {
        const s = get();
        return s.dataViews.find((x) => x.id === s.activeDataViewId) ?? s.dataViews[0] ?? BLANK_VIEW;
      },
      activeAi: () => {
        const s = get();
        return s.aiProviders.find((x) => x.id === s.activeAiId) ?? s.aiProviders[0] ?? CORPORATE_AI;
      },
      resetPaging: () => set({ searchAfterStack: [null], page: 0 }),
      activeSession: () => {
        const s = get();
        return s.sessions.find((x) => x.id === s.activeSessionId) ?? null;
      },
      ensureSession: () => {
        const s = get();
        const existing = s.sessions.find((x) => x.id === s.activeSessionId);
        if (existing) return existing.id;
        const now = Date.now();
        const sess: ChatSession = {
          id: uid(), title: "Yeni sohbet", messages: [],
          prevSearchAfter: null, createdAt: now, updatedAt: now,
        };
        // En fazla 20 oturum tutulur.
        const sessions = [...s.sessions, sess].slice(-20);
        set({ sessions, activeSessionId: sess.id });
        return sess.id;
      },
      pushSessionMessage: (msg) =>
        set((s) => {
          const sid = s.sessions.some((x) => x.id === s.activeSessionId)
            ? s.activeSessionId
            : s.sessions[0]?.id;
          if (!sid) return s;
          return {
            sessions: s.sessions.map((x) => {
              if (x.id !== sid) return x;
              const messages = [...x.messages, msg].slice(-120);
              const title =
                x.messages.length === 0 && msg.role === "user"
                  ? msg.content.slice(0, 42) + (msg.content.length > 42 ? "…" : "")
                  : x.title;
              return { ...x, messages, title, updatedAt: Date.now() };
            }),
            activeSessionId: sid,
          };
        }),
      patchSession: (id, p) =>
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...p, updatedAt: Date.now() } : x)),
        })),
      selectSession: (id) => set({ activeSessionId: id }),
      deleteSession: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((x) => x.id !== id);
          const activeSessionId = s.activeSessionId === id ? (sessions[0]?.id ?? "") : s.activeSessionId;
          return { sessions, activeSessionId };
        }),
    }),
    {
      name: "logfinder-v1",
      version: 5,
      // v5: bilinmeyen eski sağlayıcı tipleri "corporate" olur; sabit view tohumları
      // kalkar (env'den dolar). Eski literal'ler koda gömülmez, jenerik eşleşme yapılır.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as {
          aiProviders?: AiProvider[];
          activeAiId?: string;
          chat?: ChatMessage[];
          sessions?: ChatSession[];
          activeSessionId?: string;
        };
        const KNOWN_AI_TYPES = ["corporate", "openai", "openrouter", "gemini", "custom"];
        const aiProviders = (Array.isArray(p.aiProviders) ? p.aiProviders : []).map((a) =>
          KNOWN_AI_TYPES.includes(a.type as string) ? a : { ...a, type: "corporate" as AiProvider["type"] }
        );
        const activeAiId = p.activeAiId ?? "ai-corporate";
        // v4: eski tekil chat'i ilk oturum yap (atlamalı güncelleyenler için korunur)
        let sessions = Array.isArray(p.sessions) ? [...p.sessions] : [];
        if (sessions.length === 0 && Array.isArray(p.chat) && p.chat.length > 0) {
          const now = Date.now();
          sessions = [{
            id: uid(), title: "Önceki sohbet", messages: p.chat.slice(-120),
            prevSearchAfter: null, createdAt: now, updatedAt: now,
          }];
        }
        const activeSessionId = sessions.some((x) => x.id === p.activeSessionId)
          ? (p.activeSessionId as string)
          : (sessions[0]?.id ?? "");
        const { chat: _dropped, ...rest } = p as Record<string, unknown>;
        void _dropped;
        return { ...rest, aiProviders, activeAiId, preset: "son15dk", pageSize: 10, sessions, activeSessionId };
      },
      partialize: (s) => ({
        profiles: s.profiles,
        activeProfileId: s.activeProfileId,
        dataViews: s.dataViews,
        activeDataViewId: s.activeDataViewId,
        aiProviders: s.aiProviders,
        activeAiId: s.activeAiId,
        queryText: s.queryText,
        preset: s.preset,
        customGte: s.customGte,
        customLte: s.customLte,
        filters: s.filters,
        pageSize: s.pageSize,
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        theme: s.theme,
      }),
    }
  )
);
