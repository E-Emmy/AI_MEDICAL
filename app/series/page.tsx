"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { fmtDate } from "@/lib/format";
import { KIND_NAMES } from "@/lib/series";
import { SERIES_SAMPLES } from "@/lib/seriesSamples";
import { SERIES_COLUMNS, SERIES_MISSING, type SeriesRow } from "@/lib/seriesApi";

export default function FullScans() {
  const session = useSession();
  const [rows, setRows] = useState<SeriesRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!session) return;
    supabase.from("series").select(SERIES_COLUMNS).order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) return setErr(error.code === "PGRST205" ? SERIES_MISSING : error.message);
      setRows(data as SeriesRow[]);
    });
  }, [session]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Full scans</h1>
          <p className="lede">Open a whole CT or MRI series in 3D. Turn it to any side, zoom in, and move through every slice.</p>
        </div>
        <Link className="btn" href="/series/upload">Upload a full scan</Link>
      </div>

      <section aria-labelledby="mine-h">
        <h2 id="mine-h" className="section-title">Your full scans</h2>
        {err && <div className="callout bad" role="alert"><strong>Full scans couldn&apos;t be loaded</strong>{err}</div>}
        {!err && !rows && <p className="muted">Loading…</p>}
        {rows && rows.length === 0 && <p className="empty">No full scans yet. Upload a folder of DICOM slices or a .nii.gz file, or open a sample below.</p>}
        {rows && rows.length > 0 && (
          <ul className="case-list">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/series/${r.id}`} className="case-row">
                  <span className="case-name">{r.label || KIND_NAMES[r.kind]}</span>
                  <span className="case-count"><b>{r.facts.size?.[2]}</b> slices</span>
                  <span className="muted small">{KIND_NAMES[r.kind]} · {fmtDate(r.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="samples" aria-labelledby="samples-h">
        <h2 id="samples-h" className="section-title">Sample full scans</h2>
        <p className="muted">Anonymised scans from public research datasets.</p>
        <ul className="sample-grid">
          {SERIES_SAMPLES.map((s) => (
            <li key={s.id}>
              <Link className="sample" href={`/series/${s.id}`}>
                <img src={s.thumb} alt="" loading="lazy" />
                <strong>{s.title}</strong>
                <span className="muted">{s.finding}</span>
                <span className="muted">{s.facts.size[2]} slices</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
