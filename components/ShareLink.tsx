"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";

type Share = { token: string; expires_at: string };

const DAYS = 7;
const MISSING = "Share links are switched off: run supabase/migrations/003_cases_and_shares.sql in the Supabase SQL editor to turn them on.";

// Read-only links to one scan and its results, for a second opinion. Anyone with the link can
// open it until it expires, so the panel says so plainly.
export default function ShareLink({ imagePath }: { imagePath: string }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    supabase.from("shares").select("token,expires_at").eq("image_path", imagePath).gt("expires_at", new Date().toISOString())
      .order("created_at").then(({ data, error }) => {
        if (error) setErr(error.code === "PGRST205" ? MISSING : error.message);
        else setShares(data as Share[]);
      });
  }, [imagePath]);

  const link = (t: string) => `${window.location.origin}/share/${t}`;

  async function create() {
    setBusy(true); setErr("");
    // The viewer's image link expires with the share, and is made now while you're signed in.
    const signed = await supabase.storage.from("scans").createSignedUrl(imagePath, DAYS * 86400);
    if (signed.error || !signed.data) { setBusy(false); return setErr(signed.error?.message ?? "The image link couldn't be made."); }
    const expires = new Date(Date.now() + DAYS * 86400 * 1000 - 60_000).toISOString();
    const { data, error } = await supabase.from("shares")
      .insert({ image_path: imagePath, image_url: signed.data.signedUrl, expires_at: expires })
      .select("token,expires_at").single();
    setBusy(false);
    if (error) return setErr(error.code === "PGRST205" ? MISSING : error.message);
    setShares([...(shares ?? []), data as Share]);
    copy((data as Share).token);
  }

  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(link(t));
      setCopied(t);
      setTimeout(() => setCopied(""), 2000);
    } catch {}
  }

  async function turnOff(t: string) {
    const { error } = await supabase.from("shares").delete().eq("token", t);
    if (error) return setErr(error.message);
    setShares((shares ?? []).filter((s) => s.token !== t));
  }

  return (
    <section className="card" aria-labelledby="share-h">
      <div className="card-head">
        <h2 id="share-h">Second opinion</h2>
        {shares && <button type="button" className="btn btn-sm" onClick={create} disabled={busy}>{busy ? "Making link…" : "Make share link"}</button>}
      </div>
      <p className="muted small">
        Anyone with the link can see this scan, its results and your reviews for {DAYS} days, without signing in. The case name isn&apos;t shown.
      </p>
      {err && <p className="review-err" role="alert">{err}</p>}
      {shares && shares.length > 0 && (
        <ul className="shares">
          {shares.map((s) => (
            <li key={s.token}>
              <span className="muted small">Until {fmtDate(s.expires_at)}</span>
              <span className="share-actions">
                <button type="button" className="link-btn" onClick={() => copy(s.token)}>{copied === s.token ? "Link copied" : "Copy link"}</button>
                <button type="button" className="link-btn danger" onClick={() => turnOff(s.token)}>Turn off</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
