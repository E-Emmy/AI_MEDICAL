"use client";
import { useEffect, useRef, useState } from "react";

type Rect = { x: number; y: number; w: number; h: number };
type Tool = "crop" | "cover";
export type Edits = { cropped: boolean; covered: number };

type Props = {
  src: string;
  onApply: (png: Blob, edits: Edits) => void;
  onCancel: () => void;
};

// Rectangles are stored in the image's own pixels, so the result doesn't depend on screen size.
const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
});

// Crop to the scan and cover names, dates or IDs before anything leaves the browser.
// Covered areas are painted solid black into the pixels, not layered on top.
export default function ImageEditor({ src, onApply, onCancel }: Props) {
  const img = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("cover");
  const [crop, setCrop] = useState<Rect | null>(null);
  const [covers, setCovers] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth) setSize({ w: el.naturalWidth, h: el.naturalHeight });
  }, [src]);

  // Pointer position in image pixels, clamped to the image.
  function at(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
    return {
      x: clamp(((e.clientX - box.left) / box.width) * size.w, size.w),
      y: clamp(((e.clientY - box.top) / box.height) * size.h, size.h),
    };
  }

  function down(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = at(e);
    setDraft(null);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    if (start.current) setDraft(norm(start.current, at(e)));
  }
  function up() {
    const r = draft;
    start.current = null;
    setDraft(null);
    // Ignore clicks and tiny accidental drags.
    if (!r || r.w < size.w / 50 || r.h < size.h / 50) return;
    if (tool === "crop") setCrop(r);
    else setCovers([...covers, r]);
  }

  function undo() {
    if (tool === "crop") setCrop(null);
    else setCovers(covers.slice(0, -1));
  }

  async function apply() {
    const el = img.current;
    if (!el) return;
    setBusy(true);
    const area = crop ?? { x: 0, y: 0, w: size.w, h: size.h };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(area.w);
    canvas.height = Math.round(area.h);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(el, -area.x, -area.y);
    ctx.fillStyle = "#000";
    for (const c of covers) ctx.fillRect(c.x - area.x, c.y - area.y, c.w, c.h);
    canvas.toBlob((b) => {
      setBusy(false);
      if (b) onApply(b, { cropped: !!crop, covered: covers.length });
    }, "image/png");
  }

  const stroke = Math.max(size.w, size.h) / 300;
  const changed = !!crop || covers.length > 0;

  return (
    <div className="editor">
      <div className="frame natural editor-canvas">
        <div className="editor-stage">
        <img ref={img} src={src} alt="The scan being edited" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {size.w > 0 && (
          <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={up}
            role="img" aria-label={tool === "crop" ? "Drag to choose the area to keep" : "Drag over text to cover it"}>
            {covers.map((c, i) => <rect key={i} {...{ x: c.x, y: c.y, width: c.w, height: c.h }} fill="#000" />)}
            {crop && (
              <path fillRule="evenodd" fill="rgba(0,0,0,.6)"
                d={`M0 0H${size.w}V${size.h}H0Z M${crop.x} ${crop.y}h${crop.w}v${crop.h}h${-crop.w}Z`} />
            )}
            {crop && <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="none" stroke="var(--film-mark)" strokeWidth={stroke} strokeDasharray={`${stroke * 4} ${stroke * 3}`} />}
            {draft && (
              <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h}
                fill={tool === "cover" ? "rgba(0,0,0,.75)" : "none"} stroke="var(--film-mark)" strokeWidth={stroke} />
            )}
          </svg>
        )}
        </div>
      </div>
      <div className="editor-bar">
        <div className="seg" role="radiogroup" aria-label="Editing tool">
          <button type="button" role="radio" aria-checked={tool === "cover"} onClick={() => setTool("cover")}>Cover text</button>
          <button type="button" role="radio" aria-checked={tool === "crop"} onClick={() => setTool("crop")}>Crop</button>
        </div>
        <span className="muted editor-hint">
          {tool === "cover" ? "Drag over names, dates or ID numbers to black them out." : "Drag around the part of the image to keep."}
        </span>
        <div className="editor-actions">
          <button type="button" className="btn btn-quiet btn-sm" onClick={undo} disabled={tool === "crop" ? !crop : covers.length === 0}>Undo</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-sm" onClick={apply} disabled={busy || !changed}>{busy ? "Applying…" : "Apply changes"}</button>
        </div>
      </div>
    </div>
  );
}
