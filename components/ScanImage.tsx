"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Region } from "@/lib/hf";
import { labelText } from "@/lib/format";
import type { Heatmap } from "@/lib/tests";

type Corner = "tl" | "tr" | "bl" | "br";

type Props = {
  src?: string;
  alt: string;
  regions?: Region[];
  showMarks?: boolean;
  // Label each marked region with its finding; too small to read on thumbnails.
  labels?: boolean;
  // Keep the image's own proportions instead of a square thumbnail.
  natural?: boolean;
  scanning?: boolean;
  // Where the model looked. Thumbnails show only the circle; the soft heat is too small to read there.
  heat?: Heatmap | null;
  heatCircleOnly?: boolean;
  overlays?: Partial<Record<Corner, string>>;
};

// A scan shown like film in a viewer: dark frame, model marks, and info text in the corners.
export default function ScanImage({ src, alt, regions = [], showMarks = true, labels = false, natural = false, scanning = false, heat = null, heatCircleOnly = false, overlays = {} }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const img = useRef<HTMLImageElement>(null);
  // React ids contain ":" or "«»", which break url(#id) references in some browsers.
  const blurId = `heat${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // Cached images can finish loading before React attaches onLoad, so measure on mount too.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth) setSize({ w: el.naturalWidth, h: el.naturalHeight });
  }, [src]);

  const cls = ["frame", natural && "natural", scanning && "scanning"].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      {src && <img ref={img} src={src} alt={alt} onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />}
      {showMarks && size.w > 0 && regions.length > 0 && (
        <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {regions.map((r, i) => (
            <g key={i}>
              <rect x={r.box.xmin} y={r.box.ymin} width={r.box.xmax - r.box.xmin} height={r.box.ymax - r.box.ymin}
                fill="none" stroke="var(--film-mark)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {labels && (
                <text x={r.box.xmin + 4} y={Math.max(size.w / 30, r.box.ymin - 6)} fill="var(--film-mark)" fontSize={size.w / 34} fontWeight={600}>
                  {labelText(r.label)} {(r.score * 100).toFixed(0)}%
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      {heat && size.w > 0 && (
        <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {!heatCircleOnly && (
            <>
              <filter id={blurId} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation={Math.min(size.w, size.h) / heat.grid.length / 2} />
              </filter>
              <g filter={`url(#${blurId})`}>
                {heat.grid.flatMap((row, y) =>
                  row.map((v, x) => (
                    <rect key={`${x}-${y}`} x={(x * size.w) / row.length} y={(y * size.h) / heat.grid.length}
                      width={size.w / row.length} height={size.h / heat.grid.length}
                      fill="var(--film-mark)" opacity={v * v * 0.55} />
                  ))
                )}
              </g>
            </>
          )}
          {(heat.peaks ?? [{ ...heat.peak, strength: 1 }]).map((p, i) => (
            <circle key={i} cx={p.x * size.w} cy={p.y * size.h} r={Math.min(size.w, size.h) * 0.11}
              fill="none" stroke="var(--film-mark)" vectorEffect="non-scaling-stroke"
              // The strongest area gets the boldest circle.
              strokeWidth={(heatCircleOnly ? 2 : 3) * (i === 0 ? 1 : 0.7)} opacity={0.5 + p.strength / 2} />
          ))}
        </svg>
      )}
      {(Object.keys(overlays) as Corner[]).map((k) => overlays[k] && <span key={k} className={`ov ${k}`}>{overlays[k]}</span>)}
    </div>
  );
}
