import { NextResponse } from "next/server";
import { testProvider } from "@/lib/ai-server";
import type { AiProvider } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { provider } = (await req.json()) as { provider: AiProvider };
    if (!provider) return NextResponse.json({ error: "Sağlayıcı eksik" }, { status: 400 });
    const res = await testProvider(provider);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
