"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Visitors don't have to log in: anyone without a session gets an anonymous Supabase account on their
// first visit, kept in this browser, so row-level security still keeps their scans private. The Sign in
// button in the header (the /login page) switches to a real account and its saved scans.
// If anonymous sign-ins are switched off in Supabase, visitors are sent to /login as before.

let pending: Promise<Session | null> | null = null;

// One sign-in for the whole page, even when several components ask at once.
function ensureSession(): Promise<Session | null> {
  pending ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    pending = null;
    return error ? null : anon.session;
  })();
  return pending;
}

export function useSession() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let live = true;
    ensureSession().then((s) => {
      if (!live) return;
      if (!s) router.replace("/login");
      else setSession(s);
    });
    return () => { live = false; };
  }, [router]);
  return session;
}

// True for the automatic visitor account, false for a real (email) account.
export const isAnonymous = (s: Session | null) => !!s?.user?.is_anonymous;
