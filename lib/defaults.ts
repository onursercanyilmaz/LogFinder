"use client";

import { uid, useStore } from "./store";
import type { EsProfile } from "./types";

export interface EnvDefaults {
  es: {
    url: string;
    username: string;
    hasPassword: boolean;
    password: string;
    defaultPattern: string;
    timeField: string;
  };
  ai: {
    baseUrl: string;
    username: string;
    nodeName: string;
    bot: string;
    version: string;
  };
  views: string[];
  timeField: string;
}

let cached: EnvDefaults | null | undefined;

async function fetchEnvDefaults(): Promise<EnvDefaults | null> {
  if (cached !== undefined) return cached;
  try {
    const res = await fetch("/api/es/defaults", { cache: "no-store" });
    if (!res.ok) {
      cached = null;
      return null;
    }
    cached = (await res.json()) as EnvDefaults;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

// .env.local'deki varsayılanları (ES + kurumsal AI + view tohumları) alıp
// BOŞ alanlara doldurur. Kullanıcının kendi girdiği değerlerin üzerine ASLA yazmaz.
export async function ensureEnvDefaults(): Promise<void> {
  const d = await fetchEnvDefaults();
  if (!d) return;
  const st = useStore.getState();

  // 1) ES profili
  const pf = st.activeProfile();
  if (!pf.esUrl || passwordMissing(pf)) {
    st.upsertProfile({
      ...pf,
      esUrl: pf.esUrl || d.es.url,
      username: pf.username || d.es.username,
      password: pf.password || d.es.password,
      defaultPattern: pf.defaultPattern || d.es.defaultPattern,
      timeField: pf.timeField || d.es.timeField,
    });
  }

  // 2) Kurumsal AI sağlayıcı
  const cur = useStore.getState();
  const corp = cur.aiProviders.find((a) => a.type === "corporate");
  if (corp && (!corp.baseUrl || !corp.selectedBot)) {
    cur.upsertAi({
      ...corp,
      baseUrl: corp.baseUrl || d.ai.baseUrl,
      username: corp.username || d.ai.username,
      nodeName: corp.nodeName || d.ai.nodeName,
      selectedBot: corp.selectedBot || d.ai.bot,
      selectedVersion: corp.selectedVersion || d.ai.version,
    });
  }

  // 3) View tohumları
  const cur2 = useStore.getState();
  const prof = cur2.activeProfile();
  for (const pattern of d.views) {
    if (!cur2.dataViews.some((v) => v.profileId === prof.id && v.pattern === pattern)) {
      cur2.upsertDataView({
        id: uid(),
        profileId: prof.id,
        title: pattern,
        pattern,
        timeField: d.timeField || "@timestamp",
        visibleFields: ["@timestamp", "level", "message"],
      });
    }
  }

  // 4) Aktif view boştaysa ilk geçerli view'e düş
  const cur3 = useStore.getState();
  if (!cur3.dataViews.some((v) => v.id === cur3.activeDataViewId) && cur3.dataViews.length > 0) {
    const own = cur3.dataViews.find((v) => v.profileId === cur3.activeProfileId);
    cur3.set({ activeDataViewId: own?.id ?? cur3.dataViews[0].id });
  }
}

/** Profilde kimlik bilgisi eksik mi? */
export function passwordMissing(p: EsProfile): boolean {
  return p.authType === "basic" ? !p.password : !p.apiKey;
}

/** Aktif profilin şifresi boşsa varsayılanı doldurup güncel profili döner. */
export async function ensureActiveProfilePassword(): Promise<EsProfile> {
  await ensureEnvDefaults();
  return useStore.getState().activeProfile();
}

export function passwordError(p: EsProfile): string {
  return `Elastic kimlik bilgisi yok (${p.name} profili). Ayarlar → Elasticsearch bölümünden girin ya da .env.local dosyasına ekleyin.`;
}
