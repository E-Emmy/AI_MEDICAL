import { NextResponse } from "next/server";
import { modelServerUrl } from "@/lib/tests";

export async function GET() {
  try {
    const res = await fetch(`${modelServerUrl()}/tests`, { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(
      { error: "The model server isn't running. Start it with `.venv/bin/python server.py` in the model-server folder." },
      { status: 503 }
    );
  }
}
