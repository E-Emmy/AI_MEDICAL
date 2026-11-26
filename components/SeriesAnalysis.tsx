"use client";
import { useState } from "react";
import { fmtDate, pct } from "@/lib/format";
import { capital } from "@/lib/analysis";
import type { SeriesKind } from "@/lib/series";
import { SERIES_TEST, type FlaggedSlice, type SeriesResults } from "@/lib/seriesResults";

type Props = {
  kind: SeriesKind;
  results: SeriesResults | null;
  // Precomputed results (public/series-samples); live analysis of full scans was removed with the R2 storage.
  showFindings: boolean;
  onShowFindings: (v: boolean) => void;
  onFocus: (f: FlaggedSlice) => void;
};

// How the finding is described in the headline, per kind.
const FINDING: Partial<Record<SeriesKind, string>> = { "brain-mri": "tumour", "chest-ct": "lung cancer" };
const SHOWN = 8;

export default function SeriesAnalysis({ kind, results, showFindings, onShowFindings, onFocus }: Props) {
  const test = SERIES_TEST[kind];
  const [all, setAll] = useState(false);

  if (!test) {
    return (
      <div className="card">
        <h2 className="card-title">Analysis</h2>
        <p className="muted">Slice-by-slice analysis is available for brain MRI and chest CT. You can still view this scan in 3D.</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="card">
        <h2 className="card-title">Analysis</h2>
        <p className="muted">Loading the {test} test results…</p>
      </div>
    );
  }

  const { summary } = results;
  const found = summary.flagged > 0;
  const ranked = [...results.flagged].sort((a, b) => b.score - a.score);
  const listed = all ? ranked : ranked.slice(0, SHOWN);
  const [lo, hi] = mainGroup(results.flagged, summary.strongest?.k);
  const range = !found ? "" : lo === hi ? `slice ${lo + 1}` : `mainly slices ${lo + 1}–${hi + 1}`;

  return (
    <div className="card series-analysis">
      <h2 className="card-title">{results.test.name} test, every slice</h2>
      {found ? (
        <p className={`series-headline flag`}>
          Possible {FINDING[kind] ?? "finding"} on <b>{summary.flagged}</b> of {summary.analysed} slices ({range}).
        </p>
      ) : (
        <p className="series-headline ok">No finding on any of the {summary.analysed} slices tested.</p>
      )}
      {found && summary.strongest && (
        <p className="small">
          Strongest on slice {summary.strongest.k + 1}: <b>{capital(summary.strongest.label)}</b> at {pct(summary.strongest.score, 0)}.
          {kind === "brain-mri" && " The model also names a tumour type; treat that as a guess, as it is often wrong about the type even when the location is right."}
        </p>
      )}

      {found && (
        <>
          <label className="switch inline">
            <span>Show where the model looked</span>
            <input type="checkbox" checked={showFindings} onChange={(e) => onShowFindings(e.target.checked)} />
          </label>
          <ol className="flagged-list">
            {listed.map((f) => (
              <li key={f.k}>
                <button type="button" onClick={() => onFocus(f)}>
                  <span>Slice {f.k + 1}</span>
                  <span className="muted">{capital(f.label)}</span>
                  <b>{pct(f.score, 0)}</b>
                </button>
              </li>
            ))}
          </ol>
          {ranked.length > SHOWN && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAll(!all)}>
              {all ? "Show the strongest only" : `Show all ${ranked.length} flagged slices`}
            </button>
          )}
        </>
      )}

      <p className="fine">
        Each slice is tested on its own. The orange area shows where the model looked on the most confident slices, not the
        outline of the finding. {results.skipped > 0 && `${results.skipped} nearly empty slices at the ends were skipped. `}
        Model: {results.model}.
      </p>
      {results.analysed_at && <p className="fine">Precomputed with the same model on {fmtDate(results.analysed_at)}.</p>}
    </div>
  );
}

// The run of flagged slices around the strongest one, allowing gaps of up to 5 slices, so a stray
// flagged slice far away doesn't stretch the range shown.
function mainGroup(flagged: FlaggedSlice[], strongest?: number): [number, number] {
  if (strongest == null) return [0, 0];
  const ks = new Set(flagged.map((f) => f.k));
  let lo = strongest, hi = strongest;
  for (let k = lo - 1; k >= lo - 6 && k >= 0; k--) if (ks.has(k)) { lo = k; k = lo; }
  for (let k = hi + 1; k <= hi + 6; k++) if (ks.has(k)) { hi = k; k = hi; }
  return [lo, hi];
}
