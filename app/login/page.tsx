"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(mode: "in" | "up") {
    setMsg("");
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) return setMsg(error.message);
    if (mode === "up") return setMsg("Account created. Confirm your email if required, then sign in.");
    router.push("/");
  }

  return (
    <div className="panel" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button onClick={() => submit("in")}>Sign in</button>{" "}
      <button className="ghost" onClick={() => submit("up")}>Create account</button>
      {msg && <p className="err">{msg}</p>}
    </div>
  );
}
