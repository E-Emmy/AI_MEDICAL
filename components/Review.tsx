"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ReviewRow, Verdict } from "@/lib/analysis";

const VERDICTS: [Verdict, string][] = [["agree", "Agree"], ["disagree", "Disagree"], ["unsure", "Unsure"]];

// A clinician's call on one test result: the model suggests, a person decides.
export default function Review({ analysisId, saved, onSaved }: { analysisId: string; saved?: ReviewRow; onSaved: (r: ReviewRow) => void }) {
  const [verdict, setVerdict] = useState<Verdict | null>(saved?.verdict ?? null);
  const [note, setNote] = useState(saved?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty = verdict !== (saved?.verdict ?? null) || note !== (saved?.note ?? "");

  async function save() {
    if (!verdict) return;
    setBusy(true); setErr("");
    const { data, error } = await supabase
      .from("reviews")
      .upsert({ analysis_id: analysisId, verdict, note: note.trim() || null, updated_at: new Date().toISOString() })
      .select("analysis_id,verdict,note,updated_at")
      .single();
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved(data as ReviewRow);
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
