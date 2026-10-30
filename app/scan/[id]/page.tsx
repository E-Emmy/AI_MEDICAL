"use client";
import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import type { Prediction, Region } from "@/lib/hf";

type Analysis = {
  id: string; image_path: string; model: string; created_at: string;
  predictions: Prediction[]; regions: Region[];
};

export default function Scan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const [a, setA] = useState<Analysis | null>(null);
  const [url, setUrl] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await supabase.from("analyses").select("*").eq("id", id).single();
      if (error || !data) return setErr("Analysis not found.");
      setA(data as Analysis);
      const s = await supabase.storage.from("scans").createSignedUrl(data.image_path, 600);
      if (s.data) setUrl(s.data.signedUrl);
    })();
  }, [session, id]);

  if (err) return <p className="err">{err}</p>;
  if (!a) return <p>Loading…</p>;

  return (
    <>
      <h1>Results</h1>
      <div className="grid">
        <div>
          <div className="viewer">
            {url && <img src={url} alt="Uploaded scan" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />}
            {size.w > 0 && a.regions.length > 0 && (
              <svg viewBox={`0 0 ${size.w} ${size.h}`} aria-label="Regions flagged by the model">
                {a.regions.map((r, i) => (
                  <g key={i}>
                    <rect x={r.box.xmin} y={r.box.ymin} width={r.box.xmax - r.box.xmin} height={r.box.ymax - r.box.ymin}
                      fill="none" stroke="#FFB020" strokeWidth={Math.max(2, size.w / 250)} />
                    <text x={r.box.xmin + 4} y={Math.max(14, r.box.ymin - 6)} fill="#FFB020" fontSize={Math.max(14, size.w / 40)}>
                      {r.label} {(r.score * 100).toFixed(0)}%
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </div>
          {a.regions.length === 0 && <p style={{ color: "var(--muted)" }}>This model does not provide region highlights.</p>}
        </div>
        <div className="panel">
          <h2 style={{ fontSize: 18, marginTop: 0 }}>AI findings</h2>
          {a.predictions.length === 0 && <p>The model returned no findings.</p>}
          {a.predictions.slice(0, 8).map((p) => (
            <div key={p.label}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{p.label}</span><span>{(p.score * 100).toFixed(1)}%</span>
              </div>
              <div className="bar"><i style={{ width: `${p.score * 100}%` }} /></div>
            </div>
          ))}
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Model: {a.model}<br />{new Date(a.created_at).toLocaleString()}</p>
        </div>
      </div>
    </>
  );
}
