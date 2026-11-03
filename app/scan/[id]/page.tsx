"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { fmtDate, labelText } from "@/lib/format";
import { capital, loadScan, scanName, scanTitle, testName, type ScanBundle } from "@/lib/analysis";
import ScanImage from "@/components/ScanImage";
import Stage from "@/components/Stage";
import { floatsFor, leadRun } from "@/components/floats";
import ResultCard from "@/components/ResultCard";
import PatientSummary from "@/components/PatientSummary";
import ShareLink from "@/components/ShareLink";
import CasePicker from "@/components/CasePicker";
import DicomFacts from "@/components/DicomFacts";
import ZoomView from "@/components/ZoomView";

export default function Scan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const router = useRouter();
  const [bundle, setBundle] = useState<ScanBundle | null>(null);
  const [err, setErr] = useState("");
  const [marks, setMarks] = useState(true);
  // Which test's heatmap is drawn; only one at a time so they don't blend together.
  const [heatFor, setHeatFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const [caseErr, setCaseErr] = useState("");

  useEffect(() => {
    if (!session) return;
    loadScan(id).then((b) => {
      if ("error" in b) return setErr(b.error);
      setBundle(b);
      setHeatFor(b.runs.find((r) => r.raw?.heatmap)?.id ?? null);
    });
  }, [session, id]);

  const back = (
    <Link className="back" href={bundle?.case ? `/cases/${bundle.case.id}` : "/"}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      {bundle?.case ? bundle.case.label : "Overview"}
    </Link>
  );

  // Removes the image files first, so a failure never leaves results pointing at nothing.
  async function deleteScan() {
    if (!bundle) return;
    const { runs } = bundle;
    const n = runs.length;
    if (!window.confirm(`Delete this scan and its ${n === 1 ? "result" : `${n} test results`}? This can't be undone.`)) return;
    setDeleting(true); setDeleteErr("");
    const files = [runs[0].image_path, ...runs.map((r) => r.dicom_path).filter((p): p is string => !!p)];
    const st = await supabase.storage.from("scans").remove([...new Set(files)]);
    // Storage reports success but removes nothing when the delete policy is missing.
    const blocked = !st.error && !st.data?.length
      ? { message: "Run supabase/migrations/002_reviews_and_delete.sql in the Supabase SQL editor first." } : null;
    const db = st.error || blocked ? null : await supabase.from("analyses").delete().eq("image_path", runs[0].image_path);
    const e = st.error ?? blocked ?? db?.error;
    if (e) {
      setDeleting(false);
      return setDeleteErr(e.message);
    }
    router.replace(bundle.case ? `/cases/${bundle.case.id}` : "/");
  }

  // Every test on this scan moves together.
  async function moveTo(caseId: string | null) {
    if (!bundle) return;
    setCaseErr("");
    const { error } = await supabase.from("analyses").update({ case_id: caseId }).eq("image_path", bundle.runs[0].image_path);
    if (error) return setCaseErr(error.message);
    const found = caseId ? await supabase.from("cases").select("id,label,note,created_at").eq("id", caseId).single() : null;
    setBundle({ ...bundle, runs: bundle.runs.map((r) => ({ ...r, case_id: caseId })), case: found?.data ?? null });
  }

  if (err) return <>{back}<div className="callout bad" role="alert"><strong>Analysis not found</strong>{err}</div></>;
  if (!bundle) return <>{back}<p className="muted">Loading the analysis…</p></>;

  const { runs, reviews, url } = bundle;
  const a = runs[0];
  const scan = scanName(a);
  const heatRun = runs.find((r) => r.id === heatFor && r.raw?.heatmap);
  const heat = heatRun?.raw?.heatmap ?? null;
  const regions = runs.flatMap((r) => r.regions);
  const lead = leadRun(runs);
  const lede = runs.length > 1
    ? `${capital(scan)} checked with ${runs.length} tests: ${runs.map(testName).join(", ")}. Analysed ${fmtDate(a.created_at)}.`
    : `${testName(a)} test on a ${scan}, analysed ${fmtDate(a.created_at)} with ${a.model}.`;

  return (
    <>
      {back}
      <div className="page-head">
        <div>
          <h1>{scanTitle(runs, labelText)}</h1>
          <p className="lede">{lede}</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-quiet" href={`/scan/${a.id}/report`}>Report PDF</Link>
          {bundle.case && <Link className="btn btn-quiet" href={`/cases/${bundle.case.id}?compare=${a.id}`}>Compare</Link>}
        </div>
      </div>

      <div className="scan-layout">
        <div className="scan-main">
          <Stage word={scan} confidence={lead.predictions[0]?.score} floats={floatsFor(runs, reviews)}>
            <ZoomView label={`${capital(scan)}, ${fmtDate(a.created_at)}`}>
              <ScanImage src={url} alt="The uploaded scan" regions={regions} showMarks={marks} labels natural heat={heat}
                overlays={{ tl: heat ? `Where the model looked for ${labelText(heat.label)}` : undefined, bl: fmtDate(a.created_at) }} />
            </ZoomView>
          </Stage>
          {heat && (
            <p className="fine">
              The highlight shows the area that most changed the {testName(heatRun!)} test&apos;s answer when it was covered.
              It shows what the model relied on, not a confirmed location of disease.
            </p>
          )}
          {regions.length > 0 && (
            <label className="switch inline">
              <span>Show marked regions ({regions.length})</span>
              <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} />
            </label>
          )}
          <PatientSummary runs={runs} reviews={reviews} />
        </div>

        <aside className="scan-side">
          {a.raw?.sample && (
            <p className="known">
              Sample scan. The dataset labels it <strong>{a.raw.sample.truth}</strong>.{" "}
              <a href={a.raw.sample.url} target="_blank" rel="noreferrer">{a.raw.sample.source}</a>
            </p>
          )}
          {runs.map((r) => (
            <ResultCard key={r.id} run={r} heatOn={heatFor === r.id} onHeat={(on) => setHeatFor(on ? r.id : null)}
              review={reviews ? { saved: reviews[r.id], onSaved: (row) => setBundle({ ...bundle, reviews: { ...reviews, [r.id]: row } }) } : undefined} />
          ))}
          <p className="fine">Scores show how confident each model is, not how likely the condition is. A clinician should review every result.</p>
          {!reviews && (
            <p className="fine caution">Reviews are switched off: run supabase/migrations/002_reviews_and_delete.sql in the Supabase SQL editor to turn them on.</p>
          )}

          <section className="card">
            <CasePicker value={bundle.case?.id ?? null} onChange={moveTo} label="Patient case" />
            {caseErr && <p className="review-err" role="alert">The scan wasn&apos;t moved: {caseErr}</p>}
          </section>
          {a.raw?.dicom && <DicomFacts info={a.raw.dicom} />}
          <ShareLink imagePath={a.image_path} />

          <div className="danger-zone">
            <button type="button" className="btn btn-quiet btn-sm btn-danger" onClick={deleteScan} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete this scan"}
            </button>
            {deleteErr && <p className="review-err" role="alert">The scan wasn&apos;t deleted: {deleteErr}</p>}
          </div>
        </aside>
      </div>
    </>
  );
}
