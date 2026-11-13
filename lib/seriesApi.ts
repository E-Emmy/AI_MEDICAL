"use client";
import { supabase } from "./supabase";
import type { SeriesFacts, SeriesKind } from "./series";
import type { SeriesResults } from "./seriesResults";

export type SeriesRow = {
  id: string;
  kind: SeriesKind;
  label: string | null;
  object_key: string;
  facts: SeriesFacts;
  case_id: string | null;
  results: SeriesResults | null;
  created_at: string;
};

export const SERIES_COLUMNS = "id,kind,label,object_key,facts,case_id,results,created_at";

export const SERIES_MISSING =
  "Full scans aren't set up in your Supabase project yet. Run supabase/migrations/004_series.sql in the Supabase SQL editor, then reload this page.";

// Asks the server for a short-lived R2 link. The server checks the key belongs to the signed-in user.
export async function seriesLink(action: "upload" | "view" | "delete", key?: string): Promise<{ url?: string; key?: string }> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/series", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ action, key }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "The scan storage couldn't be reached. Try again.");
  return body;
}

// Uploads straight from the browser to R2, reporting progress (0-1).
export function putToR2(url: string, blob: Blob, onProgress: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/gzip");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). Try again.`)));
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.send(blob);
  });
}

export const mm = (n: number) => (Math.round(n * 100) / 100).toString();
