"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Region } from "@/lib/hf";
import { labelText } from "@/lib/format";
import type { Heatmap } from "@/lib/tests";
import { outlines } from "@/lib/contour";

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
  // Where the model looked. Thumbnails show only the core outline; the soft heat is too small to read there.
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
  const glowId = `${blurId}glow`;
  // An outline traced around where the model looked (cells at 75% of the strongest or more), following
  // the shape of that area rather than marking it with a fixed circle. A wider 50% line was tried and
  // sprawled across most of the scan.
  const shapes = useMemo(() => (heat && size.w > 0 ? outlines(heat.grid, 0.75, size.w, size.h) : []), [heat, size.w, size.h]);

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
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={Math.min(size.w, size.h) / 90} result="g" />
            <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <g filter={`url(#${glowId})`}>
            {shapes.map((d, i) => (
              <path key={`c${i}`} d={d} fill="var(--film-mark)" fillOpacity={heatCircleOnly ? 0.12 : 0.1}
                stroke="var(--film-mark)" strokeWidth={heatCircleOnly ? 1.75 : 2.5} strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" opacity={i === 0 ? 1 : 0.75} />
            ))}
          </g>
        </svg>
      )}
      {(Object.keys(overlays) as Corner[]).map((k) => overlays[k] && <span key={k} className={`ov ${k}`}>{overlays[k]}</span>)}
    </div>
  );
}
