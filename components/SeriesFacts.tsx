import { KIND_NAMES, type SeriesFacts, type SeriesKind } from "@/lib/series";
import { mm } from "@/lib/seriesApi";

// What is known about a full scan. Never patient details.
export default function SeriesFactsList({ kind, facts }: { kind: SeriesKind; facts: SeriesFacts }) {
  const [x, y, z] = facts.size;
  return (
    <dl className="facts">
      <div><dt>Type</dt><dd>{KIND_NAMES[kind]}</dd></div>
      <div><dt>Slices</dt><dd>{z}</dd></div>
      <div><dt>Slice size</dt><dd>{x} × {y} pixels</dd></div>
      <div><dt>Voxel size</dt><dd>{facts.spacing.map(mm).join(" × ")} mm</dd></div>
      {facts.sliceThickness != null && <div><dt>Slice thickness</dt><dd>{mm(facts.sliceThickness)} mm</dd></div>}
      {facts.description && <div><dt>Series</dt><dd>{facts.description}</dd></div>}
    </dl>
  );
}

