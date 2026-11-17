import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { downloadUrl, remove, uploadUrl, viewUrl } from "@/lib/r2";

// Hands out short-lived R2 links for full scans. Each person's scans live under series/<their id>/,
// so the key itself says whose it is; samples/ can be viewed by anyone signed in.
export async function POST(req: NextRequest) {
  const { action, key } = await req.json().catch(() => ({}));
  // The sample scans are public research data, so they open (and download) without an account.
  try {
    if (action === "view" && typeof key === "string" && /^samples\/[\w-]+\.nii\.gz$/.test(key)) {
      return NextResponse.json({ url: await viewUrl(key) });
    }
    const dl = action === "download" && typeof key === "string" && key.match(/^samples\/downloads\/([\w-]+\.zip)$/);
    if (dl) return NextResponse.json({ url: await downloadUrl(key, dl[1]) });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("is not set") ? e.message : "The scan storage couldn't be reached. Try again.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const own = typeof key === "string" && key.startsWith(`series/${user.id}/`) && /^[\w/-]+\.nii\.gz$/.test(key);

  try {
    if (action === "upload") {
      const newKey = `series/${user.id}/${crypto.randomUUID()}.nii.gz`;
      return NextResponse.json({ key: newKey, url: await uploadUrl(newKey) });
    }
    if (action === "view") {
      const sample = typeof key === "string" && /^samples\/[\w-]+\.nii\.gz$/.test(key);
      if (!own && !sample) return NextResponse.json({ error: "You can't open that scan." }, { status: 403 });
      return NextResponse.json({ url: await viewUrl(key) });
    }
    if (action === "download") {
      // Only the sample DICOM folders (zipped) can be downloaded, for people who want a scan to try.
      const m = typeof key === "string" && key.match(/^samples\/downloads\/([\w-]+\.zip)$/);
      if (!m) return NextResponse.json({ error: "That file can't be downloaded." }, { status: 403 });
      return NextResponse.json({ url: await downloadUrl(key, m[1]) });
    }
    if (action === "delete") {
      if (!own) return NextResponse.json({ error: "You can't delete that scan." }, { status: 403 });
      await remove(key);
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("is not set") ? e.message : "The scan storage couldn't be reached. Try again.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
