"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { fmtDate, labelText, pct } from "@/lib/format";
import { capital, scanName, scanTitle, testName, type Analysis, type Case } from "@/lib/analysis";
import { isNormal } from "@/lib/tests";
import ScanImage from "@/components/ScanImage";
import Stage from "@/components/Stage";
import { leadRun } from "@/components/floats";
import ZoomView from "@/components/ZoomView";

// One scan in the case: every test run on the same image.
type ScanGroup = { path: string; runs: Analysis[]; date: string };

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const router = useRouter();
  const want = useSearchParams().get("compare");
  const [found, setFound] = useState<Case | null>(null);
  const [scans, setScans] = useState<ScanGroup[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [noteMsg, setNoteMsg] = useState("");

  useEffect(() => {
    if (!session) return;
    (async () => {
      const c = await supabase.from("cases").select("id,label,note,created_at").eq("id", id).single();
      if (c.error || !c.data) return setErr("This case doesn't exist, or it belongs to another account.");
      setFound(c.data as Case);
      setNote(c.data.note ?? "");
      const a = await supabase.from("analyses").select("*").eq("case_id", id).order("created_at");
      const groups: ScanGroup[] = [];
      for (const r of (a.data as Analysis[]) ?? []) {
        const g = groups.find((x) => x.path === r.image_path);
        if (g) g.runs.push(r);
        else groups.push({ path: r.image_path, runs: [r], date: r.created_at });
      }
      setScans(groups);
      // Compare the chosen scan with the one before it, else the first with the latest.
      if (groups.length >= 2) {
        const at = groups.findIndex((g) => g.runs.some((r) => r.id === want));
        setPair(at > 0 ? [groups[at - 1].path, groups[at].path] : at === 0 ? [groups[0].path, groups[1].path] : [groups[0].path, groups[groups.length - 1].path]);
      }
      if (groups.length) {
        const signed = await supabase.storage.from("scans").createSignedUrls(groups.map((g) => g.path), 600);
        const map: Record<string, string> = {};
        for (const s of signed.data ?? []) if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
        setUrls(map);
      }
    })();
  }, [session, id, want]);

  async function saveNote() {
    const { error } = await supabase.from("cases").update({ note: note.trim() || null }).eq("id", id);
    setNoteMsg(error ? `The note wasn't saved: ${error.message}` : "Note saved.");
  }

  async function deleteCase() {
    if (!window.confirm("Delete this case? Its scans and results are kept and move out of the case.")) return;
    const { error } = await supabase.from("cases").delete().eq("id", id);
    if (error) return setNoteMsg(`The case wasn't deleted: ${error.message}`);
    router.replace("/cases");
  }

  // Clicking a scan swaps it into whichever side it isn't, keeping the older one on the left.
  function choose(path: string) {
    if (!pair || !scans || pair.includes(path)) return;
    const order = (p: string) => scans.findIndex((g) => g.path === p);
    const keep = order(path) < order(pair[1]) ? pair[1] : pair[0];
    setPair([path, keep].sort((x, y) => order(x) - order(y)) as [string, string]);
  }

  const back = (
    <Link className="back" href="/cases">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      Cases
    </Link>
  );
  if (err) return <>{back}<div className="callout bad" role="alert"><strong>Case not found</strong>{err}</div></>;
  if (!found || !scans) return <>{back}<p className="muted">Loading the case…</p></>;

  const left = scans.find((g) => g.path === pair?.[0]);
  const right = scans.find((g) => g.path === pair?.[1]);

  return (
    <>
      {back}
      <div className="page-head">
        <div>
          <h1>{found.label}</h1>
          <p className="lede">{scans.length} {scans.length === 1 ? "scan" : "scans"} in this case. Created {fmtDate(found.created_at)}.</p>
        </div>
        <div className="head-actions">
          <Link className="btn" href={`/upload?case=${id}`}>Add a scan</Link>
        </div>
      </div>

      {scans.length === 0 && <p className="empty">No scans in this case yet. Add one, or open a scan and choose this case for it.</p>}

      {scans.length > 0 && (
        <section aria-labelledby="timeline-h">
          <h2 id="timeline-h" className="section-title">Timeline</h2>
          <ol className="timeline">
            {scans.map((g, i) => {
              const on = pair?.includes(g.path);
              return (
                <li key={g.path} className={on ? "on" : undefined}>
                  <button type="button" className="tl-thumb" onClick={() => choose(g.path)} disabled={!pair} aria-pressed={on}
                    aria-label={`Compare scan ${i + 1}, ${fmtDate(g.date)}`}>
                    <ScanImage src={urls[g.path]} alt="" heatCircleOnly heat={leadRun(g.runs).raw?.heatmap ?? null} />
                  </button>
                  <span className="tl-step">{i + 1}</span>
                  <Link href={`/scan/${g.runs[0].id}`} className="tl-title">{scanTitle(g.runs, labelText)}</Link>
                  <span className="muted small">{capital(scanName(g.runs[0]))}, {fmtDate(g.date)}</span>
                </li>
              );
            })}
          </ol>
          {pair && <p className="fine">Choose any two scans on the timeline to compare them.</p>}
        </section>
      )}

      {left && right && (
        <section className="section" aria-labelledby="compare-h">
          <h2 id="compare-h" className="section-title">Side by side</h2>
          <div className="compare">
            {[left, right].map((g) => (
              <div key={g.path} className="compare-col">
                <Stage compact word={scanName(g.runs[0])} confidence={leadRun(g.runs).predictions[0]?.score}>
                  <ZoomView label={`${capital(scanName(g.runs[0]))}, ${fmtDate(g.date)}`}>
                    <ScanImage src={urls[g.path]} alt={`Scan from ${fmtDate(g.date)}`} natural heat={leadRun(g.runs).raw?.heatmap ?? null}
                      overlays={{ bl: fmtDate(g.date) }} />
                  </ZoomView>
                </Stage>
                <Link href={`/scan/${g.runs[0].id}`} className="compare-title">{scanTitle(g.runs, labelText)}</Link>
              </div>
            ))}
          </div>
          <Changes before={left.runs} after={right.runs} />
        </section>
      )}

      <section className="section card case-note" aria-labelledby="note-h">
        <h2 id="note-h" className="card-title">Case note</h2>
        <textarea rows={3} maxLength={2000} value={note} onChange={(e) => { setNote(e.target.value); setNoteMsg(""); }} aria-labelledby="note-h" />
        <div className="actions-row">
          <button type="button" className="btn btn-sm" onClick={saveNote}>Save note</button>
          <button type="button" className="btn btn-quiet btn-sm btn-danger" onClick={deleteCase}>Delete case</button>
          {noteMsg && <span className="muted small" role="status">{noteMsg}</span>}
        </div>
      </section>
    </>
  );
}

