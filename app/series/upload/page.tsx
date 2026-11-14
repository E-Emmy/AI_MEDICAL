"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import CasePicker from "@/components/CasePicker";
import SeriesFactsList from "@/components/SeriesFacts";
import { KIND_NAMES, guessKind, gzip, readDicomSeries, readNiftiFacts, toNifti, type SeriesFacts, type SeriesKind } from "@/lib/series";
import { SERIES_MISSING, putToR2, seriesLink } from "@/lib/seriesApi";
import { SERIES_SAMPLES, type SeriesSample } from "@/lib/seriesSamples";
import { isZip, readZip } from "@/lib/zip";

const SeriesViewer = dynamic(() => import("@/components/SeriesViewer"), { ssr: false });

type Ready = { blob: Blob; url: string; facts: SeriesFacts; source: string };

// Collects every file in a dropped folder, including subfolders.
async function filesFromDrop(items: DataTransferItemList): Promise<File[]> {
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns at most 100 entries per call, so keep reading until it's empty.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (batch.length === 0) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  const entries = [...items].map((i) => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e);
  for (const e of entries) await walk(e);
  return out;
}

const isNifti = (f: File) => /\.nii(\.gz)?$/i.test(f.name);
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export default function UploadSeries() {
  useSession();
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState("");
  const [ready, setReady] = useState<Ready | null>(null);
  const [kind, setKind] = useState<SeriesKind>("brain-mri");
  const [label, setLabel] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [fetching, setFetching] = useState("");

  useEffect(() => () => { if (ready) URL.revokeObjectURL(ready.url); }, [ready]);

  async function take(files: File[]) {
    setErr(""); setReady(null);
    files = files.filter((f) => !f.name.startsWith("."));
    if (files.length === 0) return;
    try {
      let blob: Blob, facts: SeriesFacts, source: string;
      // A zipped DICOM folder is unpacked here, in the browser.
      if (files.length === 1 && isZip(files[0])) {
        setReading("Unzipping…");
        files = await readZip(files[0]);
      }
      const nii = files.find(isNifti);
      if (nii && files.length === 1) {
        setReading("Reading the NIfTI file…");
        facts = await readNiftiFacts(nii);
        // Store everything compressed, so a plain .nii is gzipped here.
        blob = /\.gz$/i.test(nii.name) ? nii : await gzip(await nii.arrayBuffer());
        source = nii.name;
      } else {
        const vol = await readDicomSeries(files, (d, t) => setReading(`Reading file ${d} of ${t}…`));
        setReading("Building the 3D scan…");
        blob = await gzip(toNifti(vol));
        facts = vol.facts;
        source = `${files.length} DICOM files`;
      }
      setKind(guessKind(facts));
      setReady({ blob, url: URL.createObjectURL(blob), facts, source });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setReading("");
    }
  }

  async function save() {
    if (!ready) return;
    setErr(""); setProgress(0);
    try {
      const { key, url } = await seriesLink("upload");
      await putToR2(url!, ready.blob, setProgress);
      const { data, error } = await supabase.from("series")
        .insert({ kind, label: label.trim() || null, object_key: key, facts: ready.facts, case_id: caseId })
        .select("id").single();
      if (error) {
        await seriesLink("delete", key).catch(() => {});
        throw new Error(error.code === "PGRST205" ? SERIES_MISSING : error.message);
      }
      router.push(`/series/${data.id}`);
    } catch (e) {
      setProgress(null);
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function download(s: SeriesSample) {
    setFetching(s.id); setErr("");
    try {
      // A short-lived link to the zip in R2; the browser saves it under its own name.
      window.location.href = (await seriesLink("download", s.download.key)).url!;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setTimeout(() => setFetching(""), 1500);
  }

  const busy = !!reading || progress != null;
  const error = err && <div className="callout bad" role="alert"><strong>That didn&apos;t work</strong>{err}</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small"><Link href="/series">Full scans</Link></p>
          <h1>Upload a full scan</h1>
          <p className="lede">A whole CT or MRI series: a folder of DICOM slices, or one .nii / .nii.gz file.</p>
        </div>
      </div>

      {!ready && (
        <>
          {error}
          <div
            className={over ? "drop over" : "drop"}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={async (e) => { e.preventDefault(); setOver(false); if (!busy) take(await filesFromDrop(e.dataTransfer.items)); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 16v-5M9.5 13.5 12 11l2.5 2.5" />
            </svg>
            <strong>{reading || "Drop a scan folder here"}</strong>
            <span className="muted">Uncompressed DICOM slices of one series (a folder or a .zip), or a NIfTI file. Patient details in the DICOM headers stay on this computer: only the pixels and scan geometry are uploaded.</span>
            <div className="drop-actions">
              <label className="btn btn-quiet">
                <input className="sr-only" type="file" multiple disabled={busy}
                  {...{ webkitdirectory: "", directory: "" }}
                  onChange={(e) => take([...(e.target.files ?? [])])} />
                Choose a folder
              </label>
              <label className="btn btn-quiet">
                <input className="sr-only" type="file" accept=".zip,.nii,.gz,application/zip" disabled={busy}
                  onChange={(e) => take([...(e.target.files ?? [])])} />
                Choose a .zip or .nii.gz file
              </label>
            </div>
          </div>

          <section className="samples" aria-labelledby="try-h">
            <h2 id="try-h" className="section-title">Need a scan to try?</h2>
            <p className="muted">
              Download a real, anonymised full scan as a zipped DICOM folder, then drop the .zip above (or unzip it and choose the folder).
            </p>
            <ul className="try-list">
              {SERIES_SAMPLES.map((s) => (
                <li key={s.id} className="try-item">
                  <img src={s.thumb} alt="" loading="lazy" />
                  <div>
                    <strong>{s.title}</strong>
                    <span className="muted small">{s.finding} · {s.facts.size[2]} slices · {s.download.size}</span>
                    <span className="fine">Source: <a href={s.url} target="_blank" rel="noreferrer">{s.credit}</a></span>
                  </div>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => download(s)} disabled={!!fetching}>
                    {fetching === s.id ? "Starting…" : "Download .zip"}
                  </button>
                </li>
              ))}
            </ul>
            <p className="fine">
              More full scans: <a href="https://www.cancerimagingarchive.net" target="_blank" rel="noreferrer">The Cancer Imaging Archive</a> (for
              example the LIDC-IDRI chest CT and UPENN-GBM brain MRI collections). Compressed DICOM isn&apos;t supported yet.
            </p>
          </section>
        </>
      )}

      {ready && (
        <div className="scan-layout series-layout">
          <div className="scan-main">
            <SeriesViewer url={ready.url} kind={kind} key={`${ready.url}-${kind}`} />
          </div>
          <aside className="scan-side">
            <div className="card">
              <h2 className="card-title">Check the scan</h2>
              <p className="small muted">From {ready.source}. Upload size {mb(ready.blob.size)}.</p>
              <div>
                <p className="small muted" id="kind-h">What is it?</p>
                <div className="seg seg-wrap" role="radiogroup" aria-labelledby="kind-h">
                  {(Object.keys(KIND_NAMES) as SeriesKind[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={busy} onClick={() => setKind(k)}>{KIND_NAMES[k]}</button>
                  ))}
                </div>
              </div>
              <SeriesFactsList kind={kind} facts={ready.facts} />
              {ready.facts.skipped ? <p className="small muted">{ready.facts.skipped} other {ready.facts.skipped === 1 ? "file was" : "files were"} in the folder and left out.</p> : null}
              <div className="field">
                <label htmlFor="series-label">Your reference (optional)</label>
                <input id="series-label" value={label} maxLength={80} disabled={busy} placeholder="e.g. Bed 4, follow-up"
                  onChange={(e) => setLabel(e.target.value)} />
              </div>
              <CasePicker value={caseId} onChange={setCaseId} disabled={busy} />
              {error}
              <div className="actions">
                <button className="btn" onClick={save} disabled={busy}>
                  {progress != null ? `Uploading ${Math.round(progress * 100)}%` : "Save full scan"}
                </button>
                <button className="btn btn-quiet" onClick={() => setReady(null)} disabled={busy}>Choose another</button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
