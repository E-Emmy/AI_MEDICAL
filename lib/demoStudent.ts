"use client";
// A stand-in student sign-in kept in this browser, used when the student demo account can't be reached in
// Supabase (for example if it was deleted). The Anatomy lab only shows public sample data, so it works
// without a real account; this just remembers that the student pressed "Sign in".
const KEY = "orbinova-demo-student";
const EVENT = "orbinova-demo-student";

export function isDemoStudent() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setDemoStudent(on: boolean) {
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

// Calls back whenever the stand-in sign-in starts or ends (in this tab or another).
export function onDemoStudent(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}
