import { NextResponse } from "next/server";

// Sunucudaki .env.local'den TÜM varsayılanları verir (ES + kurumsal AI + view tohumları).
// Değerler BUNDLE'a gömülmez; sadece bu local uygulamanın tarayıcısına, ilk açılışta verilir.
// Anahtar adları jeneriktir, şirket bilgisi içermez.
export async function GET() {
  const views = (process.env.DEFAULT_VIEW_PATTERNS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const timeField = process.env.DEFAULT_TIME_FIELD ?? "@timestamp";
  return NextResponse.json({
    es: {
      url: process.env.ELASTIC_URL ?? "",
      username: process.env.ELASTIC_USERNAME ?? "",
      hasPassword: Boolean(process.env.ELASTIC_PASSWORD),
      password: process.env.ELASTIC_PASSWORD ?? "",
      defaultPattern: process.env.ELASTIC_PATTERN ?? views[0] ?? "",
      timeField: process.env.ELASTIC_TIME_FIELD ?? timeField,
    },
    ai: {
      baseUrl: process.env.AI_BASE_URL ?? "",
      username: process.env.AI_USERNAME ?? "",
      nodeName: process.env.AI_NODE_NAME ?? "",
      bot: process.env.AI_BOT ?? "",
      version: process.env.AI_VERSION ?? "",
    },
    views,
    timeField,
  });
}
