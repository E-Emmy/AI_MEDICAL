import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalise, type Region } from "@/lib/hf";
import { modelServerUrl } from "@/lib/tests";
import { findSample } from "@/lib/samples";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Every Supabase call below runs as the signed-in user, so RLS applies.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { imagePath, dicomPath, testId, sampleId } = await req.json();
  // Only known sample ids are kept, so the stored "known answer" can't be made up by the client.
  const found = findSample(sampleId);
  const sample = found ? { id: found.id, truth: found.truth, source: found.source, url: found.url } : undefined;
  if (typeof imagePath !== "string" || !imagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid image path" }, { status: 403 });
  }
  if (typeof testId !== "string" || !/^[a-z0-9-]+$/.test(testId)) {
    return NextResponse.json({ error: "Choose a test before analysing." }, { status: 400 });
  }

  const { data: file, error: dlErr } = await sb.storage.from("scans").download(imagePath);
  if (dlErr || !file) return NextResponse.json({ error: "Could not read the uploaded image" }, { status: 404 });

  let res: Response;
  try {
    res = await fetch(`${modelServerUrl()}/tests/${testId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.HF_TOKEN ?? ""}`, "Content-Type": "image/png" },
      body: Buffer.from(await file.arrayBuffer()),
    });
  } catch {
    return NextResponse.json({ error: "The model server isn't running. Start it, then try again." }, { status: 503 });
  }
  const body = await res.json();
  // 422 means the scan-type check rejected the image; pass its explanation through.
  if (res.status === 422) return NextResponse.json({ error: body.error, scanCheck: body.scan_check }, { status: 422 });
  if (!res.ok) return NextResponse.json({ error: body.error ?? "The model request failed." }, { status: 502 });

  // One row per test, all pointing at the same image. `raw` keeps the test and scan-type check,
  // so no schema change is needed.
  const rows = (body.results as { model: string; predictions: unknown; regions?: Region[] }[]).map((result) => {
    const { predictions, regions: found } = normalise(result.predictions);
    // A grid of slices comes back with a box around each slice that showed a finding.
    const regions = [...found, ...(result.regions ?? [])];
    return {
      image_path: imagePath,
      dicom_path: dicomPath ?? null,
      model: result.model ?? "unknown",
      top_label: predictions[0]?.label ?? null,
      top_score: predictions[0]?.score ?? null,
      predictions,
      regions,
      raw: { ...result, scan_check: body.scan_check, sample },
    };
  });

  const { data, error } = await sb.from("analyses").insert(rows).select("id");
  if (error || !data?.length) return NextResponse.json({ error: error?.message ?? "The results couldn't be saved." }, { status: 500 });
  return NextResponse.json({ id: data[0].id });
}
