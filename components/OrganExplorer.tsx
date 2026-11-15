"use client";
import { useState } from "react";
import { ORGAN_GROUPS, type PresentOrgan } from "@/lib/organs";

type Props = {
  organs: PresentOrgan[];
  visible: Set<string>;
  onVisible: (v: Set<string>) => void;
  selected: string | null;
  // Selecting an organ also moves the viewer to it.
  onSelect: (o: PresentOrgan) => void;
  hideScan: boolean;
  onHideScan: (v: boolean) => void;
  // Names with lines to each organ in the 3D view.
  labels: boolean;
  onLabels: (v: boolean) => void;
};

const ml = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} L` : `${Math.round(v)} ml`);
const rgb = (c: [number, number, number]) => `rgb(${c.join(",")})`;

export default function OrganExplorer({ organs, visible, onVisible, selected, onSelect, hideScan, onHideScan, labels, onLabels }: Props) {
  const [query, setQuery] = useState("");
  // On phones the panel is a bottom sheet opened from a floating button, so the viewer keeps the screen.
  const [sheet, setSheet] = useState(false);
  const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1000px)").matches;
  // Picking a part on a phone closes the sheet so the viewer can show it.
  const pick = (o: PresentOrgan) => { onSelect(o); if (isPhone()) setSheet(false); };
  const current = organs.find((o) => o.id === selected) ?? null;
  const q = query.trim().toLowerCase();
  const matches = (o: PresentOrgan) => !q || o.name.toLowerCase().includes(q) || o.group.toLowerCase().includes(q);

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(visible);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onVisible(next);
  };

  return (
    <>
    <button type="button" className="organ-fab" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet}>
      {current && <span className="swatch" style={{ background: rgb(current.color) }} />}
      <span className="organ-fab-text">
        <strong>{current ? current.name : "Anatomy"}</strong>
        <span>{current ? "Tap for details and parts" : `${visible.size} of ${organs.length} parts shown · tap to explore`}</span>
      </span>
      <span className="organ-fab-icon" aria-hidden="true">▴</span>
    </button>
    {sheet && <div className="organ-backdrop" onClick={() => setSheet(false)} aria-hidden="true" />}
    <div className={sheet ? "card organ-explorer sheet-open" : "card organ-explorer"} role={sheet ? "dialog" : undefined} aria-label="Anatomy">
      <span className="sheet-grip" aria-hidden="true" />
      <div className="organ-head">
        <h2 className="card-title">Anatomy</h2>
        <span className="organ-count">{visible.size} of {organs.length} shown</span>
        <button type="button" className="sheet-close" onClick={() => setSheet(false)} aria-label="Close">✕</button>
      </div>

      {current ? (
        <div className="organ-card" style={{ borderColor: rgb(current.color) }}>
          <p className="organ-card-name"><span className="swatch" style={{ background: rgb(current.color) }} />{current.name}</p>
          <p className="organ-card-meta">{current.group} · {ml(current.ml)} in this scan</p>
          <p className="organ-card-about">{current.about}</p>
          <div className="organ-actions">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onVisible(new Set([current.id]))}>Show only this</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => pick(current)}>Go to it</button>
          </div>
        </div>
      ) : (
        <p className="organ-card organ-card-empty">Point at or tap the scan, tap a 3D label, or pick a part below to learn what it does.</p>
      )}

      <div className="organ-switches">
        <label className="switch inline">
          <span>Organs only</span>
          <input type="checkbox" checked={hideScan} onChange={(e) => onHideScan(e.target.checked)} />
        </label>
        <label className="switch inline">
          <span>Labels in 3D</span>
          <input type="checkbox" checked={labels} onChange={(e) => onLabels(e.target.checked)} />
        </label>
      </div>

      <div className="organ-tools">
        <input className="organ-search" type="search" placeholder="Search parts…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search parts" />
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => onVisible(new Set(organs.map((o) => o.id)))}>All</button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => onVisible(new Set())}>None</button>
      </div>

      <div className="organ-scroll">
        {ORGAN_GROUPS.map((g) => {
          const all = organs.filter((o) => o.group === g);
          const list = all.filter(matches);
          if (list.length === 0) return null;
          const on = all.filter((o) => visible.has(o.id)).length;
          return (
            // Groups with nothing switched on start closed, so the parts in the lesson come first.
            <details key={`${g}-${on > 0 || !!q}`} className="organ-group" open={on > 0 || !!q}>
              <summary>
                <input type="checkbox" aria-label={`Show all ${g}`} checked={on === all.length}
                  ref={(el) => { if (el) el.indeterminate = on > 0 && on < all.length; }}
                  onClick={(e) => e.stopPropagation()} onChange={(e) => toggle(all.map((o) => o.id), e.target.checked)} />
                <span>{g}</span>
                <span className="organ-group-count">{on}/{all.length}</span>
              </summary>
              <ul>
                {list.map((o) => (
                  <li key={o.id} className={o.id === selected ? "on" : undefined}>
                    <input type="checkbox" aria-label={`Show ${o.name}`} checked={visible.has(o.id)} onChange={(e) => toggle([o.id], e.target.checked)} />
                    <span className="swatch" style={{ background: rgb(o.color) }} />
                    <button type="button" onClick={() => pick(o)}>{o.name}</button>
                    <span className="organ-ml">{ml(o.ml)}</span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
        {q && !organs.some(matches) && <p className="small muted">No part matches “{query}”.</p>}
      </div>
      <p className="fine">
        Outlines by TotalSegmentator, an open-source AI model; small errors at organ edges are normal. Descriptions are
        simplified for education.
      </p>
    </div>
    </>
  );
}
