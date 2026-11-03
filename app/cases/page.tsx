"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { fmtDate } from "@/lib/format";
import type { Case } from "@/lib/analysis";

type Summary = Case & { scans: number; last: string | null };

const MISSING = "Cases aren't set up in your Supabase project yet. Run supabase/migrations/003_cases_and_shares.sql in the Supabase SQL editor, then reload this page.";

export default function Cases() {
  const session = useSession();
  const [cases, setCases] = useState<Summary[] | null>(null);
  const [err, setErr] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    if (!session) return;
    (async () => {
      const c = await supabase.from("cases").select("id,label,note,created_at").order("created_at", { ascending: false });
      if (c.error) return setErr(c.error.code === "PGRST205" ? MISSING : c.error.message);
      const a = await supabase.from("analyses").select("case_id,image_path,created_at").not("case_id", "is", null);
      const scans = new Map<string, Set<string>>();
      const last = new Map<string, string>();
      for (const r of (a.data as { case_id: string; image_path: string; created_at: string }[]) ?? []) {
        scans.set(r.case_id, (scans.get(r.case_id) ?? new Set()).add(r.image_path));
        if (!last.has(r.case_id) || r.created_at > last.get(r.case_id)!) last.set(r.case_id, r.created_at);
      }
      setCases((c.data as Case[]).map((x) => ({ ...x, scans: scans.get(x.id)?.size ?? 0, last: last.get(x.id) ?? null })));
    })();
  }, [session]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return setFormErr("Give the case a reference, such as a ward bed or your own patient code.");
    setBusy(true); setFormErr("");
    const { data, error } = await supabase.from("cases").insert({ label: label.trim(), note: note.trim() || null })
      .select("id,label,note,created_at").single();
    setBusy(false);
    if (error) return setFormErr(error.message);
    setCases([{ ...(data as Case), scans: 0, last: null }, ...(cases ?? [])]);
    setLabel(""); setNote("");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cases</h1>
          <p className="lede">Group a patient&apos;s scans under one reference to follow them over time and compare them side by side.</p>
        </div>
      </div>
      {err && <div className="callout bad" role="alert"><strong>Cases couldn&apos;t be loaded</strong>{err}</div>}

      {!err && (
        <div className="cases-layout">
          <section aria-label="Your cases">
            {!cases && <p className="muted">Loading cases…</p>}
            {cases && cases.length === 0 && <p className="empty">No cases yet. Create one, then choose it when you upload a scan.</p>}
            {cases && cases.length > 0 && (
              <ul className="case-list">
                {cases.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cases/${c.id}`} className="case-row">
                      <span className="case-name">{c.label}</span>
                      <span className="case-count"><b>{c.scans}</b> {c.scans === 1 ? "scan" : "scans"}</span>
                      <span className="muted small">{c.last ? `Last scan ${fmtDate(c.last)}` : `Created ${fmtDate(c.created_at)}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form className="card" onSubmit={create} aria-labelledby="new-case">
            <h2 id="new-case" className="card-title">New case</h2>
            <div className="field">
              <label htmlFor="label">Reference</label>
              <input id="label" maxLength={80} placeholder="e.g. Bed 12 or your own code" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="note">Note (optional)</label>
              <textarea id="note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <p className="fine">Don&apos;t use names or ID numbers. Share links never show the reference.</p>
            {formErr && <p className="review-err" role="alert">{formErr}</p>}
            <button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Create case"}</button>
          </form>
        </div>
      )}
    </>
  );
}
