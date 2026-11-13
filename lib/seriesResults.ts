// What the model server returns for a full scan (model-server/series.py). Slice numbers (k) count
// axial slices from the bottom of the scan, after turning it to standard (RAS) orientation, which is
// also how the viewer orders them.

export type SeriesPeak = { x: number; y: number; strength: number };

export type FlaggedSlice = {
  k: number;
  label: string;
  score: number;
  // Where the slice was cropped to the body before the test ran: [row0, row1, col0, col1] in the slice
  // as displayed (front at the top, patient's right on the left).
  box: [number, number, number, number];
  // 8 x 8 heatmap over the cropped slice, rows top to bottom, 0-1. Only for the most confident slices.
  grid?: number[][];
  peaks?: SeriesPeak[];
};

export type SeriesReview = { verdict: "agree" | "disagree" | "unsure"; note?: string; updated_at: string };

export type SeriesResults = {
  test: { id: string; name: string; scan: string; scan_name: string };
  model: string;
  dims: [number, number, number];
  // Voxel to millimetres for the RAS-oriented scan the slices came from.
  affine: number[][];
  analysed: { k: number; label: string; score: number }[];
  skipped: number;
  flagged: FlaggedSlice[];
  summary: {
    label: string | null;
    flagged: number;
    analysed: number;
    first: number | null;
    last: number | null;
    strongest: { k: number; label: string; score: number } | null;
  };
  analysed_at?: string;
  review?: SeriesReview;
};

// Which test runs on which kind of full scan; mirrors TESTS in model-server/series.py.
export const SERIES_TEST: Partial<Record<string, string>> = {
  "brain-mri": "Brain tumour",
  "chest-ct": "Lung cancer",
};

// Where a slice's finding is in the volume, as RAS voxel fractions for the viewer's crosshair.
export function findingPosition(r: SeriesResults, f: FlaggedSlice): [number, number, number] {
  const [nx, ny, nz] = r.dims;
  const [r0, r1, c0, c1] = f.box;
  const p = f.peaks?.[0] ?? { x: 0.5, y: 0.5 };
  const row = r0 + p.y * (r1 - r0), col = c0 + p.x * (c1 - c0);
  // Displayed rows run front to back (y falling) and columns right to left (x falling).
  const x = nx - 1 - col, y = ny - 1 - row;
  return [(x + 0.5) / nx, (y + 0.5) / ny, (f.k + 0.5) / nz];
}

// A 3D map of where the model looked, at reduced resolution, as a float volume with its own affine.
// Slices with a heatmap use it; flagged slices without one borrow the nearest heatmap within 3 slices.
export function buildOverlay(r: SeriesResults): { data: Float32Array; dims: [number, number, number]; affine: number[][] } | null {
  const [nx, ny, nz] = r.dims;
  const withGrid = r.flagged.filter((f) => f.grid);
  if (withGrid.length === 0) return null;
  const s = Math.max(1, Math.floor(Math.max(nx, ny) / 96));
  const ox = Math.ceil(nx / s), oy = Math.ceil(ny / s);
  const data = new Float32Array(ox * oy * nz);

  const sample = (g: number[][], v: number, u: number) => {
    // Bilinear between cell centres, so the map is smooth rather than blocky.
    const n = g.length;
    const fy = Math.min(Math.max(v * n - 0.5, 0), n - 1), fx = Math.min(Math.max(u * n - 0.5, 0), n - 1);
    const y0 = Math.floor(fy), x0 = Math.floor(fx), y1 = Math.min(y0 + 1, n - 1), x1 = Math.min(x0 + 1, n - 1);
    const ty = fy - y0, tx = fx - x0;
    return (g[y0][x0] * (1 - tx) + g[y0][x1] * tx) * (1 - ty) + (g[y1][x0] * (1 - tx) + g[y1][x1] * tx) * ty;
  };

  for (const f of r.flagged) {
    const source = f.grid ? f : withGrid.reduce((a, b) => (Math.abs(b.k - f.k) < Math.abs(a.k - f.k) ? b : a));
    if (Math.abs(source.k - f.k) > 3) continue;
    const g = source.grid!;
    const [r0, r1, c0, c1] = f.box;
    const weight = f.grid ? f.score : f.score * 0.8;
    for (let j = 0; j < oy; j++) {
      const row = ny - 1 - (j * s + (s - 1) / 2);
      const v = (row - r0) / (r1 - r0);
      if (v < 0 || v >= 1) continue;
      for (let i = 0; i < ox; i++) {
        const col = nx - 1 - (i * s + (s - 1) / 2);
        const u = (col - c0) / (c1 - c0);
        if (u < 0 || u >= 1) continue;
        // Squared, so the map narrows to where the model looked most rather than the whole 8 x 8 grid.
        data[f.k * ox * oy + j * ox + i] = sample(g, v, u) ** 2 * weight;
      }
    }
  }
  // Findings are only on some slices, so on their own they'd look like separate thin layers in 3D.
  // Spread each slice to its neighbours within about 5 mm (fading with distance) to make solid shapes.
  const a = r.affine;
  const dz = Math.hypot(a[0][2], a[1][2], a[2][2]) || 1;
  const reach = Math.max(1, Math.round(5 / dz));
  const plane = ox * oy;
  const spread = new Float32Array(data.length);
  for (let k = 0; k < nz; k++) {
    for (let d = -reach; d <= reach; d++) {
      const from = k + d;
      if (from < 0 || from >= nz) continue;
      const fade = 1 - (0.5 * Math.abs(d)) / (reach + 1);
      for (let p = 0; p < plane; p++) {
        const v = data[from * plane + p] * fade;
        if (v > spread[k * plane + p]) spread[k * plane + p] = v;
      }
    }
  }
  data.set(spread);
  // Overlay voxel (i, j) sits at the centre of the s x s block of scan voxels it covers.
  const off = (s - 1) / 2;
  const affine = [0, 1, 2].map((row) => [a[row][0] * s, a[row][1] * s, a[row][2], a[row][3] + (a[row][0] + a[row][1]) * off]);
  return { data, dims: [ox, oy, nz], affine };
}
