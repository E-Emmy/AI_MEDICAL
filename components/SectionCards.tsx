import Link from "next/link";
import { ROLES } from "@/lib/roles";

// The three sections, one per kind of user. Opening one asks to sign in with its demo account.
const CARDS = [
  { role: "doctor", href: "/upload", title: "New analysis", image: "/series-samples/chest-ct-lung-nodule.jpg", cta: "Start an analysis" },
  { role: "radiologist", href: "/series", title: "Full scans", image: "/series-samples/brain-mri-glioblastoma.jpg", cta: "Open full scans" },
  { role: "student", href: "/anatomy", title: "Anatomy lab", image: "/anatomy/hero.jpg", cta: "Explore in 3D" },
] as const;

export default function SectionCards() {
  return (
    <ul className="topic-grid section-grid">
      {CARDS.map((c) => {
        const role = ROLES.find((r) => r.id === c.role)!;
        return (
          <li key={c.href}>
            <Link className="topic" href={c.href}>
              <img src={c.image} alt="" />
              <div className="topic-body">
                <span className="topic-system">For {role.title.toLowerCase()}s</span>
                <strong>{c.title}</strong>
                <span className="topic-blurb">{role.blurb}</span>
                <span className="topic-foot"><span>Demo sign-in</span><span className="btn btn-sm topic-btn">{c.cta}</span></span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
