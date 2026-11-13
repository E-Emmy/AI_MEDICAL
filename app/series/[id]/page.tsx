"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { fmtDate } from "@/lib/format";
import { KIND_NAMES, type SeriesFacts, type SeriesKind } from "@/lib/series";
import SeriesFactsList from "@/components/SeriesFacts";
import { findSeriesSample, type SeriesSample } from "@/lib/seriesSamples";
import { SERIES_COLUMNS, SERIES_MISSING, seriesLink, type SeriesRow } from "@/lib/seriesApi";
import SeriesAnalysis from "@/components/SeriesAnalysis";
import { findingPosition, type FlaggedSlice, type SeriesResults, type SeriesReview } from "@/lib/seriesResults";

const SeriesViewer = dynamic(() => import("@/components/SeriesViewer"), { ssr: false });

export default function FullScan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const router = useRouter();
  const sample = findSeriesSample(id);
  const [row, setRow] = useState<SeriesRow | null>(null);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SeriesResults | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisErr, setAnalysisErr] = useState("");
  const [showFindings, setShowFindings] = useState(true);
  const [focus, setFocus] = useState<{ pos: [number, number, number]; n: number } | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        let key = sample?.key;
        if (!sample) {
          const { data, error } = await supabase.from("series").select(SERIES_COLUMNS).eq("id", id).maybeSingle();
          if (error) return setErr(error.code === "PGRST205" ? SERIES_MISSING : error.message);
          if (!data) return setErr("This full scan doesn't exist, or it isn't yours.");
          setRow(data as SeriesRow);
          setResults((data as SeriesRow).results);
          key = (data as SeriesRow).object_key;
        } else {
          fetch(sample.results).then((r) => (r.ok ? r.json() : null)).then(setResults).catch(() => {});
        }
        setUrl((await seriesLink("view", key)).url!);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [session, id, sample]);

  async function analyse() {
    setAnalysing(true); setAnalysisErr("");
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/series/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "The analysis failed. Try again.");
      setResults(body.results);
      setShowFindings(true);
    } catch (e) {
      setAnalysisErr(e instanceof Error ? e.message : String(e));
    }
    setAnalysing(false);
  }

  function focusOn(f: FlaggedSlice) {
    if (results) setFocus({ pos: findingPosition(results, f), n: Date.now() });
  }

  async function review(r: SeriesReview) {
    if (!row || !results) return;
    const next = { ...results, review: r };
    const { error } = await supabase.from("series").update({ results: next }).eq("id", row.id);
    if (error) throw new Error(error.message);
    setResults(next);
  }

  async function del() {
    if (!row || !confirm("Delete this full scan? This can't be undone.")) return;
    setBusy(true);
    try {
      await seriesLink("delete", row.object_key);
      const { error } = await supabase.from("series").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
      router.replace("/series");
    } catch (e) {
      setBusy(false);
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const kind: SeriesKind | undefined = sample?.kind ?? row?.kind;
  const facts: SeriesFacts | undefined = sample?.facts ?? row?.facts;
  const title = sample ? `${sample.title} · sample` : row ? row.label || KIND_NAMES[row.kind] : "Full scan";

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small"><Link href="/series">Full scans</Link></p>
          <h1>{title}</h1>
          {sample && <p className="lede">{sample.finding}.</p>}
        </div>
      </div>
      {err && <div className="callout bad" role="alert"><strong>The scan couldn&apos;t be opened</strong>{err}</div>}

      {!err && kind && facts && (
        <div className="scan-layout series-layout">
          <div className="scan-main">
            {url ? (
              <SeriesViewer url={url} kind={kind} results={results} showFindings={showFindings} focus={focus} />
            ) : (
              <div className="viewer-placeholder">Loading scan…</div>
            )}
          </div>
          <aside className="scan-side">
            <div className="card">
              <h2 className="card-title">About this scan</h2>
              <SeriesFactsList kind={kind} facts={facts} />
              {row && <p className="small muted">Uploaded {fmtDate(row.created_at)}</p>}
            </div>
            <SeriesAnalysis kind={kind} results={results} sample={!!sample} busy={analysing} err={analysisErr} onAnalyse={analyse}
              showFindings={showFindings} onShowFindings={setShowFindings} onFocus={focusOn} onReview={row ? review : undefined} />
            {sample && <Credit sample={sample} />}
            {row && <button className="btn btn-danger" onClick={del} disabled={busy}>{busy ? "Deleting…" : "Delete this full scan"}</button>}
          </aside>
        </div>
      )}
    </>
  );
}

function Credit({ sample }: { sample: SeriesSample }) {
  return (
    <p className="fine">
      Source: <a href={sample.url} target="_blank" rel="noreferrer">{sample.credit}</a>.
    </p>
  );
}
