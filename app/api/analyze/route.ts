import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalise } from "@/lib/hf";

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

  const { imagePath, dicomPath } = await req.json();
  if (typeof imagePath !== "string" || !imagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid image path" }, { status: 403 });
  }

  const { data: file, error: dlErr } = await sb.storage.from("scans").download(imagePath);
  if (dlErr || !file) return NextResponse.json({ error: "Could not read the uploaded image" }, { status: 404 });

  const hf = await fetch(process.env.HF_MODEL_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, "Content-Type": "image/png" },
    body: Buffer.from(await file.arrayBuffer()),
  });
  if (!hf.ok) {
    const detail = await hf.text();
    const loading = hf.status === 503;
    return NextResponse.json(
      { error: loading ? "The model is warming up. Try again in a minute." : "The model request failed.", detail },
      { status: 502 }
    );
  }
  const raw = await hf.json();
  const { predictions, regions } = normalise(raw);
  const top = predictions[0];

  const { data, error } = await sb
    .from("analyses")
    .insert({
      image_path: imagePath,
      dicom_path: dicomPath ?? null,
      model: process.env.HF_MODEL_NAME ?? "unknown",
      top_label: top?.label ?? null,
      top_score: top?.score ?? null,
      predictions,
      regions,
      raw,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
