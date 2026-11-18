"use client";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { TOPICS } from "@/lib/anatomy";

const parts = (n: number) => (n === 0 ? "80+ structures" : `${n} ${n === 1 ? "structure" : "structures"}`);

export default function AnatomyLab() {
  useSession();
  return (
    <>
      <section className="anatomy-hero">
        <img src="/anatomy/hero.jpg" alt="" />
        <div className="anatomy-hero-text">
          <p className="anatomy-kicker">Anatomy lab</p>
          <h1>Explore the human body in 3D</h1>
          <p className="lede">
            Learn the inside of the body from a real patient&apos;s CT scan. Pick a system, turn it in 3D, take it apart
            layer by layer and click any part to see what it does.
          </p>
          <ul className="anatomy-stats">
            <li><b>80+</b> structures outlined</li>
            <li><b>133</b> CT slices</li>
            <li><b>7</b> guided lessons</li>
          </ul>
          <Link className="btn" href="/anatomy/chest">Start with the whole chest</Link>
        </div>
      </section>

      <h2 className="section-title">Choose a system</h2>
      <ul className="topic-grid">
        {TOPICS.map((t) => {
          const body = (
            <>
              <img src={t.image} alt="" loading="lazy" />
              <div className="topic-body">
                <span className="topic-system">{t.system}</span>
                <strong>{t.title}</strong>
                <span className="topic-blurb">{t.blurb}</span>
                <span className="topic-foot">
                  {t.later ? <span className="topic-tag">Coming soon</span> : <><span>{parts(t.organs.length)}</span><span className="btn btn-sm topic-btn">Explore in 3D</span></>}
                </span>
              </div>
            </>
          );
          return (
            <li key={t.id}>
              {t.later ? <div className="topic topic-later" aria-disabled="true">{body}</div> : <Link className="topic" href={`/anatomy/${t.id}`}>{body}</Link>}
            </li>
          );
        })}
      </ul>
      <p className="fine">
        For learning only. The structures were outlined automatically by TotalSegmentator, an open-source AI model, on an
        anonymised chest CT from The Cancer Imaging Archive (LIDC-IDRI, CC BY 3.0); expect small errors at the edges.
        Card images are illustrations, except Lungs and airways, which is a 3D render of that scan.
      </p>
    </>
  );
}
