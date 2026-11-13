import dicomParser from "dicom-parser";

// A full CT or MRI scan: many slices stacked into one 3D block. Everything here runs in the browser,
// so the original DICOM files (and the patient details in their headers) never leave the computer.
// Only the pixels and the scan geometry are kept, written out as one NIfTI file.

export type SeriesKind = "brain-mri" | "chest-ct" | "other-ct" | "other-mri";

export const KIND_NAMES: Record<SeriesKind, string> = {
  "brain-mri": "Brain MRI",
  "chest-ct": "Chest CT",
  "other-ct": "Other CT",
  "other-mri": "Other MRI",
};

// What is kept about a series. Nothing here identifies the patient.
export type SeriesFacts = {
  modality?: string;
  bodyPart?: string;
  description?: string;
  // Voxels across, down and the number of slices.
  size: [number, number, number];
  // Millimetres between voxel centres in each direction.
  spacing: [number, number, number];
  sliceThickness?: number;
  // Lowest and highest value (Hounsfield units for CT).
  range: [number, number];
  // Files that were in the folder but weren't slices of the chosen series.
  skipped?: number;
};

export type Volume = {
  facts: SeriesFacts;
  // Voxel values, columns fastest, then rows, then slices.
  data: Int16Array;
  // Voxel index to scanner millimetres (RAS), the 3 x 4 rows of a NIfTI sform.
  affine: number[][];
};

const UNCOMPRESSED = new Set(["1.2.840.10008.1.2", "1.2.840.10008.1.2.1", "1.2.840.10008.1.2.2"]);

const nums = (s: string | undefined) => (s ?? "").split("\\").map(parseFloat).filter((v) => isFinite(v));
const text = (s: string | undefined) => s?.trim().slice(0, 120) || undefined;
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

type Slice = {
  series: string;
  rows: number; cols: number;
  orient: number[]; pos: number[]; spacing: number[];
  thickness?: number; modality?: string; bodyPart?: string; description?: string;
  read: () => Int16Array;
};

// Reads one file. Returns null for anything that isn't an image slice (licence files, reports, .DS_Store).
function readSlice(bytes: Uint8Array): Slice | null {
  let ds: dicomParser.DataSet;
  try { ds = dicomParser.parseDicom(bytes); } catch { return null; }
  const pixels = ds.elements.x7fe00010;
  const rows = ds.uint16("x00280010"), cols = ds.uint16("x00280011");
  const orient = nums(ds.string("x00200037")), pos = nums(ds.string("x00200032")), spacing = nums(ds.string("x00280030"));
  if (!pixels || !rows || !cols || orient.length !== 6 || pos.length !== 3) return null;

  const ts = ds.string("x00020010");
  if (ts && !UNCOMPRESSED.has(ts)) throw new Error("These DICOM files are compressed, which isn't supported yet. Export the series as uncompressed DICOM or as a .nii.gz file.");
  if ((ds.uint16("x00280002") ?? 1) !== 1) throw new Error("Colour DICOM isn't supported. Choose a greyscale CT or MRI series.");
  if ((parseInt(ds.string("x00280008") ?? "1", 10) || 1) > 1) throw new Error("This is a multi-frame DICOM file. Open it in New analysis instead, or export the series as one file per slice.");

  const bits = ds.uint16("x00280100") ?? 16;
  const signed = ds.uint16("x00280103") === 1;
  const slope = parseFloat(ds.string("x00281053") ?? "1") || 1;
  const icpt = parseFloat(ds.string("x00281052") ?? "0") || 0;
  const invert = ds.string("x00280004") === "MONOCHROME1";
  const n = rows * cols;

  return {
    series: ds.string("x0020000e") ?? "",
    rows, cols, orient, pos, spacing: spacing.length === 2 ? spacing : [1, 1],
    thickness: nums(ds.string("x00180050"))[0],
    modality: text(ds.string("x00080060")),
    bodyPart: text(ds.string("x00180015")),
    description: text(ds.string("x0008103e")),
    read() {
      // Copy first: the pixel data can start at an odd byte, which typed arrays can't view directly.
      const raw = bytes.slice(pixels.dataOffset, pixels.dataOffset + n * (bits > 8 ? 2 : 1)).buffer;
      const src = bits > 8 ? (signed ? new Int16Array(raw) : new Uint16Array(raw)) : (signed ? new Int8Array(raw) : new Uint8Array(raw));
      const out = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        let v = src[i] * slope + icpt;
        if (invert) v = -v;
        out[i] = v < -32768 ? -32768 : v > 32767 ? 32767 : Math.round(v);
      }
      return out;
    },
  };
}

