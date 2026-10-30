"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";

type Row = { id: string; created_at: string; model: string; top_label: string | null; top_score: number | null };

export default function Dashboard() {
  const session = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("analyses")
      .select("id,created_at,model,top_label,top_score")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as Row[]) ?? []));
  }, [session]);

  if (!session || !rows) return <p>Loading…</p>;
  return (
    <>
      <h1>Analyses</h1>
      {rows.length === 0 ? (
        <div className="panel"><p>No analyses yet.</p><Link className="btn" href="/upload">Upload a scan</Link></div>
      ) : (
        <div className="panel">
          <table>
            <thead><tr><th>Date</th><th>Top finding</th><th>Confidence</th><th>Model</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/scan/${r.id}`}>{new Date(r.created_at).toLocaleString()}</Link></td>
                  <td>{r.top_label ?? "None"}</td>
                  <td>{r.top_score != null ? `${(r.top_score * 100).toFixed(1)}%` : "-"}</td>
                  <td>{r.model}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
