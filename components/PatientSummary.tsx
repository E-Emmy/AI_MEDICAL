"use client";
import { useState } from "react";
import type { Analysis, ReviewRow } from "@/lib/analysis";
import { summarise } from "@/lib/summary";

// The result in plain words, for explaining it to the patient.
export default function PatientSummary({ runs, reviews }: { runs: Analysis[]; reviews: Record<string, ReviewRow> | null }) {
  const [copied, setCopied] = useState(false);
  // Long summaries (one paragraph per test) show the start, and the rest on request.
  const [all, setAll] = useState(false);
  const text = summarise(runs, reviews);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text.join("\n\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <section className="card summary" aria-labelledby="summary-h">
      <div className="card-head">
        <h2 id="summary-h">For the patient</h2>
        <button type="button" className="btn btn-quiet btn-sm" onClick={copy}>{copied ? "Copied" : "Copy text"}</button>
      </div>
      {(all ? text : text.slice(0, 2)).map((p, i) => <p key={i}>{p}</p>)}
      {text.length > 2 && (
        <button type="button" className="link-btn" onClick={() => setAll(!all)}>{all ? "Show less" : "Show full summary"}</button>
      )}
      <p className="fine">Written from the results and your reviews. Read it through before sharing it.</p>
    </section>
  );
}
