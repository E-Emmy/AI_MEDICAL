"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

type Msg = { type: "err" | "ok"; text: string } | null;

function friendly(m: string) {
  if (/invalid login/i.test(m)) return "Wrong email or password. If this user was created in the Supabase dashboard, delete it and create the account here instead.";
  if (/not confirmed/i.test(m)) return "Confirm your email first, then sign in. Check your inbox.";
  if (/rate limit/i.test(m)) return "Too many attempts. Wait a minute and try again.";
  return m;
}

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!email.trim() || password.length < 6) {
      return setMsg({ type: "err", text: "Enter your email and a password of at least 6 characters." });
    }
    setBusy(true);
    const creds = { email: email.trim(), password };
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword(creds);
      setBusy(false);
      if (error) return setMsg({ type: "err", text: friendly(error.message) });
      return router.push("/");
    }
    const { data, error } = await supabase.auth.signUp(creds);
    setBusy(false);
    if (error) return setMsg({ type: "err", text: friendly(error.message) });
    if (data.session) return router.push("/");
    setMsg({ type: "ok", text: "Account created. Check your email to confirm it, then sign in." });
    setMode("in");
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <span className="brand"><Logo />ScanLens</span>
        <div>
          <h2>See what the model marks on your scans.</h2>
          <p>Upload an X-ray or CT image, review the findings and the regions behind them, and keep every result private to your account.</p>
        </div>
        <div className="lightbox">
          <div className="frame">
            <svg viewBox="0 0 400 400" aria-hidden="true">
              <ellipse cx="200" cy="205" rx="165" ry="120" fill="#7d8894" />
              <ellipse cx="200" cy="205" rx="150" ry="106" fill="#5c6670" />
              <ellipse cx="135" cy="195" rx="58" ry="78" fill="#0d1218" />
              <ellipse cx="268" cy="195" rx="56" ry="76" fill="#0d1218" />
              <ellipse cx="212" cy="215" rx="40" ry="36" fill="#97a2ad" />
              <circle cx="200" cy="292" r="20" fill="#e6ecf2" />
              <circle cx="200" cy="292" r="8" fill="#5c6670" />
              <circle cx="118" cy="160" r="7" fill="#aab4be" />
              <rect x="96" y="138" width="44" height="44" fill="none" stroke="#f2b84b" strokeWidth="2.5" />
            </svg>
            <span className="ov tl">Example scan</span>
            <span className="ov bl">Axial CT, chest</span>
          </div>
        </div>
      </aside>

      <section className="auth-form">
        <form onSubmit={onSubmit} noValidate>
          <h1>{mode === "in" ? "Welcome back" : "Create your account"}</h1>
          <p className="auth-sub">{mode === "in" ? "Sign in to see your analyses." : "It takes less than a minute."}</p>

          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "in"} className={mode === "in" ? "on" : ""} onClick={() => { setMode("in"); setMsg(null); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "up"} className={mode === "up" ? "on" : ""} onClick={() => { setMode("up"); setMsg(null); }}>Create account</button>
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" inputMode="email" placeholder="you@hospital.org" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="pw">Password</label>
            <div className="pw">
              <input id="pw" type={show ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
            </div>
          </div>

          {msg && <p className={msg.type === "err" ? "auth-msg err" : "auth-msg ok"} role="alert">{msg.text}</p>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="auth-note">Decision support only. Results are not a diagnosis and must be reviewed by a qualified clinician.</p>
        <div style={{ marginTop: 16 }}><ThemeToggle /></div>
      </section>
    </div>
  );
}
