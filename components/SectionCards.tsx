import Link from "next/link";
import { SECTIONS } from "@/lib/roles";

// The three sections. Opening one asks to sign in with its demo account: New analysis and Full scans
// share the clinician account, the Anatomy lab has the student account.
const CARDS: Record<string, { href: string; image: string; cta: string }> = {
  "New analysis": { href: "/upload", image: "/series-samples/chest-ct-lung-nodule.jpg", cta: "Start an analysis" },
  "Full scans": { href: "/series", image: "/series-samples/brain-mri-glioblastoma.jpg", cta: "Open full scans" },
  "Anatomy lab": { href: "/anatomy", image: "/anatomy/hero.jpg", cta: "Explore in 3D" },
};

export default function SectionCards() {
  return (
    <ul className="topic-grid section-grid">
      {SECTIONS.map((s) => {
        const c = CARDS[s.title];
        return (
          <li key={s.title}>
            <Link className="topic" href={c.href}>
              <img src={c.image} alt="" />
              <div className="topic-body">
                <span className="topic-system">{s.audience}</span>
                <strong>{s.title}</strong>
                <span className="topic-blurb">{s.blurb}</span>
                <span className="topic-foot"><span>{s.role === "doctor" ? "Clinician sign-in" : "Student sign-in"}</span><span className="btn btn-sm topic-btn">{c.cta}</span></span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
