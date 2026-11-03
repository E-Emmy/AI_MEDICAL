import { capital, flaggedRuns, scanName, scanTitle, type Analysis, type ReviewRow } from "@/lib/analysis";
import { labelText } from "@/lib/format";
import type { Float } from "./Stage";

const VERDICT = { agree: "Agreed", disagree: "Disagreed", unsure: "Unsure" } as const;

// The result whose confidence the stage shows: the strongest finding, else the first test.
export function leadRun(runs: Analysis[]) {
  const flagged = flaggedRuns(runs);
  return flagged.sort((a, b) => b.predictions[0].score - a.predictions[0].score)[0] ?? runs[0];
}

export function floatsFor(runs: Analysis[], reviews: Record<string, ReviewRow> | null): Float[] {
  const lead = leadRun(runs);
  const top = lead.predictions[0];
  const flagged = flaggedRuns(runs).length > 0;
  const out: Float[] = [
    { title: "Result", value: scanTitle(runs, labelText), pos: "tl", tone: flagged ? "flag" : "ok" },
  ];
  if (top) out.push({ title: runs.length > 1 ? "Strongest score" : "Confidence", value: (top.score * 100).toFixed(1), unit: "%", pos: "tr" });
  out.push({ title: "Tests run", value: runs.length, unit: runs.length === 1 ? "test" : "tests", pos: "ml" });
  const check = runs[0].raw?.scan_check;
  out.push({ title: "Scan check", value: capital(scanName(runs[0])), unit: check ? `${Math.round(check.score * 100)}% match` : undefined, pos: "bl" });
  if (reviews) {
    const done = runs.filter((r) => reviews[r.id]);
    const value = done.length === 0 ? "Not reviewed"
      : runs.length === 1 ? VERDICT[reviews[runs[0].id].verdict]
      : `${done.length} of ${runs.length} reviewed`;
    out.push({ title: "Clinician review", value, pos: "br" });
  }
  return out;
}
