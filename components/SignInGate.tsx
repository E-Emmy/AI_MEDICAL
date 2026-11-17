"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { findRole, sectionForPath, type Role } from "@/lib/roles";

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const MAIL = "M4 6h16v12H4zM4 7l8 6 8-6";
const LOCK = "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3";
const CHECK = "M5 12.5l4.5 4.5L19 7.5";
const ARROW = "M5 12h14M13 6l6 6-6 6";

// The sign-in box. Opening the site needs no sign-in; it appears over a section the first time someone
// opens it, with the demo account already filled in, so they only press "Sign in". New analysis and Full
// scans share the clinician account, so one sign-in opens both; the Anatomy lab has the student account.
// Someone signed in with the other role can switch or carry on as they are.
export default function SignInGate() {
  const path = usePathname();
  const router = useRouter();
  const section = sectionForPath(path);
  const need = section ? findRole(section.role) : undefined;
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Sections where the person chose to carry on with the role they already have.
  const [kept, setKept] = useState<Role[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Refill the demo account whenever the section changes.
  useEffect(() => {
    if (!need) return;
    setEmail(need.demo.email); setPassword(need.demo.password); setError(""); setShow(false);
  }, [need]);

  const current = findRole(session?.user?.user_metadata?.role);
  const open = !!need && session !== undefined && (!session || (current?.id !== need.id && !kept.includes(need.id)));

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open || !need || !section) return null;
  const role = need;

  async function setRole() {
    const { data } = await supabase.auth.getUser();
    if (data.user?.user_metadata?.role !== role.id) await supabase.auth.updateUser({ data: { role: role.id } });
    await supabase.auth.refreshSession();
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    const creds = { email: email.trim(), password };
    const { error: err } = await supabase.auth.signInWithPassword(creds);
    if (err) {
      const isDemo = creds.email === role.demo.email && creds.password === role.demo.password;
      if (!isDemo) {
        setBusy(false);
        return setError(/invalid login/i.test(err.message) ? "Wrong email or password." : err.message);
      }
      // The demo account hasn't been made in Supabase yet: fall back to a private demo session in this browser.
      if (!session?.user?.is_anonymous) {
        const { error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr) {
          setBusy(false);
          return setError("The demo account isn't set up yet. Add it in Supabase (Authentication > Users), or switch on anonymous sign-ins.");
        }
      }
    }
    await setRole();
    setBusy(false);
  }

  const other = current && current.id !== role.id ? current : undefined;

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-box">
        <aside className="gate-art">
          <img src={section.image} alt="" />
          <div className="gate-art-text">
            <span className="gate-role">{section.audience}</span>
            <p className="gate-art-title">{section.title}</p>
            <ul>
              {section.features.map((f) => <li key={f}><Icon d={CHECK} />{f}</li>)}
            </ul>
          </div>
        </aside>

        <form className="gate-form" onSubmit={signIn} noValidate>
          <button type="button" className="gate-close" aria-label="Close" onClick={() => router.push("/")}>×</button>
          <span className="gate-kicker">Orbi<span className="brand-accent">nova</span> Imaging</span>
          <h2 id="gate-title">Sign in to {section.title}</h2>
          <p className="gate-sub">{section.blurb}{role.id === "doctor" && " One clinician sign-in opens both New analysis and Full scans."}</p>

          {other && (
            <p className="gate-note">You&apos;re signed in as a {other.title.toLowerCase()}. Sign in as a {role.title.toLowerCase()} for this section, or carry on as you are.</p>
          )}

          <div className="gate-demo">
            <span className="gate-avatar" aria-hidden="true">{role.title[0]}</span>
            <span>
              <strong>{role.title} demo account</strong>
              <small>Details are filled in. Just press Sign in.</small>
            </span>
          </div>

          <label className="gate-field">
            <span>Email</span>
            <span className="gate-input">
              <Icon d={MAIL} />
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </span>
          </label>
          <label className="gate-field">
            <span>Password</span>
            <span className="gate-input">
              <Icon d={LOCK} />
              <input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="gate-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
            </span>
          </label>

          {error && <p className="auth-msg err" role="alert">{error}</p>}

          <button className="btn gate-submit" type="submit" disabled={busy}>
            {busy ? "Signing in…" : <>Sign in as {role.title.toLowerCase()} <Icon d={ARROW} /></>}
          </button>
          {other && (
            <button type="button" className="btn btn-quiet gate-submit" onClick={() => setKept([...kept, role.id])}>Continue as {other.title.toLowerCase()}</button>
          )}

          <p className="gate-secure">Demo data only. Scans stay private to the account.</p>
          <p className="gate-foot">Have your own account? <Link href="/login">Sign in here</Link></p>
          <p className="gate-foot"><Link href="/">Continue without signing in</Link></p>
        </form>
      </div>
    </div>
  );
}