// For each test run on both scans: what it said before and after.
function Changes({ before, after }: { before: Analysis[]; after: Analysis[] }) {
  const tests = after.filter((a) => before.some((b) => testName(b) === testName(a)));
  if (tests.length === 0) {
    return <p className="fine">These scans weren&apos;t checked with the same test, so their results can&apos;t be lined up.</p>;
  }
  return (
    <table className="changes">
      <thead><tr><th>Test</th><th>Earlier</th><th>Later</th><th>Change</th></tr></thead>
      <tbody>
        {tests.map((a) => {
          const b = before.find((x) => testName(x) === testName(a))!;
          const tb = b.predictions[0], ta = a.predictions[0];
          let change = "Same result";
          if (tb && ta && tb.label !== ta.label) change = isNormal(ta.label) ? "Finding no longer seen" : isNormal(tb.label) ? "New finding" : "Different finding";
          else if (tb && ta) {
            const d = (ta.score - tb.score) * 100;
            change = Math.abs(d) < 1 ? "Same result" : `Same result, ${d > 0 ? "up" : "down"} ${Math.abs(d).toFixed(1)} points`;
          }
          return (
            <tr key={a.id}>
              <td>{testName(a)}</td>
              <td>{tb ? `${labelText(tb.label)} ${pct(tb.score, 0)}` : "None"}</td>
              <td>{ta ? `${labelText(ta.label)} ${pct(ta.score, 0)}` : "None"}</td>
              <td className={change === "New finding" ? "flag-text" : undefined}>{change}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
