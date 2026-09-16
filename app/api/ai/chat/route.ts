import { NextResponse } from "next/server";
import { orchestrate, type ChatMsg } from "@/lib/ai-server";
import type { AiProvider, EsProfile } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      provider: AiProvider;
      messages: ChatMsg[];
      context: {
        profile: EsProfile;
        pattern: string;
        timeField: string;
        mappingSummary: string;
        dateGte: string;
        dateLte: string;
        userText: string;
        prevSearchAfter?: unknown[] | null;
      };
    };
    if (!body.provider || !body.context?.profile?.esUrl) {
      return NextResponse.json({ error: "Sağlayıcı/profil eksik" }, { status: 400 });
    }
    const res = await orchestrate(body.provider, body.messages ?? [], {
      profile: body.context.profile,
      pattern: body.context.pattern,
      timeField: body.context.timeField,
      mappingSummary: body.context.mappingSummary ?? "",
      dateGte: body.context.dateGte,
      dateLte: body.context.dateLte,
      userText: body.context.userText ?? "",
      prevSearchAfter: body.context.prevSearchAfter ?? null,
    });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
