"use client";
import Link from "next/link";
import { SERIES_SAMPLES } from "@/lib/seriesSamples";

export default function FullScans() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Full scans</h1>
          <p className="lede">Open a whole CT or MRI series in 3D. Turn it to any side, zoom in, and move through every slice.</p>
        </div>
        <Link className="btn" href="/series/upload">Open your own scan</Link>
      </div>

      <section className="samples" aria-labelledby="samples-h">
        <h2 id="samples-h" className="section-title">Sample full scans</h2>
        <p className="muted">
          Anonymised scans from public research datasets. To try opening one yourself,{" "}
          <Link href="/series/upload#try-h">download it as a DICOM folder</Link>.
        </p>
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
