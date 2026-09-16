// Türkçe tarih preset'leri + chat'ten tarih algılama.
// İstanbul'da DST yok (sabit UTC+3), o yüzden offset sabit alınır.

export const ISTANBUL_OFFSET_MS = 3 * 3600 * 1000;

export interface Range {
  gte: string;
  lte: string;
}

export function resolvePreset(preset: string, now: Date = new Date()): Range {
  const t = now.getTime();
  const min = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  switch (preset) {
    case "son15dk":
      return { gte: new Date(t - 15 * min).toISOString(), lte: now.toISOString() };
    case "son1saat":
      return { gte: new Date(t - hour).toISOString(), lte: now.toISOString() };
    case "son4saat":
      return { gte: new Date(t - 4 * hour).toISOString(), lte: now.toISOString() };
    case "son24saat":
      return { gte: new Date(t - 24 * hour).toISOString(), lte: now.toISOString() };
    case "son7gun":
      return { gte: new Date(t - 7 * day).toISOString(), lte: now.toISOString() };
    case "son30gun":
      return { gte: new Date(t - 30 * day).toISOString(), lte: now.toISOString() };
    case "bugun": {
      const wall = new Date(t + ISTANBUL_OFFSET_MS);
      const start = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - ISTANBUL_OFFSET_MS;
      return { gte: new Date(start).toISOString(), lte: now.toISOString() };
    }
    case "dun": {
      const wall = new Date(t + ISTANBUL_OFFSET_MS);
      const start = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - ISTANBUL_OFFSET_MS;
      return { gte: new Date(start - day).toISOString(), lte: new Date(start).toISOString() };
    }
    default:
      return { gte: new Date(t - hour).toISOString(), lte: now.toISOString() };
  }
}

export const PRESETS: { id: string; label: string }[] = [
  { id: "son15dk", label: "Son 15 dk" },
  { id: "son1saat", label: "Son 1 saat" },
  { id: "son4saat", label: "Son 4 saat" },
  { id: "son24saat", label: "Son 24 saat" },
  { id: "son7gun", label: "Son 7 gün" },
  { id: "son30gun", label: "Son 30 gün" },
  { id: "bugun", label: "Bugün" },
  { id: "dun", label: "Dün" },
  { id: "ozel", label: "Özel..." },
];

const TR_MONTHS: Record<string, number> = {
  ocak: 0, şubat: 1, subat: 1, mart: 2, nisan: 3, mayıs: 4, mayis: 4,
  haziran: 5, temmuz: 6, ağustos: 7, agustos: 7, eylül: 8, eylul: 8,
  ekim: 9, kasım: 10, kasim: 10, aralık: 11, aralik: 11,
};

const NUM_WORDS: Record<string, number> = {
  bir: 1, iki: 2, üç: 3, uc: 3, dört: 4, dort: 4, beş: 5, bes: 5,
  altı: 6, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
};

function num(s: string): number | null {
  const n = parseInt(s, 10);
  if (!Number.isNaN(n)) return n;
  return NUM_WORDS[s.toLocaleLowerCase("tr")] ?? null;
}

/**
 * Chat cümlesinden tarih aralığı çıkarır. Bulamazsa null döner.
 * Desteklenenler: "son 15 dakika/saat/gün/hafta", "bugün", "dün",
 * "10.09.2026 14:00 - 10.09.2026 16:00", "2026-09-10 ...", "12 Eylül 14:00-16:00".
 */
