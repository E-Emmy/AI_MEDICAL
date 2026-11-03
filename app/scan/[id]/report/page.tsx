"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { fmtDate, labelText, pct, shortModel } from "@/lib/format";
import { capital, flaggedRuns, loadScan, scanName, scanTitle, testName, type ScanBundle } from "@/lib/analysis";
import { summarise } from "@/lib/summary";
import ScanImage from "@/components/ScanImage";
import Logo from "@/components/Logo";

const VERDICT = { agree: "Agrees", disagree: "Disagrees", unsure: "Unsure" } as const;

// A one-page report for the record. "Download PDF" uses the browser's own Save as PDF,
// so what's printed is exactly what's on screen.
export default function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const [bundle, setBundle] = useState<ScanBundle | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!session) return;
    loadScan(id).then((b) => ("error" in b ? setErr(b.error) : setBundle(b)));
  }, [session, id]);

  if (err) return <div className="callout bad" role="alert"><strong>Report not available</strong>{err}</div>;
  if (!bundle) return <p className="muted">Preparing the report…</p>;

  const { runs, reviews, url } = bundle;
  const a = runs[0];
  // Draw the strongest finding's heatmap, the one most worth seeing on paper.
  const heatRun = flaggedRuns(runs).find((r) => r.raw?.heatmap) ?? runs.find((r) => r.raw?.heatmap);
  const heat = heatRun?.raw?.heatmap ?? null;

  return (
    <>
      <div className="report-bar no-print">
        <Link className="back" href={`/scan/${id}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Back to the scan
        </Link>
        <button type="button" className="btn" onClick={() => window.print()}>Download PDF</button>
        <span className="muted small">Choose &ldquo;Save as PDF&rdquo; as the printer.</span>
      </div>

      <article className="report">
        <header className="report-head">
          <span className="brand"><Logo />ScanLens</span>
          <div className="report-meta">
            <span>Analysis report</span>
            <span>{fmtDate(a.created_at)}</span>
            {bundle.case && <span>Case: {bundle.case.label}</span>}
          </div>
        </header>

        <h1>{scanTitle(runs, labelText)}</h1>
        <p className="lede">{capital(scanName(a))}, {runs.length} {runs.length === 1 ? "test" : "tests"}.{a.raw?.scan_check && ` Scan check: ${a.raw.scan_check.name}, ${Math.round(a.raw.scan_check.score * 100)}% match.`}</p>

        <div className="report-grid">
          <figure>
            <ScanImage src={url} alt="The analysed scan" regions={runs.flatMap((r) => r.regions)} labels natural heat={heat} />
            {heat && <figcaption>Highlighted: where the {testName(heatRun!)} test looked for {labelText(heat.label)}. Not a confirmed location of disease.</figcaption>}
          </figure>
          <table className="report-table">
            <thead><tr><th>Test</th><th>Result</th><th>Score</th><th>Clinician</th></tr></thead>
            <tbody>
              {runs.map((r) => {
                const top = r.predictions[0];
                const rv = reviews?.[r.id];
                return (
                  <tr key={r.id}>
                    <td>{testName(r)}<br /><span className="muted small">{shortModel(r.model)}</span></td>
                    <td>{top ? labelText(top.label) : "No result"}</td>
                    <td>{top ? pct(top.score) : ""}</td>
                    <td>{rv ? VERDICT[rv.verdict] : <span className="muted">Not reviewed</span>}{rv?.note && <><br /><span className="small">{rv.note}</span></>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {a.raw?.dicom && (
          <p className="small">
            DICOM: {[a.raw.dicom.modality, a.raw.dicom.bodyPart, a.raw.dicom.description, `${a.raw.dicom.cols} × ${a.raw.dicom.rows} px`,
              a.raw.dicom.sliceThickness != null && `${a.raw.dicom.sliceThickness} mm slices`].filter(Boolean).join(", ")}.
          </p>
        )}

        <section className="report-summary">
          <h2>In plain words</h2>
          {summarise(runs, reviews).map((p, i) => <p key={i}>{p}</p>)}
        </section>

        <footer className="report-foot">
          Decision support only. These results come from machine-learning models and are not a diagnosis. Scores show how confident each
          model is, not how likely the condition is. A qualified clinician must review every result.
        </footer>
      </article>
    </>
  );
}
