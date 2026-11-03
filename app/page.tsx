"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import DashboardView, { type Row } from "@/components/DashboardView";
import type { Verdict } from "@/lib/analysis";

const MISSING_TABLE = "The analyses table doesn't exist in your Supabase project yet. Run supabase/schema.sql in the Supabase SQL editor, then reload this page.";

export default function Dashboard() {
  const session = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Verdict> | null>(null);
  const [cases, setCases] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await supabase
        .from("analyses")
        .select("id,created_at,model,image_path,top_label,top_score,regions,test:raw->test,heatmap:raw->heatmap,scan_check:raw->scan_check")
        .order("created_at", { ascending: false });
      if (error) return setError(error.code === "PGRST205" ? MISSING_TABLE : error.message);
      const list = (data as Row[]) ?? [];
      setRows(list);

      const rv = await supabase.from("reviews").select("analysis_id,verdict");
      if (!rv.error) setVerdicts(Object.fromEntries((rv.data as { analysis_id: string; verdict: Verdict }[]).map((r) => [r.analysis_id, r.verdict])));
      const cs = await supabase.from("cases").select("id", { count: "exact", head: true });
      if (!cs.error) setCases(cs.count ?? 0);

      // The stage and the two recent cards need image links.
      const paths = [...new Set(list.map((r) => r.image_path))].slice(0, 3);
      if (paths.length === 0) return;
      const signed = await supabase.storage.from("scans").createSignedUrls(paths, 600);
      const map: Record<string, string> = {};
      for (const s of signed.data ?? []) if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      setUrls(map);
    })();
  }, [session]);

  return <DashboardView rows={rows} urls={urls} verdicts={verdicts} cases={cases} error={error} />;
}
