"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { dicomToPng } from "@/lib/dicom";

export default function Upload() {
  const session = useSession();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [png, setPng] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(f: File | null) {
    setErr(""); setPng(null); setPreview(""); setFile(f);
    if (!f) return;
    try {
      const isDicom = /\.(dcm|dicom)$/i.test(f.name) || f.type === "application/dicom";
      const blob = isDicom ? await dicomToPng(f) : f;
      if (!isDicom && f.type !== "image/png") throw new Error("Use a PNG or DICOM file.");
      setPng(blob);
      setPreview(URL.createObjectURL(blob));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function analyse() {
    if (!file || !png || !session) return;
    setBusy(true); setErr("");
    try {
      const uid = session.user.id;
      const base = `${uid}/${crypto.randomUUID()}`;
      const imagePath = `${base}.png`;
      let dicomPath: string | undefined;

      const up = await supabase.storage.from("scans").upload(imagePath, png, { contentType: "image/png" });
      if (up.error) throw up.error;
      if (file.type !== "image/png") {
        dicomPath = `${base}.dcm`;
        const d = await supabase.storage.from("scans").upload(dicomPath, file);
        if (d.error) throw d.error;
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ imagePath, dicomPath }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Analysis failed");
      router.push(`/scan/${body.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <h1>New analysis</h1>
      <div className="panel">
        <label>CT scan (DICOM or PNG)
          <input type="file" accept=".dcm,.dicom,.png,application/dicom,image/png" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>
        {preview && <div className="viewer" style={{ maxWidth: 420, marginBottom: 12 }}><img src={preview} alt="Scan preview" /></div>}
        <button disabled={!png || busy} onClick={analyse}>{busy ? "Analysing…" : "Analyse scan"}</button>
        {err && <p className="err">{err}</p>}
      </div>
    </>
  );
}
