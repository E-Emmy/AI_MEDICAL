"use client";
import { useState } from "react";
import Link from "next/link";
import type { Region } from "@/lib/hf";
import { fmtDate, labelText, pct, shortModel } from "@/lib/format";
import ScanImage from "./ScanImage";
import Stage, { type Float } from "./Stage";
import { isNormal, type Heatmap, type ScanCheck, type TestInfo } from "@/lib/tests";
import type { Verdict } from "@/lib/analysis";

export type Row = {
  id: string; created_at: string; model: string; image_path: string;
  top_label: string | null; top_score: number | null; regions: Region[];
  test: TestInfo | null;
  heatmap: Heatmap | null;
  scan_check: ScanCheck | null;
};

type Props = {
  rows: Row[] | null; urls: Record<string, string>;
  // Null when reviews or cases aren't set up in the database yet.
  verdicts: Record<string, Verdict> | null; cases: number | null;
  error?: string;
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const VERDICT = { agree: "Agreed", disagree: "Disagreed", unsure: "Unsure" } as const;

// A scan can have several tests; most of the overview shows each scan once.
function byScan(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const r of rows) map.set(r.image_path, [...(map.get(r.image_path) ?? []), r]);
  return [...map.values()];
}

function headline(group: Row[]) {
  const flagged = group.filter((g) => g.top_label && !isNormal(g.top_label));
  if (group.length === 1) return group[0].top_label ? labelText(group[0].top_label) : "No finding";
  if (flagged.length === 0) return `No findings in ${group.length} tests`;
  if (flagged.length === 1) return `${labelText(flagged[0].top_label!)} flagged`;
  return `${flagged.length} of ${group.length} tests flagged a finding`;
}

const lead = (group: Row[]) =>
  group.filter((g) => g.top_label && !isNormal(g.top_label)).sort((a, b) => (b.top_score ?? 0) - (a.top_score ?? 0))[0] ?? group[0];

