"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// There is no login page: every visitor gets an anonymous Supabase account on their first visit, kept in
// this browser. Their scans, cases and reviews are tied to it, so row-level security still keeps each
// visitor's data private. Needs "Allow anonymous sign-ins" switched on in Supabase (Authentication > Sign In / Providers).

export const AUTH_ERROR_EVENT = "orbinova-auth-error";

let pending: Promise<Session | null> | null = null;

// One sign-in for the whole page, even when several components ask at once.
function ensureSession(): Promise<Session | null> {
  pending ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error) {
      pending = null;
      const msg = /anonymous/i.test(error.message)
        ? "Anonymous sign-ins are switched off in Supabase. Turn on Authentication > Sign In / Providers > Allow anonymous sign-ins, then reload."
        : `Couldn't start a session: ${error.message}`;
      window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT, { detail: msg }));
      return null;
    }
    return anon.session;
  })();
  return pending;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let live = true;
    ensureSession().then((s) => live && setSession(s));
    return () => { live = false; };
  }, []);
  return session;
}
