// A test is one model trained for one kind of scan, served by model-server/server.py.
export type Test = { id: string; name: string; scan: string; scan_name: string; model: string; about: string; ready: boolean };

// What the analysis stores in `raw` about which test ran and what the scan-type check saw.
export type TestInfo = { id: string; name: string; scan: string; scan_name: string };
export type ScanCheck = { scan: string; name: string; score: number };

// Where the model looked: an 8 x 8 grid over the whole image (rows top to bottom, 0-1), and the
// centres of up to three separate strong areas as fractions of width and height.
// Analyses saved before multiple areas existed only have `peak`.
export type Heatmap = {
  label: string; grid: number[][]; drop: number;
  peak: { x: number; y: number };
  peaks?: { x: number; y: number; strength: number }[];
};

// Top labels that mean "nothing found". Matches NORMAL_LABELS in model-server/server.py.
const NORMAL = new Set(["normal", "no finding", "no tumor", "not fractured", "negative"]);
export const isNormal = (label: string | null | undefined) => label != null && NORMAL.has(label.toLowerCase());
