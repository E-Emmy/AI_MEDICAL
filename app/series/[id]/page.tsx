"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { KIND_NAMES } from "@/lib/series";
import SeriesFactsList from "@/components/SeriesFacts";
import { findSeriesSample, type SeriesSample } from "@/lib/seriesSamples";
import SeriesAnalysis from "@/components/SeriesAnalysis";
import OrganExplorer from "@/components/OrganExplorer";
import { presentOrgans, type OrganStat, type PresentOrgan } from "@/lib/organs";
import { findingPosition, type FlaggedSlice, type SeriesResults } from "@/lib/seriesResults";

const SeriesViewer = dynamic(() => import("@/components/SeriesViewer"), { ssr: false });

// Only the samples have a page: full scans people open themselves stay in their browser (/series/upload).
export default function FullScan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sample = findSeriesSample(id);
  const [results, setResults] = useState<SeriesResults | null>(null);
  const [showFindings, setShowFindings] = useState(true);
  const [focus, setFocus] = useState<{ pos: [number, number, number]; n: number } | null>(null);
  const [organList, setOrganList] = useState<PresentOrgan[] | null>(null);
  // Lungs, heart and vessels start switched on; bones and the rest are a tick away.
  const [visibleOrgans, setVisibleOrgans] = useState<Set<string>>(new Set());
  const [selectedOrgan, setSelectedOrgan] = useState<string | null>(null);
  const [hideScan, setHideScan] = useState(false);
  const [organLabels, setOrganLabels] = useState(false);
  const organs = useMemo(
    () => (sample?.organs && organList ? { url: `${sample.organs}.organs.nii.gz`, list: organList, visible: visibleOrgans, hideScan, labels: organLabels } : null),
    [sample?.organs, organList, visibleOrgans, hideScan, organLabels],
  );

  useEffect(() => {
    if (!sample) return;
    fetch(sample.results).then((r) => (r.ok ? r.json() : null)).then(setResults).catch(() => {});
  }, [sample]);

  useEffect(() => {
    if (!sample?.organs) return;
    fetch(`${sample.organs}.organs.json`).then((r) => (r.ok ? r.json() : null)).then((stats: OrganStat[] | null) => {
      if (!stats) return;
      const list = presentOrgans(stats);
      setOrganList(list);
      setVisibleOrgans(new Set(list.filter((o) => o.group === "Lungs and airway" || o.group === "Heart and blood vessels").map((o) => o.id)));
    }).catch(() => {});
  }, [sample?.organs]);

  function focusOrgan(o: PresentOrgan) {
    setSelectedOrgan(o.id);
    if (!visibleOrgans.has(o.id)) setVisibleOrgans(new Set([...visibleOrgans, o.id]));
    setFocus({ pos: o.center, n: Date.now() });
  }

  function focusOn(f: FlaggedSlice) {
    if (results) setFocus({ pos: findingPosition(results, f), n: Date.now() });
  }

  if (!sample) {
    return (
      <>
        <header className="scan-head">
          <p className="crumbs-light"><Link href="/series">Full scans</Link></p>
          <h1>Full scan</h1>
        </header>
        <div className="callout bad" role="alert">
          <strong>This full scan isn&apos;t available</strong>
          Full scans are no longer stored online. Open one of the samples, or <Link href="/series/upload">open your own scan</Link> in this browser.
        </div>
      </>
    );
  }

  const { kind, facts } = sample;

  return (
    <>
      <header className="scan-head">
        <p className="crumbs-light"><Link href="/series">Full scans</Link> <span aria-hidden="true">/</span> {KIND_NAMES[kind]}</p>
        <h1>{sample.title} · sample</h1>
        <p className="lede">{sample.finding}.</p>
        <ul className="scan-tags">
          <li>{KIND_NAMES[kind]}</li>
          <li><b>{facts.size[2]}</b> slices</li>
          <li>{facts.size[0]} × {facts.size[1]} px</li>
          <li>{facts.spacing.map((v) => Math.round(v * 100) / 100).join(" × ")} mm voxels</li>
          {results && <li className={results.summary.flagged ? "tag-flag" : "tag-ok"}>{results.summary.flagged ? `${results.summary.flagged} slices flagged` : "No finding"}</li>}
          {organList && <li className="tag-accent">{organList.length} structures outlined</li>}
        </ul>
      </header>

      <div className="scan-layout series-layout">
        <div className="scan-main">
          <SeriesViewer url={sample.scan} kind={kind} results={results} showFindings={showFindings} focus={focus}
            organs={organs} onOrganAt={(id) => organs && setSelectedOrgan(id)} />
        </div>
        <aside className="scan-side">
          <div className="card">
            <h2 className="card-title">About this scan</h2>
            <SeriesFactsList kind={kind} facts={facts} />
          </div>
          <SeriesAnalysis kind={kind} results={results} showFindings={showFindings} onShowFindings={setShowFindings} onFocus={focusOn} />
          <Credit sample={sample} />
          {/* Last in the column: it stays in view while scrolling, so nothing may scroll up underneath it. */}
          {organList && (
            <OrganExplorer organs={organList} visible={visibleOrgans} onVisible={setVisibleOrgans} selected={selectedOrgan}
              onSelect={focusOrgan} hideScan={hideScan} onHideScan={setHideScan} labels={organLabels} onLabels={setOrganLabels} />
          )}
        </aside>
      </div>
    </>
  );
}

function Credit({ sample }: { sample: SeriesSample }) {
  return (
    <p className="fine">
      Source: <a href={sample.url} target="_blank" rel="noreferrer">{sample.credit}</a>.
    </p>
  );
}
