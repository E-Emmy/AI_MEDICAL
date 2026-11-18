"use client";
import { useState } from "react";
import { testName, type Analysis, type ReviewRow } from "@/lib/analysis";
import { labelText, pct, shortModel } from "@/lib/format";
import { isNormal } from "@/lib/tests";
import Review from "./Review";

// Long lists (like the 14 conditions) hide the near-zero rows behind one line.
const SHOWN_MIN = 0.01;
const VERDICT = { agree: "agrees", disagree: "disagrees", unsure: "is unsure" } as const;

type Props = {
  run: Analysis;
  heatOn: boolean;
  onHeat: (on: boolean) => void;
  // Omitted when reviews are switched off; read-only on share links.
  review?: { saved?: ReviewRow; onSaved?: (r: ReviewRow) => void };
  // When given, the card folds down to one line (test, answer, score) and opens on click, so several
  // results fit on one screen. Without it the card is always open (a single result).
  expanded?: boolean;
  onToggle?: () => void;
};

const REVIEWED = { agree: "Agreed", disagree: "Disagreed", unsure: "Unsure" } as const;

export default function ResultCard({ run: r, heatOn, onHeat, review, expanded, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const top = r.predictions[0];
  const normal = !top || isNormal(top.label);
  const shown = open ? r.predictions : r.predictions.filter((p, i) => i === 0 || p.score >= SHOWN_MIN);
  const hidden = r.predictions.length - shown.length;
  const folded = !!onToggle && !expanded;
  const body = () => (
    <>
      {onToggle && <p className="result-model">{shortModel(r.model)}</p>}
      {shown.slice(top ? 1 : 0).map((p) => (
        <div key={p.label} className="finding">
          <div className="finding-row"><span>{labelText(p.label)}</span><span>{pct(p.score)}</span></div>
          <span className="meter" aria-hidden="true"><i style={{ width: `${p.score * 100}%` }} /></span>
        </div>
      ))}
      {(hidden > 0 || open) && (
        <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
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
          <input type="checkbox" checked={heatOn} onChange={(e) => onHeat(e.target.checked)} />
        </label>
      )}
      {top && review?.onSaved && (
        <Review analysisId={r.id} saved={review.saved} onSaved={review.onSaved} />
      )}
      {top && review && !review.onSaved && review.saved && (
        <p className="review-readonly">
          The clinician {VERDICT[review.saved.verdict]} with this result.
          {review.saved.note && <> Note: <q>{review.saved.note}</q></>}
        </p>
      )}
    </>
  );

  if (onToggle) {
    const verdict = review?.saved?.verdict;
    return (
      <section className={`result fold${normal ? "" : " flagged"}${expanded ? " open" : ""}`} aria-label={`${testName(r)} test`}>
        <button type="button" className="fold-head" onClick={onToggle} aria-expanded={!!expanded}>
          <span className="fold-name">
            <strong>{testName(r)}</strong>
            <small>{top ? labelText(top.label) : "No result"}{verdict && <em className={`fold-rev ${verdict}`}>{REVIEWED[verdict]}</em>}</small>
          </span>
          {top && <span className="fold-score">{(top.score * 100).toFixed(1)}<small>%</small></span>}
          <span className="fold-dot" role="img" aria-label={normal ? "Nothing found" : "Finding"} title={normal ? "Nothing found" : "Finding"} />
          <svg className="fold-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {!folded && <div className="fold-body">{body()}</div>}
      </section>
    );
  }

  return (
    <section className={normal ? "result" : "result flagged"} aria-label={`${testName(r)} test`}>
      <header className="result-head">
        <div>
          <h2>{testName(r)}</h2>
          <p className="result-model">{shortModel(r.model)}</p>
        </div>
        {top && <span className="tag">{normal ? "Nothing found" : "Finding"}</span>}
      </header>
      {top ? (
        <p className="verdict">
          <strong>{labelText(top.label)}</strong>
          <span className="big-num">{(top.score * 100).toFixed(1)}<small>%</small></span>
        </p>
      ) : (
        <p className="muted">The model returned no findings for this scan.</p>
      )}
      {body()}
    </section>
  );
}
