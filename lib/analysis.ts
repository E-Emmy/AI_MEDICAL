import { supabase } from "./supabase";
import type { Prediction, Region } from "./hf";
import type { DicomInfo } from "./dicom";
import { shortModel } from "./format";
import { isNormal, type Heatmap, type ScanCheck, type TestInfo } from "./tests";

// One test result. A scan run through several tests has one row per test, sharing image_path.
export type Analysis = {
  id: string; image_path: string; dicom_path?: string | null; model: string; created_at: string;
  case_id?: string | null;
  predictions: Prediction[]; regions: Region[];
  raw: { test?: TestInfo; scan_check?: ScanCheck; heatmap?: Heatmap | null; heatmap_note?: "diffuse" | null;
    sample?: { truth: string; source: string; url: string };
    slices?: { count: number; flagged: number };
    dicom?: DicomInfo } | null;
};

export type Verdict = "agree" | "disagree" | "unsure";
export type ReviewRow = { analysis_id: string; verdict: Verdict; note: string | null; updated_at: string };
export type Case = { id: string; label: string; note: string | null; created_at: string };

// Everything one scan page needs.
export type ScanBundle = { runs: Analysis[]; reviews: Record<string, ReviewRow> | null; url: string; case: Case | null };

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const testName = (r: Analysis) => r.raw?.test?.name ?? shortModel(r.model);
export const scanName = (r: Analysis) => r.raw?.test?.scan_name ?? r.raw?.scan_check?.name ?? "scan";
export const flaggedRuns = (runs: Analysis[]) => runs.filter((r) => r.predictions[0] && !isNormal(r.predictions[0].label));

// The headline for a scan: its finding, or how many of its tests found something.
export function scanTitle(runs: Analysis[], label: (s: string) => string) {
  const flagged = flaggedRuns(runs);
  if (runs.length === 1) return runs[0].predictions[0] ? label(runs[0].predictions[0].label) : "No finding";
  if (flagged.length === 0) return `No findings in ${runs.length} tests`;
  if (flagged.length === 1) return `${label(flagged[0].predictions[0].label)} flagged`;
  return `${flagged.length} of ${runs.length} tests flagged a finding`;
}

// The opened result first, then the scan's other tests by name.
export async function loadScan(id: string): Promise<ScanBundle | { error: string }> {
  const { data, error } = await supabase.from("analyses").select("*").eq("id", id).single();
  if (error || !data) return { error: "This analysis doesn't exist, or it belongs to another account." };
  const siblings = await supabase.from("analyses").select("*").eq("image_path", data.image_path);
  const others = ((siblings.data as Analysis[]) ?? []).filter((r) => r.id !== id);
  others.sort((x, y) => testName(x).localeCompare(testName(y)));
  const runs = [data as Analysis, ...others];

  const rv = await supabase.from("reviews").select("analysis_id,verdict,note,updated_at").in("analysis_id", runs.map((r) => r.id));
  const reviews = rv.error ? null : Object.fromEntries((rv.data as ReviewRow[]).map((r) => [r.analysis_id, r]));

  let found: Case | null = null;
  if (data.case_id) {
    const c = await supabase.from("cases").select("id,label,note,created_at").eq("id", data.case_id).single();
    found = (c.data as Case) ?? null;
  }
  const s = await supabase.storage.from("scans").createSignedUrl(data.image_path, 600);
  return { runs, reviews, url: s.data?.signedUrl ?? "", case: found };
}

// The scan behind a share link, loaded without signing in.
export async function loadShared(token: string): Promise<ScanBundle | { error: string }> {
  const { data, error } = await supabase.rpc("shared_scan", { p_token: token });
  if (error) return { error: "This link can't be opened right now." };
  if (!data || !data.runs?.length) return { error: "This link has expired or was turned off. Ask for a new one." };
  const reviews = Object.fromEntries((data.reviews as ReviewRow[]).map((r) => [r.analysis_id, r]));
  return { runs: data.runs as Analysis[], reviews, url: data.image_url, case: null };
}
