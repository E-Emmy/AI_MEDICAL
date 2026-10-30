"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
        <svg viewBox="0 0 320 320" aria-hidden="true">
          <circle cx="160" cy="160" r="140" fill="none" stroke="#2B3A45" strokeWidth="2" />
          <circle cx="160" cy="160" r="105" fill="none" stroke="#2B3A45" strokeWidth="2" />
          <circle cx="160" cy="160" r="70" fill="none" stroke="#2EC4D6" strokeWidth="2" />
          <circle cx="160" cy="160" r="35" fill="#18222A" stroke="#2B3A45" strokeWidth="2" />
          <rect x="190" y="105" width="56" height="44" rx="4" fill="none" stroke="#FFB020" strokeWidth="3" />
        </svg>
        <h2>ScanLens</h2>
        <p>Upload a CT scan, review what the AI model flags, and keep every result private to your account.</p>
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

          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}