"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import type { Prediction, Region } from "@/lib/hf";
import { fmtDate, labelText, pct, shortModel } from "@/lib/format";
import ScanImage from "@/components/ScanImage";
import Review, { type ReviewRow } from "@/components/Review";
import { isNormal, type Heatmap, type ScanCheck, type TestInfo } from "@/lib/tests";

type Analysis = {
  id: string; image_path: string; dicom_path: string | null; model: string; created_at: string;
  predictions: Prediction[]; regions: Region[];
  raw: { test?: TestInfo; scan_check?: ScanCheck; heatmap?: Heatmap | null; heatmap_note?: "diffuse" | null;
    sample?: { truth: string; source: string; url: string };
    slices?: { count: number; flagged: number } } | null;
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const testName = (r: Analysis) => r.raw?.test?.name ?? shortModel(r.model);
// Long lists (like the 14 conditions) hide the near-zero rows behind one line.
const SHOWN_MIN = 0.01;

export default function Scan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  // Every test run on this scan, with the one that was opened first.
  const [runs, setRuns] = useState<Analysis[] | null>(null);
  const [url, setUrl] = useState("");
  const [marks, setMarks] = useState(true);
  // Which test's heatmap is drawn; only one at a time so they don't blend together.
  const [heatFor, setHeatFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");
  const router = useRouter();
  // Reviews by analysis id; null when the reviews table hasn't been created yet.
  const [reviews, setReviews] = useState<Record<string, ReviewRow> | null>({});
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await supabase.from("analyses").select("*").eq("id", id).single();
      if (error || !data) return setErr("This analysis doesn't exist, or it belongs to another account.");
      const siblings = await supabase.from("analyses").select("*").eq("image_path", data.image_path);
      const others = ((siblings.data as Analysis[]) ?? []).filter((r) => r.id !== id);
      others.sort((x, y) => testName(x).localeCompare(testName(y)));
      const all = [data as Analysis, ...others];
      setRuns(all);
      setHeatFor(all.find((r) => r.raw?.heatmap)?.id ?? null);
      const rv = await supabase.from("reviews").select("analysis_id,verdict,note,updated_at").in("analysis_id", all.map((r) => r.id));
      if (rv.error) setReviews(null);
      else setReviews(Object.fromEntries((rv.data as ReviewRow[]).map((r) => [r.analysis_id, r])));
      const s = await supabase.storage.from("scans").createSignedUrl(data.image_path, 600);
      if (s.data) setUrl(s.data.signedUrl);
    })();
  }, [session, id]);

  const back = (
    <Link className="back" href="/">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      All analyses
    </Link>
  );

  // Removes the image files first, so a failure never leaves results pointing at nothing.
  async function deleteScan() {
    if (!runs) return;
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
    router.replace("/");
  }

  if (err) return <>{back}<div className="callout bad" role="alert"><strong>Analysis not found</strong>{err}</div></>;
  if (!runs) return <>{back}<p className="muted">Loading the analysis…</p></>;

  const a = runs[0];
  const scanCheck = a.raw?.scan_check;
  const scanName = a.raw?.test?.scan_name ?? scanCheck?.name ?? "scan";
  const several = runs.length > 1;
  const flagged = runs.filter((r) => r.predictions[0] && !isNormal(r.predictions[0].label));
  const regions = runs.flatMap((r) => r.regions);
  const heatRun = runs.find((r) => r.id === heatFor && r.raw?.heatmap);
  const heat = heatRun?.raw?.heatmap ?? null;

  let title: string;
  if (!several) title = a.predictions[0] ? labelText(a.predictions[0].label) : "No finding";
  else if (flagged.length === 0) title = `No findings in ${runs.length} tests`;
  else if (flagged.length === 1) title = `${labelText(flagged[0].predictions[0].label)} flagged`;
  else title = `${flagged.length} of ${runs.length} tests flagged a finding`;

  const lede = several
    ? `${capital(scanName)} checked with ${runs.length} tests: ${runs.map(testName).join(", ")}. Analysed ${fmtDate(a.created_at)}.`
    : `${testName(a)} test on a ${scanName}, analysed ${fmtDate(a.created_at)} with ${a.model}.`;

  return (
    <>
      {back}
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="lede">{lede}</p>
        </div>
      </div>

      <div className="split">
        <div>
          <div className="lightbox">
            <ScanImage
              src={url}
              alt="The uploaded scan"
              regions={regions}
              showMarks={marks}
              labels
              natural
              heat={heat}
              overlays={{
                tl: heat ? `Where the model looked for ${labelText(heat.label)}` : undefined,
                bl: fmtDate(a.created_at),
                br: capital(scanName),
              }}
            />
          </div>
          {heat && (
            <p className="fine">
              The highlight shows the area that most changed the {testName(heatRun!)} test&apos;s answer when it was covered.
              It shows what the model relied on, not a confirmed location of disease.
            </p>
          )}
        </div>

        <aside className="panel side">
          {a.raw?.sample && (
            <p className="known">
              Sample scan. The dataset labels it <strong>{a.raw.sample.truth}</strong>.{" "}
              <a href={a.raw.sample.url} target="_blank" rel="noreferrer">{a.raw.sample.source}</a>
            </p>
          )}
          {scanCheck && <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>Scan check: this looks like a {scanCheck.name}.</p>}
          {runs.map((r) => {
            const top = r.predictions[0];
            const normal = !top || isNormal(top.label);
            const open = expanded[r.id];
            const shown = open ? r.predictions : r.predictions.filter((p, i) => i === 0 || p.score >= SHOWN_MIN);
            const hidden = r.predictions.length - shown.length;
            return (
              <section key={r.id} className="result" aria-label={`${testName(r)} test`}>
                <h2>{testName(r)} test</h2>
                <p className="muted result-model">{shortModel(r.model)}</p>
                {top ? (
                  <p className={normal ? "verdict" : "verdict flagged"}>
                    Result: <strong>{labelText(top.label)}</strong> ({pct(top.score, 0)})
                  </p>
                ) : (
                  <p className="muted">The model returned no findings for this scan.</p>
                )}
                {shown.map((p, i) => (
                  <div key={p.label} className={i === 0 ? "finding top" : "finding"}>
                    <div className="finding-row"><span>{labelText(p.label)}</span><span>{pct(p.score)}</span></div>
                    <span className="meter" aria-hidden="true"><i style={{ width: `${p.score * 100}%` }} /></span>
                  </div>
                ))}
                {(hidden > 0 || open) && (
                  <button type="button" className="link-btn" onClick={() => setExpanded({ ...expanded, [r.id]: !open })}>
                    {open ? "Show fewer" : `Show ${hidden} more under 1%`}
                  </button>
                )}
                {r.raw?.slices && (
                  <p className="fine">
                    This image is a grid of {r.raw.slices.count} slices, so each slice was tested on its own.{" "}
                    {r.raw.slices.flagged === 0
                      ? "None showed a finding."
                      : `${r.raw.slices.flagged} of them ${r.raw.slices.flagged === 1 ? "shows" : "show"} a finding, boxed on the image.`}
                  </p>
                )}
                {r.raw?.heatmap_note === "diffuse" && (
                  <p className="fine caution">
                    No single area drove this result: covering any part of the scan barely changed the answer.
                    The model is reacting to the image as a whole rather than a specific spot, so treat this result with extra caution.
                  </p>
                )}
                {r.raw?.heatmap && (
                  <label className="switch">
                    <span>Show where it looked</span>
                    <input type="checkbox" checked={heatFor === r.id} onChange={(e) => setHeatFor(e.target.checked ? r.id : null)} />
                  </label>
                )}
                {top && reviews && (
                  <Review analysisId={r.id} saved={reviews[r.id]} onSaved={(row) => setReviews({ ...reviews, [r.id]: row })} />
                )}
              </section>
            );
          })}
          {regions.length > 0 && (
            <label className="switch">
              <span>Show marked regions ({regions.length})</span>
              <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} />
            </label>
          )}
          <p className="fine">Scores show how confident each model is, not how likely the condition is. A clinician should review every result.</p>
          {!reviews && (
            <p className="fine caution">Reviews are switched off: run supabase/migrations/002_reviews_and_delete.sql in the Supabase SQL editor to turn them on.</p>
          )}
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
