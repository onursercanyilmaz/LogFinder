import { NextResponse } from "next/server";
import { fieldCaps } from "@/lib/es-server";
import type { EsProfile } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { profile, index } = (await req.json()) as { profile: EsProfile; index: string };
    if (!profile?.esUrl || !index) return NextResponse.json({ error: "Profil/index eksik" }, { status: 400 });
    const fields = await fieldCaps(profile, index);
    const dateFields = fields.filter((f) => f.type === "date").map((f) => f.name);
    return NextResponse.json({ fields, dateFields });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