export default function DashboardView({ rows, urls, verdicts, cases, error }: Props) {
  const [onlyOpen, setOnlyOpen] = useState(false);
  const scans = rows ? byScan(rows) : [];
  const latest = scans[0];
  const recent = scans.slice(1, 3);

  // Results with an answer that no clinician has reviewed yet, oldest first.
  const open = verdicts ? (rows ?? []).filter((r) => r.top_label && !verdicts[r.id]).reverse() : [];
  const counts = { agree: 0, disagree: 0, unsure: 0 };
  for (const v of Object.values(verdicts ?? {})) counts[v]++;
  const reviewed = counts.agree + counts.disagree + counts.unsure;

  let summary = "Loading your analyses…";
  if (error) summary = "Your analyses couldn't be loaded.";
  else if (rows && rows.length === 0) summary = "Nothing analysed yet. Upload a scan or try a sample to get started.";
  else if (rows) summary = `${scans.length} ${scans.length === 1 ? "scan" : "scans"} and ${rows.length} test ${rows.length === 1 ? "result" : "results"}.`;

  let floats: Float[] = [];
  if (latest) {
    const l = lead(latest);
    const flagged = latest.some((g) => g.top_label && !isNormal(g.top_label));
    floats = [
      { title: "Latest result", value: headline(latest), pos: "tl", tone: flagged ? "flag" : "ok" },
      ...(l.top_score != null ? [{ title: "Confidence", value: (l.top_score * 100).toFixed(1), unit: "%", pos: "tr" as const }] : []),
      { title: "Tests run", value: latest.length, unit: latest.length === 1 ? "test" : "tests", pos: "ml" },
      { title: "Analysed", value: fmtDate(latest[0].created_at), pos: "bl" },
    ];
    if (verdicts) {
      const done = latest.filter((g) => verdicts[g.id]).length;
      floats.push({ title: "Clinician review", value: done === 0 ? "Not reviewed" : done === latest.length ? "Reviewed" : `${done} of ${latest.length} reviewed`, pos: "br" });
    }
  }
  const tableRows = (rows ?? []).filter((r) => !onlyOpen || (r.top_label && verdicts && !verdicts[r.id]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="lede" aria-live="polite">{summary}</p>
        </div>
        <Link className="btn" href="/upload">New analysis</Link>
      </div>

      {error && (
        <div className="callout bad" role="alert">
          <strong>Analyses couldn&apos;t be loaded</strong>
          {error}
        </div>
      )}

      {rows && rows.length === 0 && !error && (
        <Stage word="ScanLens">
          <div className="stage-empty">
            <p>Upload an X-ray, CT, MRI or photo and the findings appear here, with where each model looked marked on the scan.</p>
            <Link className="btn" href="/upload">Upload a scan</Link>
          </div>
        </Stage>
      )}

      {latest && (
        <div className="overview">
          <Link href={`/scan/${latest[0].id}`} className="overview-stage" aria-label={`Open the latest scan: ${headline(latest)}`}>
            <Stage word={latest[0].test?.scan_name ?? latest[0].scan_check?.name} confidence={lead(latest).top_score} floats={floats}>
              <ScanImage src={urls[latest[0].image_path]} alt="" natural heat={lead(latest).heatmap} regions={latest.flatMap((g) => g.regions)} />
            </Stage>
          </Link>

          <div className="tiles">
            {recent.map((group) => (
              <Link key={group[0].image_path} href={`/scan/${group[0].id}`} className="tile tile-scan">
                <ScanImage src={urls[group[0].image_path]} alt="" heat={lead(group).heatmap} heatCircleOnly />
                <span className="tile-title">{headline(group)}</span>
                <span className="muted small">{capital(group[0].test?.scan_name ?? "scan")}, {fmtDate(group[0].created_at)}</span>
              </Link>
            ))}

            {verdicts && (
              <div className="tile">
                <span className="tile-label">Waiting for review</span>
                <span className="tile-num">{open.length}<small>{open.length === 1 ? "result" : "results"}</small></span>
                {open.length > 0
                  ? <Link className="link-btn" href={`/scan/${open[0].id}`}>Review the oldest</Link>
                  : <span className="muted small">Everything has been reviewed.</span>}
              </div>
            )}

            {verdicts && (
              <div className="tile">
                <span className="tile-label">Clinician agreement</span>
                <span className="tile-num">{reviewed ? Math.round((counts.agree / reviewed) * 100) : 0}<small>% agreed</small></span>
                <span className="split-bar" role="img" aria-label={`${counts.agree} agreed, ${counts.disagree} disagreed, ${counts.unsure} unsure`}>
                  {reviewed > 0 && (["agree", "disagree", "unsure"] as const).map((v) => (
                    counts[v] > 0 && <i key={v} className={v} style={{ flexGrow: counts[v] }} />
                  ))}
                </span>
                <span className="muted small">{counts.agree} agreed, {counts.disagree} disagreed, {counts.unsure} unsure</span>
              </div>
            )}

            {cases != null && (
              <Link href="/cases" className="tile">
                <span className="tile-label">Patient cases</span>
                <span className="tile-num">{cases}<small>{cases === 1 ? "case" : "cases"}</small></span>
                <span className="link-btn">Open cases</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <section className="section" aria-labelledby="all">
          <div className="section-head">
            <h2 id="all" className="section-title">All results</h2>
            {verdicts && (
              <div className="seg" role="radiogroup" aria-label="Show">
                <button type="button" role="radio" aria-checked={!onlyOpen} onClick={() => setOnlyOpen(false)}>All</button>
                <button type="button" role="radio" aria-checked={onlyOpen} onClick={() => setOnlyOpen(true)}>Waiting for review</button>
              </div>
            )}
          </div>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr><th>Top finding</th><th>Confidence</th><th>Analysed</th><th className="col-model">Test</th>{verdicts && <th>Review</th>}</tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link className={r.top_label && !isNormal(r.top_label) ? "row-link flag-text" : "row-link"} href={`/scan/${r.id}`}>
                        {r.top_label ? labelText(r.top_label) : "No finding"}
                      </Link>
                    </td>
                    <td>
                      {r.top_score != null ? (
                        <><span className="meter" aria-hidden="true"><i style={{ width: `${r.top_score * 100}%` }} /></span>{pct(r.top_score)}</>
                      ) : <span className="muted">None</span>}
                    </td>
                    <td className="muted">{fmtDate(r.created_at)}</td>
                    <td className="col-model muted">{r.test ? `${r.test.name}, ${r.test.scan_name}` : shortModel(r.model)}</td>
                    {verdicts && <td>{verdicts[r.id] ? VERDICT[verdicts[r.id]] : <span className="muted">Not yet</span>}</td>}
                  </tr>
                ))}
                {tableRows.length === 0 && <tr><td colSpan={5} className="muted">Every result has been reviewed.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
