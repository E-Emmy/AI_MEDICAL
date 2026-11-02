"use client";
import Link from "next/link";
import type { Region } from "@/lib/hf";
import { fmtDate, labelText, pct, shortModel } from "@/lib/format";
import ScanImage from "./ScanImage";
import { isNormal, type Heatmap, type TestInfo } from "@/lib/tests";

export type Row = {
  id: string; created_at: string; model: string; image_path: string;
  top_label: string | null; top_score: number | null; regions: Region[];
  test: TestInfo | null;
  heatmap: Heatmap | null;
};

type Props = { rows: Row[] | null; urls: Record<string, string>; error?: string };

const LIGHTBOX_SIZE = 4;

export default function DashboardView({ rows, urls, error }: Props) {
  // A scan can have several tests; the lightbox shows each scan once.
  const perScan = new Map<string, Row[]>();
  for (const r of rows ?? []) perScan.set(r.image_path, [...(perScan.get(r.image_path) ?? []), r]);
  const latest = [...perScan.values()].slice(0, LIGHTBOX_SIZE);
  const marked = rows?.filter((r) => r.regions?.length > 0).length ?? 0;

  let summary = "Loading your analyses…";
  if (error) summary = "Your analyses couldn't be loaded.";
  else if (rows && rows.length === 0) summary = "Nothing analysed yet.";
  else if (rows) {
    const scans = perScan.size;
    summary = `${scans} ${scans === 1 ? "scan" : "scans"} and ${rows.length} test ${rows.length === 1 ? "result" : "results"}`;
    summary += marked ? `, ${marked} with marked regions.` : ".";
    summary += " The newest scans are on the lightbox.";
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your analyses</h1>
          <p className="lede" aria-live="polite">{summary}</p>
        </div>
        <Link className="btn" href="/upload">Upload a scan</Link>
      </div>

      {error && (
        <div className="callout bad" role="alert">
          <strong>Analyses couldn't be loaded</strong>
          {error}
        </div>
      )}

      <section aria-labelledby="latest">
        <h2 id="latest" className="sr-only">Latest scans</h2>
        <div className={rows && rows.length > 0 ? "lightbox power-on" : "lightbox"}>
          <div className="films">
            {Array.from({ length: LIGHTBOX_SIZE }, (_, i) => {
              const group = latest[i];
              if (!group) return <div key={i} className="slot" aria-hidden="true" />;
              const r = group[0];
              // For several tests on one scan, lead with whatever was flagged rather than a test count.
              const flagged = group.find((g) => g.top_label && !isNormal(g.top_label));
              let tl = r.top_label ? labelText(r.top_label) : "No finding";
              if (group.length > 1) tl = flagged ? labelText(flagged.top_label!) : `No findings in ${group.length} tests`;
              const heat = (flagged ?? r).heatmap ?? group.find((g) => g.heatmap)?.heatmap ?? null;
              return (
                <Link key={r.image_path} href={`/scan/${r.id}`} className="film" aria-label={`${tl}, analysed ${fmtDate(r.created_at)}`}>
                  <ScanImage
                    src={urls[r.image_path]}
                    alt=""
                    regions={group.flatMap((g) => g.regions)}
                    heat={heat}
                    heatCircleOnly
                    overlays={{
                      tl,
                      tr: group.length > 1 ? (flagged ? pct(flagged.top_score, 0) : "") : pct(r.top_score, 0),
                      bl: fmtDate(r.created_at),
                      br: group.length > 1 ? r.test?.scan_name : r.test?.name ?? shortModel(r.model),
                    }}
                  />
                </Link>
              );
            })}
          </div>
          {rows && rows.length === 0 && !error && (
            <div className="lightbox-empty">
              <p>Upload an X-ray or CT image and the model&apos;s findings will appear here, with any regions it marks drawn on the scan.</p>
            </div>
          )}
        </div>
      </section>

      {rows && rows.length > 0 && (
        <section className="section" aria-labelledby="all">
          <h2 id="all" className="section-title">All analyses</h2>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr><th>Top finding</th><th>Confidence</th><th>Analysed</th><th className="col-model">Test</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link className="row-link" href={`/scan/${r.id}`}>{r.top_label ? labelText(r.top_label) : "No finding"}</Link></td>
                    <td>
                      {r.top_score != null ? (
                        <><span className="meter" aria-hidden="true"><i style={{ width: `${r.top_score * 100}%` }} /></span>{pct(r.top_score)}</>
                      ) : <span className="muted">None</span>}
                    </td>
                    <td className="muted">{fmtDate(r.created_at)}</td>
                    <td className="col-model muted">{r.test ? `${r.test.name}, ${r.test.scan_name}` : shortModel(r.model)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