export function parseTurkishDate(text: string, now: Date = new Date()): Range | null {
  const t = text.toLocaleLowerCase("tr-TR");
  const ms = now.getTime();

  // son N <birim>
  const rel = t.match(/son\s+(\d+|bir|iki|üç|uc|dört|dort|beş|bes|altı|alti|yedi|sekiz|dokuz|on)\s*(dakika|dk|saat|g[üu]n|hafta)/);
  if (rel) {
    const n = num(rel[1]);
    if (n !== null && n > 0 && n < 10000) {
      const unit = rel[2];
      const mult = unit.startsWith("dak") || unit === "dk" ? 60_000 : unit.startsWith("saat") ? 3_600_000 : unit.startsWith("hafta") ? 7 * 86_400_000 : 86_400_000;
      return { gte: new Date(ms - n * mult).toISOString(), lte: now.toISOString() };
    }
  }

  if (/\bbug[üu]n\b/.test(t) && !/\bd[üu]n\b/.test(t)) {
    return resolvePreset("bugun", now);
  }
  if (/\bd[üu]n\b/.test(t)) {
    return resolvePreset("dun", now);
  }

  // DD.MM.YYYY [HH:MM] [- DD.MM.YYYY [HH:MM]]
  const dm = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*(?:-|–|—|ile|arası|arasi)?\s*(\d{1,2})?\.?(\d{1,2})?\.?(\d{4})?(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dm && dm[0].trim().length > 5) {
    const y1 = +dm[3], m1 = +dm[2] - 1, d1 = +dm[1];
    const h1 = dm[4] ? +dm[4] : 0, mi1 = dm[5] ? +dm[5] : 0;
    const start = Date.UTC(y1, m1, d1, h1, mi1) - ISTANBUL_OFFSET_MS;
    let end: number;
    if (dm[6]) {
      const y2 = dm[8] ? +dm[8] : y1, m2 = dm[7] ? +dm[7] - 1 : m1;
      const h2 = dm[9] ? +dm[9] : 23, mi2 = dm[10] ? +dm[10] : 59;
      end = Date.UTC(y2, m2, +dm[6], h2, mi2) - ISTANBUL_OFFSET_MS;
    } else if (dm[4]) {
      end = start + 3_600_000;
    } else {
      end = start + 86_400_000;
    }
    if (end > start && start > 0) return { gte: new Date(start).toISOString(), lte: new Date(end).toISOString() };
  }

  // YYYY-MM-DD [HH:MM] [- ...]
  const iso = text.match(/(20\d{2})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?\s*(?:-|–|—)?\s*(?:(20\d{2})-(\d{1,2})-(\d{1,2}))?(?:[T\s]+(\d{1,2}):(\d{2}))?/);
  if (iso) {
    const start = Date.UTC(+iso[1], +iso[2] - 1, +iso[3], iso[4] ? +iso[4] : 0, iso[5] ? +iso[5] : 0) - ISTANBUL_OFFSET_MS;
    let end: number;
    if (iso[6]) {
      end = Date.UTC(+iso[6], +iso[7] - 1, +iso[8], iso[9] ? +iso[9] : 23, iso[10] ? +iso[10] : 59) - ISTANBUL_OFFSET_MS;
    } else if (iso[4]) {
      end = start + 3_600_000;
    } else {
      end = start + 86_400_000;
    }
    if (end > start) return { gte: new Date(start).toISOString(), lte: new Date(end).toISOString() };
  }

  // "12 Eylül [2026] [14:00] [- 16:00]"
  const trm = t.match(/(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s+(20\d{2}))?(?:\s+(\d{1,2}):(\d{2}))?\s*(?:-|–|—)?\s*(?:(\d{1,2}):(\d{2}))?/);
  if (trm) {
    const year = trm[3] ? +trm[3] : new Date(ms + ISTANBUL_OFFSET_MS).getUTCFullYear();
    const h1 = trm[4] ? +trm[4] : 0, mi1 = trm[5] ? +trm[5] : 0;
    const start = Date.UTC(year, TR_MONTHS[trm[2]], +trm[1], h1, mi1) - ISTANBUL_OFFSET_MS;
    let end: number;
    if (trm[6]) {
      end = Date.UTC(year, TR_MONTHS[trm[2]], +trm[1], +trm[6], trm[7] ? +trm[7] : 0) - ISTANBUL_OFFSET_MS;
    } else if (trm[4]) {
      end = start + 3_600_000;
    } else {
      end = start + 86_400_000;
    }
    if (end > start) return { gte: new Date(start).toISOString(), lte: new Date(end).toISOString() };
  }

  return null;
}

/** ISO → "16.09.2026 14:32" (İstanbul). */
export function formatTR(iso: string | number): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      timeZone: "Europe/Istanbul",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}
