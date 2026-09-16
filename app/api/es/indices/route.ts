import { NextResponse } from "next/server";
import { catIndices } from "@/lib/es-server";
import type { EsProfile } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { profile } = (await req.json()) as { profile: EsProfile };
    if (!profile?.esUrl) return NextResponse.json({ error: "Profil eksik" }, { status: 400 });
    const indices = await catIndices(profile);
    return NextResponse.json({ indices });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
