import type { ReactNode } from "react";

export type Float = {
  title: string;
  value: ReactNode;
  unit?: string;
  // Where the card sits around the scan on wide screens. On phones they line up below it.
  pos: "tl" | "tr" | "ml" | "mr" | "bl" | "br";
  tone?: "flag" | "ok";
};

type Props = {
  // The scan type, set large behind the scan.
  word?: string;
  // The top result's confidence, 0-1, marked on the scale down the left edge.
  confidence?: number | null;
  floats?: Float[];
  children: ReactNode;
  compact?: boolean;
};

const TICKS = Array.from({ length: 21 }, (_, i) => i * 5);

// A scan on a lit stage, with the numbers that matter floating beside it.
export default function Stage({ word, confidence, floats = [], children, compact = false }: Props) {
  const level = confidence == null ? null : Math.round(confidence * 100);
  return (
    <section className={compact ? "stage compact" : "stage"}>
      {word && <p className="stage-word" aria-hidden="true">{word}</p>}
      {level != null && (
        <div className="ruler" role="img" aria-label={`Top confidence ${level}%`}>
          {TICKS.map((t) => (
            <span key={t} className={t % 25 === 0 ? "tick major" : "tick"} style={{ bottom: `${t}%` }}>
              {t % 25 === 0 && t > 0 && t < 100 && <em>{t}</em>}
            </span>
          ))}
          <span className="ruler-mark" style={{ bottom: `${level}%` }}><b>{level}%</b></span>
        </div>
      )}
      <div className="stage-scan">{children}</div>
      {floats.length > 0 && (
        <div className="floats">
          {floats.map((f) => (
            <div key={f.title} className={["float", f.pos, f.tone].filter(Boolean).join(" ")}>
              <span className="float-title">{f.title}</span>
              <span className="float-value">{f.value}{f.unit && <small>{f.unit}</small>}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
