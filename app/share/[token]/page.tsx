"use client";
import { use, useEffect, useState } from "react";
import { fmtDate, labelText } from "@/lib/format";
import { capital, loadShared, scanName, scanTitle, testName, type ScanBundle } from "@/lib/analysis";
import ScanImage from "@/components/ScanImage";
import Stage from "@/components/Stage";
import { floatsFor, leadRun } from "@/components/floats";
import ResultCard from "@/components/ResultCard";
import PatientSummary from "@/components/PatientSummary";
import ZoomView from "@/components/ZoomView";

// A read-only view of one shared scan. No sign-in; the link itself is the permission.
export default function Shared({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [bundle, setBundle] = useState<ScanBundle | null>(null);
  const [err, setErr] = useState("");
  const [heatFor, setHeatFor] = useState<string | null>(null);

  useEffect(() => {
    loadShared(token).then((b) => {
      if ("error" in b) return setErr(b.error);
      setBundle(b);
      setHeatFor(b.runs.find((r) => r.raw?.heatmap)?.id ?? null);
    });
  }, [token]);

  if (err) return <div className="callout bad" role="alert"><strong>This shared scan can&apos;t be shown</strong>{err}</div>;
  if (!bundle) return <p className="muted">Loading the shared scan…</p>;

  const { runs, reviews, url } = bundle;
  const a = runs[0];
  const heatRun = runs.find((r) => r.id === heatFor && r.raw?.heatmap);
  const heat = heatRun?.raw?.heatmap ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="shared-tag">Shared for a second opinion</p>
          <h1>{scanTitle(runs, labelText)}</h1>
          <p className="lede">{capital(scanName(a))} checked with {runs.length === 1 ? "one test" : `${runs.length} tests`}: {runs.map(testName).join(", ")}. Analysed {fmtDate(a.created_at)}.</p>
        </div>
      </div>
      <div className="scan-layout">
        <div className="scan-main">
          <Stage word={scanName(a)} confidence={leadRun(runs).predictions[0]?.score} floats={floatsFor(runs, reviews)}>
            <ZoomView label={capital(scanName(a))}>
              <ScanImage src={url} alt="The shared scan" regions={runs.flatMap((r) => r.regions)} labels natural heat={heat}
                overlays={{ tl: heat ? `Where the model looked for ${labelText(heat.label)}` : undefined }} />
            </ZoomView>
          </Stage>
          <PatientSummary runs={runs} reviews={reviews} />
        </div>
        <aside className="scan-side">
          {runs.map((r) => (
            <ResultCard key={r.id} run={r} heatOn={heatFor === r.id} onHeat={(on) => setHeatFor(on ? r.id : null)} review={{ saved: reviews?.[r.id] }} />
          ))}
          <p className="fine">Scores show how confident each model is, not how likely the condition is. This is decision support, not a diagnosis.</p>
        </aside>
      </div>
    </>
  );
}
