import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { viewUrl } from "@/lib/r2";
import { runSeries } from "@/lib/modelServer";
import { findSeriesSample } from "@/lib/seriesSamples";
import { SERIES_TEST } from "@/lib/seriesResults";

// A whole scan takes far longer than one image: downloading it, then every slice through the model.
export const maxDuration = 300;

// Analyses one of your full scans (and saves the results to it), or a sample (results are returned only).
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // Runs as the signed-in user, so RLS only finds their own scans.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return NextResponse.json({ error: "Choose a scan to analyse." }, { status: 400 });
  const sample = findSeriesSample(id);
  let kind: string, key: string;
  if (sample) {
    ({ kind, key } = sample);
  } else {
    const { data, error } = await sb.from("series").select("kind,object_key").eq("id", id).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "This full scan doesn't exist, or it isn't yours." }, { status: 404 });
    ({ kind, object_key: key } = data);
  }
  if (!SERIES_TEST[kind]) {
    return NextResponse.json({ error: "Full-scan analysis is only available for brain MRI and chest CT so far." }, { status: 400 });
  }

  let reply;
  try {
    reply = await runSeries(kind, await viewUrl(key));
  } catch {
    return NextResponse.json({ error: "The model server isn't running. Start it, then try again." }, { status: 503 });
  }
  if (reply.status !== 200) {
    return NextResponse.json({ error: reply.body?.error ?? "The analysis failed." }, { status: 502 });
  }
  const results = { ...reply.body, analysed_at: new Date().toISOString() };
  if (!sample) {
    const { error } = await sb.from("series").update({ results }).eq("id", id);
    if (error) return NextResponse.json({ error: `The results couldn't be saved: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ results });
}
