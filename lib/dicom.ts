import dicomParser from "dicom-parser";

// What ScanLens keeps from a DICOM header. Nothing here identifies the patient.
export type DicomInfo = {
  modality?: string; bodyPart?: string; description?: string; manufacturer?: string;
  rows: number; cols: number; frames: number;
  // The frame that was analysed, counting from 0.
  frame?: number;
  sliceThickness?: number; pixelSpacing?: string;
  window?: { center: number; width: number };
};

export type Window = { center: number; width: number };

// Common viewing windows in Hounsfield units. They only make sense for CT.
export const CT_WINDOWS: { name: string; window: Window }[] = [
  { name: "Lung", window: { center: -600, width: 1500 } },
  { name: "Soft tissue", window: { center: 40, width: 400 } },
  { name: "Bone", window: { center: 400, width: 1800 } },
  { name: "Brain", window: { center: 40, width: 80 } },
];

// Header fields that can identify a patient, staff or hospital. They are blanked in the copy
// that gets uploaded. Burned-in text in the pixels is handled by Crop or cover text instead.
const IDENTIFYING = [
  "x00100010", "x00100020", "x00100030", "x00100032", "x00101000", "x00101001", "x00101040", "x00102154",
  "x00101060", "x001021b0", "x00104000",
  "x00080050", "x00080080", "x00080081", "x00080090", "x00080092", "x00080094", "x00081010",
  "x00081040", "x00081048", "x00081050", "x00081060", "x00081070", "x00321032", "x00200010",
  "x00080020", "x00080021", "x00080022", "x00080023", "x00080030", "x00080031", "x00080032", "x00080033",
];

export type Dicom = {
  info: DicomInfo;
  // Whether the image is CT, so Hounsfield windows apply.
  isCT: boolean;
  // How many identifying fields were blanked.
  blanked: number;
  render: (frame: number, window: Window | null) => Promise<Blob>;
  anonymised: Blob;
};

const num = (s: string | undefined) => {
  const v = parseFloat((s ?? "").split("\\")[0]);
  return isFinite(v) ? v : undefined;
};

// Reads an uncompressed greyscale DICOM, single- or multi-frame.
export async function readDicom(file: File): Promise<Dicom> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ds = dicomParser.parseDicom(bytes);
  const ts = ds.string("x00020010");
  if (ts && ts !== "1.2.840.10008.1.2" && ts !== "1.2.840.10008.1.2.1") {
    throw new Error("Compressed DICOM is not supported yet. Export it as PNG or uncompressed DICOM.");
  }
  if ((ds.uint16("x00280002") ?? 1) !== 1) throw new Error("Colour DICOM images aren't supported. Export it as PNG instead.");
  const rows = ds.uint16("x00280010")!;
  const cols = ds.uint16("x00280011")!;
  const bits = ds.uint16("x00280100") ?? 16;
  const signed = ds.uint16("x00280103") === 1;
  const slope = parseFloat(ds.string("x00281053") ?? "1") || 1;
  const icpt = parseFloat(ds.string("x00281052") ?? "0") || 0;
  const frames = parseInt(ds.string("x00280008") ?? "1", 10) || 1;
  const invert = ds.string("x00280004") === "MONOCHROME1";
  const el = ds.elements.x7fe00010;
  if (!el) throw new Error("No pixel data found in this DICOM file.");

  const center = num(ds.string("x00281050"));
  const width = num(ds.string("x00281051"));
  const modality = ds.string("x00080060")?.trim();
  const info: DicomInfo = {
    modality, bodyPart: ds.string("x00180015")?.trim(), description: ds.string("x00081030")?.trim(),
    manufacturer: ds.string("x00080070")?.trim(),
    rows, cols, frames,
    sliceThickness: num(ds.string("x00180050")), pixelSpacing: ds.string("x00280030")?.replace("\\", " × "),
    window: center != null && width != null ? { center, width } : undefined,
  };

  // Blank identifying fields in a copy: same length, so the file stays valid.
  const copy = bytes.slice();
  let blanked = 0;
  for (const tag of IDENTIFYING) {
    const e = ds.elements[tag];
    if (e && e.length > 0) {
      copy.fill(0x20, e.dataOffset, e.dataOffset + e.length);
      blanked++;
    }
  }

  const n = rows * cols;
  const size = n * (bits / 8);
  function pixels(frame: number) {
    const start = el.dataOffset + frame * size;
    const buf = bytes.slice(start, start + size).buffer;
    const raw = bits === 16 ? (signed ? new Int16Array(buf) : new Uint16Array(buf)) : new Uint8Array(buf);
    const vals = new Float32Array(n);
    for (let i = 0; i < n; i++) vals[i] = raw[i] * slope + icpt;
    return vals;
  }

  async function render(frame: number, window: Window | null): Promise<Blob> {
    const vals = pixels(Math.min(frame, frames - 1));
    let lo: number, hi: number;
    if (window) {
      lo = window.center - window.width / 2;
      hi = window.center + window.width / 2;
    } else {
      lo = Infinity; hi = -Infinity;
      for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(cols, rows);
    for (let i = 0; i < n; i++) {
      let g = Math.max(0, Math.min(255, ((vals[i] - lo) / (hi - lo || 1)) * 255));
      if (invert) g = 255 - g;
      img.data.set([g, g, g, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG conversion failed"))), "image/png"));
  }

  return { info, isCT: modality === "CT", blanked, render, anonymised: new Blob([copy], { type: "application/dicom" }) };
}
