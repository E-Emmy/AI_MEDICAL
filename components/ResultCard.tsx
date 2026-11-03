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
};

export default function ResultCard({ run: r, heatOn, onHeat, review }: Props) {
  const [open, setOpen] = useState(false);
  const top = r.predictions[0];
  const normal = !top || isNormal(top.label);
  const shown = open ? r.predictions : r.predictions.filter((p, i) => i === 0 || p.score >= SHOWN_MIN);
  const hidden = r.predictions.length - shown.length;

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
    </section>
  );
}
