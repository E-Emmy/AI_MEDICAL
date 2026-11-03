"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Case } from "@/lib/analysis";

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  label?: string;
};

const NEW = "__new";

// Choose which patient case a scan belongs to, or start a new one. Hidden until migration 003 exists.
export default function CasePicker({ value, onChange, disabled, label = "Case" }: Props) {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("cases").select("id,label,note,created_at").order("created_at", { ascending: false })
      .then(({ data, error }) => { if (!error) setCases(data as Case[]); });
  }, []);

  async function create() {
    const label = name.trim();
    if (!label) return setErr("Give the case a reference, such as a ward bed or your own patient code.");
    const { data, error } = await supabase.from("cases").insert({ label }).select("id,label,note,created_at").single();
    if (error) return setErr(error.message);
    setCases([data as Case, ...(cases ?? [])]);
    setAdding(false); setName(""); setErr("");
    onChange((data as Case).id);
  }

  if (!cases) return null;
  return (
    <div className="field case-picker">
      <label htmlFor="case">{label}</label>
      {!adding ? (
        <select id="case" value={value ?? ""} disabled={disabled}
          onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value || null))}>
          <option value="">No case</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          <option value={NEW}>New case…</option>
        </select>
      ) : (
        <div className="inline-form">
          <input id="case" autoFocus maxLength={80} placeholder="Patient reference, not a name" value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), create())} />
          <button type="button" className="btn btn-sm" onClick={create}>Create</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setAdding(false); setErr(""); }}>Cancel</button>
        </div>
      )}
      {err && <p className="review-err" role="alert">{err}</p>}
    </div>
  );
}