// Builds a volume from the files of a DICOM folder. If the folder holds several series, the one
// with the most slices is used.
export async function readDicomSeries(files: File[], onProgress?: (done: number, total: number) => void): Promise<Volume> {
  const slices: Slice[] = [];
  for (let i = 0; i < files.length; i++) {
    const s = readSlice(new Uint8Array(await files[i].arrayBuffer()));
    if (s) slices.push(s);
    onProgress?.(i + 1, files.length);
  }
  if (slices.length === 0) throw new Error("No DICOM image slices were found. Choose the folder that holds the .dcm files of one CT or MRI series.");

  const groups = new Map<string, Slice[]>();
  for (const s of slices) groups.set(s.series, [...(groups.get(s.series) ?? []), s]);
  const biggest = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  const first = biggest[0];
  // Every slice must have the same size and direction as the first, or they can't be stacked.
  const same = biggest.filter((s) => s.rows === first.rows && s.cols === first.cols && s.orient.every((v, i) => Math.abs(v - first.orient[i]) < 1e-3));
  if (same.length < 3) throw new Error("A full scan needs at least 3 slices. For a single image, use New analysis instead.");

  // Put the slices in order along the direction they were taken, dropping exact duplicates.
  const row = first.orient.slice(0, 3), col = first.orient.slice(3, 6), normal = cross(row, col);
  same.sort((a, b) => dot(a.pos, normal) - dot(b.pos, normal));
  const ordered = same.filter((s, i) => i === 0 || Math.abs(dot(s.pos, normal) - dot(same[i - 1].pos, normal)) > 1e-3);
  const gaps = ordered.slice(1).map((s, i) => dot(s.pos, normal) - dot(ordered[i].pos, normal)).sort((a, b) => a - b);
  const step = gaps[Math.floor(gaps.length / 2)] || first.thickness || 1;

  const { rows, cols } = first;
  const per = rows * cols;
  const data = new Int16Array(per * ordered.length);
  let lo = Infinity, hi = -Infinity;
  ordered.forEach((s, k) => {
    const px = s.read();
    data.set(px, k * per);
    for (let i = 0; i < per; i++) { if (px[i] < lo) lo = px[i]; if (px[i] > hi) hi = px[i]; }
  });

  // DICOM positions are LPS (x to the patient's left, y to the back). NIfTI is RAS, so flip x and y.
  const [dy, dx] = first.spacing; // DICOM lists the row spacing (down) before the column spacing (across).
  const o = ordered[0].pos;
  const lps = [0, 1, 2].map((a) => [row[a] * dx, col[a] * dy, normal[a] * step, o[a]]);
  const affine = [lps[0].map((v) => -v), lps[1].map((v) => -v), lps[2]];

  return {
    data, affine,
    facts: {
      modality: first.modality, bodyPart: first.bodyPart, description: first.description,
      size: [cols, rows, ordered.length], spacing: [dx, dy, Math.abs(step)],
      sliceThickness: first.thickness, range: [lo, hi],
      skipped: files.length - ordered.length || undefined,
    },
  };
}

// The 348-byte NIfTI-1 header followed by the voxels, uncompressed.
export function toNifti(v: Volume): ArrayBuffer {
  return writeNifti(v.data, v.facts.size, v.affine);
}

// int16 or float32 voxels, columns fastest, with a 3 x 4 voxel-to-millimetre (RAS) affine.
export function writeNifti(data: Int16Array | Float32Array, size: [number, number, number], affine: number[][]): ArrayBuffer {
  const [nx, ny, nz] = size;
  const float = data instanceof Float32Array;
  const buf = new ArrayBuffer(352 + data.byteLength);
  const h = new DataView(buf);
  h.setInt32(0, 348, true);
  [3, nx, ny, nz, 1, 1, 1, 1].forEach((d, i) => h.setInt16(40 + i * 2, d, true));
  h.setInt16(70, float ? 16 : 4, true); // float32 or int16
  h.setInt16(72, float ? 32 : 16, true);
  const spacing = [0, 1, 2].map((c) => Math.hypot(affine[0][c], affine[1][c], affine[2][c]));
  [1, ...spacing, 0, 0, 0, 0].forEach((d, i) => h.setFloat32(76 + i * 4, d, true));
  h.setFloat32(108, 352, true); // where the voxels start
  h.setFloat32(112, 1, true); // scale slope
  h.setUint8(123, 2); // millimetres
  h.setInt16(254, 1, true); // sform: scanner coordinates
  affine.forEach((r, i) => r.forEach((d, j) => h.setFloat32(280 + i * 16 + j * 4, d, true)));
  [0x6e, 0x2b, 0x31, 0].forEach((c, i) => h.setUint8(344 + i, c)); // "n+1"
  (float ? new Float32Array(buf, 352) : new Int16Array(buf, 352)).set(data);
  return buf;
}

export async function gzip(buf: ArrayBuffer): Promise<Blob> {
  const stream = new Blob([buf]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

// Reads the facts from a NIfTI file someone uploads directly (.nii or .nii.gz).
export async function readNiftiFacts(file: File): Promise<SeriesFacts> {
  let buf = await file.arrayBuffer();
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  const h = new DataView(buf);
  if (h.getInt32(0, true) !== 348) throw new Error("This isn't a NIfTI-1 file. Choose a .nii or .nii.gz scan, or a folder of DICOM slices.");
  const dim = [1, 2, 3].map((i) => h.getInt16(40 + i * 2, true));
  if (h.getInt16(40, true) < 3 || dim[2] < 3) throw new Error("This NIfTI file isn't a 3D scan.");
  const px = [1, 2, 3].map((i) => Math.abs(h.getFloat32(76 + i * 4, true)) || 1);
  return { size: dim as [number, number, number], spacing: px as [number, number, number], range: [0, 0] };
}

// A first guess at what the scan shows, from its header. The person uploading confirms it.
export function guessKind(f: SeriesFacts): SeriesKind {
  const words = `${f.bodyPart ?? ""} ${f.description ?? ""}`.toLowerCase();
  if (f.modality === "CT") return /chest|lung|thorax|thx/.test(words) ? "chest-ct" : "other-ct";
  if (f.modality === "MR") return /head|brain|neuro|skull|cereb/.test(words) || !words.trim() ? "brain-mri" : "other-mri";
  return "brain-mri";
}

export const isCT = (kind: SeriesKind) => kind.endsWith("-ct");
