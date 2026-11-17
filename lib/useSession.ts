"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Opening the site needs no sign-in. Each section (New analysis, Full scans, Anatomy lab) asks for one
// when it is opened, through the sign-in box in components/SignInGate.tsx. Pages wait here until there
// is a session, and pick it up as soon as someone signs in.
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) setSession(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (live) setSession(s); });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);
  return session;
}

// True for a demo session made without an account (the fallback when a demo account doesn't exist yet).
export const isAnonymous = (s: Session | null) => !!s?.user?.is_anonymous;
