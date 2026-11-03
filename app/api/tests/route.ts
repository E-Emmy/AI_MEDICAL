import { NextResponse } from "next/server";
import { listTests } from "@/lib/modelServer";

export async function GET() {
  try {
    const { status, body } = await listTests();
    if (status !== 200) throw new Error(`status ${status}`);
    return NextResponse.json(body);
  } catch (e) {
    console.error("Listing tests failed:", e);
    return NextResponse.json(
      { error: "The model server isn't running. Start it with `.venv/bin/python server.py` in the model-server folder." },
      { status: 503 }
    );
  }
}
