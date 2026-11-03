import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalise, type Region } from "@/lib/hf";
import { runTest, type ModelServerReply } from "@/lib/modelServer";
import { findSample } from "@/lib/samples";

export const maxDuration = 60;

const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 120) : undefined);

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Every Supabase call below runs as the signed-in user, so RLS applies.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { imagePath, dicomPath, testId, sampleId, caseId, dicom } = await req.json();
  // Only known sample ids are kept, so the stored "known answer" can't be made up by the client.
  const found = findSample(sampleId);
  const sample = found ? { id: found.id, truth: found.truth, source: found.source, url: found.url } : undefined;
  if (typeof imagePath !== "string" || !imagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid image path" }, { status: 403 });
  }
  if (typeof testId !== "string" || !/^[a-z0-9-]+$/.test(testId)) {
    return NextResponse.json({ error: "Choose a test before analysing." }, { status: 400 });
  }

  // RLS only shows your own cases, so this also stops filing a scan under someone else's case.
  if (caseId != null) {
    const { data: found } = await sb.from("cases").select("id").eq("id", caseId).maybeSingle();
    if (!found) return NextResponse.json({ error: "That case doesn't exist. Choose another case or none." }, { status: 400 });
  }
  // Only plain header facts are kept; readDicom never returns identifying fields.
  const dicomInfo = dicom && typeof dicom === "object" ? {
    modality: str(dicom.modality), bodyPart: str(dicom.bodyPart), description: str(dicom.description),
    manufacturer: str(dicom.manufacturer), rows: Number(dicom.rows) || 0, cols: Number(dicom.cols) || 0,
    frames: Number(dicom.frames) || 1, frame: Number(dicom.frame) || 0,
    sliceThickness: Number(dicom.sliceThickness) || undefined, pixelSpacing: str(dicom.pixelSpacing),
    window: dicom.window && isFinite(dicom.window.center) && isFinite(dicom.window.width)
      ? { center: Number(dicom.window.center), width: Number(dicom.window.width) } : undefined,
  } : undefined;

  const { data: file, error: dlErr } = await sb.storage.from("scans").download(imagePath);
  if (dlErr || !file) return NextResponse.json({ error: "Could not read the uploaded image" }, { status: 404 });

  let reply: ModelServerReply;
  try {
    reply = await runTest(testId, file);
  } catch {
    return NextResponse.json({ error: "The model server isn't running. Start it, then try again." }, { status: 503 });
  }
  const { status, body } = reply;
  // 422 means the scan-type check rejected the image; pass its explanation through.
  if (status === 422) return NextResponse.json({ error: body.error, scanCheck: body.scan_check }, { status: 422 });
  if (status !== 200) return NextResponse.json({ error: body.error ?? "The model request failed." }, { status: 502 });

  // One row per test, all pointing at the same image. `raw` keeps the test and scan-type check,
  // so no schema change is needed.
  const rows = (body.results as { model: string; predictions: unknown; regions?: Region[] }[]).map((result) => {
    const { predictions, regions: found } = normalise(result.predictions);
    // A grid of slices comes back with a box around each slice that showed a finding.
    const regions = [...found, ...(result.regions ?? [])];
    return {
      image_path: imagePath,
      dicom_path: dicomPath ?? null,
      // Left out when unset, so analysing still works before migration 003 adds the column.
      ...(caseId ? { case_id: caseId } : {}),
      model: result.model ?? "unknown",
      top_label: predictions[0]?.label ?? null,
      top_score: predictions[0]?.score ?? null,
      predictions,
      regions,
      raw: { ...result, scan_check: body.scan_check, sample, dicom: dicomInfo },
    };
  });

  const { data, error } = await sb.from("analyses").insert(rows).select("id");
  if (error || !data?.length) return NextResponse.json({ error: error?.message ?? "The results couldn't be saved." }, { status: 500 });
  return NextResponse.json({ id: data[0].id });
}
