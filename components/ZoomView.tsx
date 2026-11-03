"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

const MIN = 1;
const MAX = 12;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

// Click a scan to open it full screen and zoom in: wheel or pinch to zoom, drag to move,
// double-click to zoom in on a spot. The pixels are only enlarged, never invented: AI upscaling
// can add or remove detail that looks real, which is not safe on a medical image.
export default function ZoomView({ children, label }: { children: ReactNode; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [pixels, setPixels] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef<{ x: number; y: number; dist: number } | null>(null);

  // Zoom by `factor` keeping the point (cx, cy), measured from the area's centre, still.
  function zoomAt(factor: number, cx = 0, cy = 0) {
    setView((v) => {
      const z = clamp(v.z * factor);
      const k = z / v.z;
      return z === 1 ? { z, x: 0, y: 0 } : { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }
  function fromCentre(clientX: number, clientY: number) {
    const r = area.current!.getBoundingClientRect();
    return [clientX - r.left - r.width / 2, clientY - r.top - r.height / 2] as const;
  }

  // React's wheel listener is passive and can't stop the page scrolling, so attach one directly.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY / 800), ...fromCentre(e.clientX, e.clientY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function open() {
    setView({ z: 1, x: 0, y: 0 });
    dialog.current?.showModal();
  }

  function down(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last.current = null;
  }
  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    const prev = last.current;
    last.current = { x: cx, y: cy, dist };
    if (!prev) return;
    // Two fingers: pinch to zoom around their midpoint. Always: move with the pointer.
    if (dist && prev.dist) zoomAt(dist / prev.dist, ...fromCentre(cx, cy));
    setView((v) => (v.z === 1 ? v : { ...v, x: v.x + cx - prev.x, y: v.y + cy - prev.y }));
  }
  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    last.current = null;
  }

  return (
    <>
      {/* A div, not a button: the scan inside is built from divs, which buttons can't contain. */}
      <div role="button" tabIndex={0} className="zoom-open" onClick={open} aria-label={`${label}. Open full screen to zoom.`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}>
        {children}
        <span className="zoom-hint" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></svg>
          Zoom
        </span>
      </div>
      <dialog ref={dialog} className="zoom" aria-label={`${label}, zoomed`}>
        <div className="zoom-bar">
          <span className="zoom-label">{label}</span>
          <div className="zoom-tools">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => zoomAt(1 / 1.5)} disabled={view.z <= MIN} aria-label="Zoom out">−</button>
            <span className="zoom-level" aria-live="polite">{Math.round(view.z * 100)}%</span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => zoomAt(1.5)} disabled={view.z >= MAX} aria-label="Zoom in">+</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setView({ z: 1, x: 0, y: 0 })}>Fit</button>
            <label className="zoom-pixels">
              <input type="checkbox" checked={pixels} onChange={(e) => setPixels(e.target.checked)} />
              Show exact pixels
            </label>
            <button type="button" className="btn btn-sm" onClick={() => dialog.current?.close()}>Close</button>
          </div>
        </div>
        <div ref={area} className={view.z > 1 ? "zoom-area panning" : "zoom-area"}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onDoubleClick={(e) => zoomAt(2, ...fromCentre(e.clientX, e.clientY))}>
          <div className={pixels ? "zoom-content pixels" : "zoom-content"} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
            {children}
          </div>
        </div>
        <p className="zoom-help">Scroll or pinch to zoom, drag to move, double-click to zoom in on a spot. Press Esc to close.</p>
      </dialog>
    </>
  );
}
