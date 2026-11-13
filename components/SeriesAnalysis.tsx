"use client";
import { useState } from "react";
import { fmtDate, pct } from "@/lib/format";
import { capital } from "@/lib/analysis";
import type { SeriesKind } from "@/lib/series";
import { SERIES_TEST, type FlaggedSlice, type SeriesResults, type SeriesReview } from "@/lib/seriesResults";

type Props = {
  kind: SeriesKind;
  results: SeriesResults | null;
  // Precomputed results for a sample, rather than an analysis of this person's own scan.
  sample?: boolean;
  busy: boolean;
  err: string;
  onAnalyse: () => void;
  showFindings: boolean;
  onShowFindings: (v: boolean) => void;
  onFocus: (f: FlaggedSlice) => void;
  // Saves a clinician review. Absent for samples, which aren't saved.
  onReview?: (r: SeriesReview) => Promise<void>;
};

const VERDICTS: [SeriesReview["verdict"], string][] = [["agree", "Agree"], ["disagree", "Disagree"], ["unsure", "Unsure"]];
// How the finding is described in the headline, per kind.
const FINDING: Partial<Record<SeriesKind, string>> = { "brain-mri": "tumour", "chest-ct": "lung cancer" };
const SHOWN = 8;

export default function SeriesAnalysis({ kind, results, sample, busy, err, onAnalyse, showFindings, onShowFindings, onFocus, onReview }: Props) {
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

  const error = err && <div className="callout bad" role="alert"><strong>The analysis didn&apos;t finish</strong>{err}</div>;
  const button = (
    <button className="btn" onClick={onAnalyse} disabled={busy}>
      {busy ? "Analysing every slice…" : results ? "Run the analysis again" : `Analyse every slice (${test} test)`}
    </button>
  );

  if (!results) {
    return (
      <div className="card">
        <h2 className="card-title">Analysis</h2>
        <p className="muted">
          Runs the {test} test on every axial slice, then marks where the model looked on the slices where it found something.
        </p>
        {error}
        <div className="actions">{button}</div>
        {busy && <p className="fine">A whole scan takes about a minute, longer if the model server has just started.</p>}
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
      {sample && results.analysed_at && <p className="fine">Precomputed with the same model on {fmtDate(results.analysed_at)}. Run it again to analyse it live.</p>}
      {!sample && results.analysed_at && <p className="fine">Analysed {fmtDate(results.analysed_at)}.</p>}

      {onReview && <SeriesReviewBox saved={results.review} onSave={onReview} />}
      {error}
      <div className="actions">{button}</div>
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

function SeriesReviewBox({ saved, onSave }: { saved?: SeriesReview; onSave: (r: SeriesReview) => Promise<void> }) {
  const [verdict, setVerdict] = useState<SeriesReview["verdict"] | null>(saved?.verdict ?? null);
  const [note, setNote] = useState(saved?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty = verdict !== (saved?.verdict ?? null) || note !== (saved?.note ?? "");

  async function save() {
    if (!verdict) return;
    setBusy(true); setErr("");
    try {
      await onSave({ verdict, note: note.trim() || undefined, updated_at: new Date().toISOString() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="review">
      <p className="review-q">Do you agree with this result?</p>
      <div className="seg" role="radiogroup" aria-label="Your review">
        {VERDICTS.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={verdict === v} onClick={() => setVerdict(v)}>{text}</button>
        ))}
      </div>
      {verdict && (
        <>
          <label className="review-note">
            <span className="muted">Note (optional)</span>
            <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={verdict === "disagree" ? "What do you see instead?" : "Anything worth recording"} />
          </label>
          {err && <p className="review-err" role="alert">The review wasn&apos;t saved: {err}</p>}
          {dirty ? (
            <button type="button" className="btn btn-sm" onClick={save} disabled={busy}>{busy ? "Saving…" : saved ? "Update review" : "Save review"}</button>
          ) : (
            saved && <p className="muted review-saved">Review saved.</p>
          )}
        </>
      )}
    </div>
  );
}
