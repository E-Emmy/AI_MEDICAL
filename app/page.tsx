"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import DashboardView, { type Row } from "@/components/DashboardView";

const MISSING_TABLE = "The analyses table doesn't exist in your Supabase project yet. Run supabase/schema.sql in the Supabase SQL editor, then reload this page.";

export default function Dashboard() {
  const session = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await supabase
        .from("analyses")
        .select("id,created_at,model,image_path,top_label,top_score,regions,test:raw->test,heatmap:raw->heatmap")
        .order("created_at", { ascending: false });
      if (error) return setError(error.code === "PGRST205" ? MISSING_TABLE : error.message);
      const list = (data as Row[]) ?? [];
      setRows(list);

      // Only the films on the lightbox need image links.
      const paths = list.slice(0, 4).map((r) => r.image_path);
      if (paths.length === 0) return;
      const signed = await supabase.storage.from("scans").createSignedUrls(paths, 600);
      const map: Record<string, string> = {};
      for (const s of signed.data ?? []) if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      setUrls(map);
    })();
  }, [session]);

  return <DashboardView rows={rows} urls={urls} error={error} />;
}
