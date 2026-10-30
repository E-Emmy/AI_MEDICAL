export type Prediction = { label: string; score: number };
export type Region = { label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } };

// Handles classification and object-detection outputs. Anything else (e.g. segmentation masks)
// is kept in `raw` and NOT drawn, so we never show highlights the model did not provide.
export function normalise(raw: unknown): { predictions: Prediction[]; regions: Region[] } {
  const items = Array.isArray(raw) ? raw : [];
  const predictions: Prediction[] = [];
  const regions: Region[] = [];
  for (const it of items) {
    if (typeof it?.label !== "string" || typeof it?.score !== "number") continue;
    predictions.push({ label: it.label, score: it.score });
    const b = it.box;
    if (b && [b.xmin, b.ymin, b.xmax, b.ymax].every((n: unknown) => typeof n === "number")) {
      regions.push({ label: it.label, score: it.score, box: b });
    }
  }
  predictions.sort((a, b) => b.score - a.score);
  return { predictions, regions };
}
