"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Opening the site needs no sign-in. Each section (New analysis, Full scans, Anatomy lab) asks for one
// when it is opened, through the sign-in box in components/SignInGate.tsx. Pages pick the session up as
// soon as someone signs in. undefined means it's still being read; null means nobody is signed in, and
// pages then show what works without an account (the samples).
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) setSession(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (live) setSession(s); });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);
  return session;
}

// True for a demo session made without an account (the fallback when a demo account doesn't exist yet).
export const isAnonymous = (s: Session | null | undefined) => !!s?.user?.is_anonymous;
