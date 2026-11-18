// Traces smooth outlines around the strong areas of a heatmap grid, for drawing over the scan.
// The grid is coarse (8 x 8), so it is first resampled to a fine field with a smooth curve
// through the cell centres, then contour lines are traced at a level and rounded off.

type Pt = [number, number];

const STEPS = 64; // fine-field samples across the image

// Catmull-Rom weights: a smooth curve that passes through each cell centre.
function cubic(p0: number, p1: number, p2: number, p3: number, t: number) {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

function sampler(grid: number[][]) {
  const rows = grid.length, cols = grid[0].length;
  const at = (y: number, x: number) => grid[Math.min(rows - 1, Math.max(0, y))][Math.min(cols - 1, Math.max(0, x))];
  // u, v in 0-1 across the image; cell centres sit at (i + 0.5) / n.
  return (u: number, v: number) => {
    const gx = u * cols - 0.5, gy = v * rows - 0.5;
    const x1 = Math.floor(gx), y1 = Math.floor(gy), tx = gx - x1, ty = gy - y1;
    const row = (y: number) => cubic(at(y, x1 - 1), at(y, x1), at(y, x1 + 1), at(y, x1 + 2), tx);
    return cubic(row(y1 - 1), row(y1), row(y1 + 1), row(y1 + 2), ty);
  };
}

// The fine field, with a ring of zeros around it so every outline closes, even at the image edge.
function field(grid: number[][]) {
  const f = sampler(grid);
  const n = STEPS + 3;
  return Array.from({ length: n }, (_, j) =>
    Array.from({ length: n }, (_, i) => (i === 0 || j === 0 || i === n - 1 || j === n - 1 ? 0 : f((i - 1) / STEPS, (j - 1) / STEPS))),
  );
}

// Marching squares: line segments where the field crosses the level, joined into closed loops.
function trace(F: number[][], level: number): Pt[][] {
  const n = F.length;
  const segs: [Pt, Pt][] = [];
  const lerp = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = F[j][i], b = F[j][i + 1], c = F[j + 1][i + 1], d = F[j + 1][i];
      const k = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const top: Pt = [i + lerp(a, b), j], right: Pt = [i + 1, j + lerp(b, c)];
      const bottom: Pt = [i + lerp(d, c), j + 1], left: Pt = [i, j + lerp(a, d)];
      const centre = (a + b + c + d) / 4 >= level;
      switch (k) {
        case 1: case 14: segs.push([left, bottom]); break;
        case 2: case 13: segs.push([bottom, right]); break;
        case 3: case 12: segs.push([left, right]); break;
        case 4: case 11: segs.push([top, right]); break;
        case 6: case 9: segs.push([top, bottom]); break;
        case 7: case 8: segs.push([left, top]); break;
        case 5: if (centre) segs.push([left, top], [bottom, right]); else segs.push([left, bottom], [top, right]); break;
        case 10: if (centre) segs.push([top, right], [left, bottom]); else segs.push([left, top], [bottom, right]); break;
      }
    }
  }
  // Join segments end to end. Shared crossing points are computed identically, so exact keys match.
  const key = (p: Pt) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const ends = new Map<string, number[]>();
  segs.forEach(([p, q], s) => {
    for (const e of [key(p), key(q)]) ends.set(e, [...(ends.get(e) ?? []), s]);
  });
  const used = new Array(segs.length).fill(false);
  const loops: Pt[][] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const loop: Pt[] = [segs[s][0], segs[s][1]];
    for (;;) {
      const last = loop[loop.length - 1];
      const next = (ends.get(key(last)) ?? []).find((t) => !used[t]);
      if (next === undefined) break;
      used[next] = true;
      const [p, q] = segs[next];
      loop.push(key(p) === key(last) ? q : p);
    }
    loops.push(loop);
  }
  // Back to 0-1 image coordinates (the field has one padding sample on each side).
  return loops.map((l) => l.map(([x, y]) => [(x - 1) / STEPS, (y - 1) / STEPS] as Pt));
}

// Chaikin corner cutting: rounds the marching-squares steps into a smooth curve.
function smooth(loop: Pt[], rounds = 3): Pt[] {
  let pts = loop;
  for (let r = 0; r < rounds; r++) {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    pts = out;
  }
  return pts;
}

function area(loop: Pt[]) {
  let s = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x0, y0] = loop[i], [x1, y1] = loop[(i + 1) % loop.length];
    s += x0 * y1 - x1 * y0;
  }
  return Math.abs(s) / 2;
}

// Closed outlines where the grid reaches `level` (0-1 of its strongest cell), largest first,
// as SVG path data scaled to a w x h image. Specks under 0.2% of the image are dropped.
export function outlines(grid: number[][], level: number, w: number, h: number): string[] {
  if (!grid.length || !grid[0].length) return [];
  return trace(field(grid), level)
    .filter((l) => l.length > 3 && area(l) > 0.002)
    .sort((a, b) => area(b) - area(a))
    .map((l) => smooth(l))
    .map((l) => "M" + l.map(([x, y]) => `${(x * w).toFixed(1)},${(y * h).toFixed(1)}`).join("L") + "Z");
}
