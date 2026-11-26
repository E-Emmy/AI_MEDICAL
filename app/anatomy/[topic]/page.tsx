"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import OrganExplorer from "@/components/OrganExplorer";
import { TOPICS, findTopic } from "@/lib/anatomy";
import { presentOrgans, type OrganStat, type PresentOrgan } from "@/lib/organs";
import { findSeriesSample } from "@/lib/seriesSamples";

const SeriesViewer = dynamic(() => import("@/components/SeriesViewer"), { ssr: false });

// Every lesson uses the sample chest CT, the scan with an organ map.
const SCAN = findSeriesSample("sample-chest-ct")!;

export default function AnatomyTopic({ params }: { params: Promise<{ topic: string }> }) {
  const { topic: id } = use(params);
  const topic = findTopic(id);
  const url = SCAN.scan;
  const [err, setErr] = useState("");
  const [list, setList] = useState<PresentOrgan[] | null>(null);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [hideScan, setHideScan] = useState(true);
  const [labels, setLabels] = useState(true);
  const [focus, setFocus] = useState<{ pos: [number, number, number]; n: number } | null>(null);

  useEffect(() => {
    if (!topic) return;
    fetch(`${SCAN.organs}.organs.json`).then((r) => r.json()).then((stats: OrganStat[]) => {
      const all = presentOrgans(stats);
      setList(all);
      setVisible(new Set(topic.organs.length ? all.filter((o) => topic.organs.includes(o.id)).map((o) => o.id) : all.map((o) => o.id)));
    }).catch(() => setErr("The organ map couldn't be loaded. Reload the page."));
  }, [topic]);

  const organs = useMemo(
    () => (list ? { url: `${SCAN.organs}.organs.nii.gz`, list, visible, hideScan, labels } : null),
    [list, visible, hideScan, labels],
  );

  if (!topic) {
    return (
      <div className="callout bad" role="alert">
        <strong>That lesson doesn&apos;t exist</strong>
        <Link href="/anatomy">Back to the anatomy lab</Link>
      </div>
    );
  }

  function select(o: PresentOrgan) {
    setSelected(o.id);
    if (!visible.has(o.id)) setVisible(new Set([...visible, o.id]));
    setFocus({ pos: o.center, n: Date.now() });
  }

  return (
    <>
      <section className="lesson-hero">
        <img src={topic.image} alt="" />
        <div className="lesson-hero-text">
          <p className="crumbs"><Link href="/anatomy">Anatomy lab</Link> <span aria-hidden="true">/</span> {topic.system}</p>
          <h1>{topic.title}</h1>
          <p>{topic.blurb}</p>
        </div>
      </section>
      <nav className="topic-nav" aria-label="Lessons">
        {TOPICS.filter((t) => !t.later).map((t) => (
          <Link key={t.id} href={`/anatomy/${t.id}`} aria-current={t.id === topic.id ? "page" : undefined}>{t.title}</Link>
        ))}
      </nav>
      {err && <div className="callout bad" role="alert"><strong>The lesson couldn&apos;t be opened</strong>{err}</div>}

      <div className="scan-layout series-layout">
        <div className="scan-main">
          {url ? (
            <SeriesViewer key={topic.id} url={url} kind="chest-ct" initialView="3d" focus={focus}
              organs={organs} onOrganAt={(o) => setSelected(o)} />
          ) : (
            <div className="viewer-placeholder">Loading scan…</div>
          )}
          <div className="lesson">
            <div className="card lesson-read">
              <p className="lesson-kicker">Lesson</p>
              <h2>{topic.title}</h2>
              {topic.lesson.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="card lesson-try">
              <p className="lesson-kicker">Try this</p>
              <ol>{topic.tryThis.map((t, i) => <li key={i}>{t}</li>)}</ol>
            </div>
          </div>
        </div>
        <aside className="scan-side">
          {list && (
            <OrganExplorer organs={list} visible={visible} onVisible={setVisible} selected={selected}
              onSelect={select} hideScan={hideScan} onHideScan={setHideScan} labels={labels} onLabels={setLabels} />
          )}
          <p className="fine">
            Scan: <a href={SCAN.url} target="_blank" rel="noreferrer">{SCAN.credit}</a>. For learning only; the outlines are
            automatic and descriptions simplified.
          </p>
        </aside>
      </div>
    </>
  );
}
