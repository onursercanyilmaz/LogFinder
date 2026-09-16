import { NextResponse } from "next/server";
import { searchLogs } from "@/lib/es-server";
import type { EsProfile, LogFilter } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      profile: EsProfile;
      index: string;
      queryText?: string;
      timeField?: string;
      gte?: string;
      lte?: string;
      filters?: LogFilter[];
      size?: number;
      searchAfter?: unknown[] | null;
    };
    if (!body.profile?.esUrl || !body.index) {
      return NextResponse.json({ error: "Profil/index eksik" }, { status: 400 });
    }
    const res = await searchLogs(body.profile, {
      index: body.index,
      queryText: body.queryText ?? "",
      timeField: body.timeField || "@timestamp",
      gte: body.gte,
      lte: body.lte,
      filters: body.filters ?? [],
      size: body.size,
      searchAfter: body.searchAfter ?? undefined,
    });
    return NextResponse.json({
      hits: res.hits,
      total: res.total,
      totalRelation: res.totalRelation,
      nextSearchAfter: res.nextSearchAfter,
      took: res.took,
      dsl: res.dsl,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
