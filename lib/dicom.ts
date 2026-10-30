import dicomParser from "dicom-parser";

// Converts an uncompressed single-frame DICOM to a PNG for preview and model input.
export async function dicomToPng(file: File): Promise<Blob> {
  const ds = dicomParser.parseDicom(new Uint8Array(await file.arrayBuffer()));
  const ts = ds.string("x00020010");
  if (ts && ts !== "1.2.840.10008.1.2" && ts !== "1.2.840.10008.1.2.1") {
    throw new Error("Compressed DICOM is not supported yet. Export it as PNG or uncompressed DICOM.");
  }
  const rows = ds.uint16("x00280010")!;
  const cols = ds.uint16("x00280011")!;
  const bits = ds.uint16("x00280100") ?? 16;
  const signed = ds.uint16("x00280103") === 1;
  const slope = parseFloat(ds.string("x00281053") ?? "1") || 1;
  const icpt = parseFloat(ds.string("x00281052") ?? "0") || 0;
  const el = ds.elements.x7fe00010;
  if (!el) throw new Error("No pixel data found in this DICOM file.");

  const n = rows * cols;
  const bytes = ds.byteArray.slice(el.dataOffset, el.dataOffset + n * (bits / 8));
  const raw =
    bits === 16
      ? signed ? new Int16Array(bytes.buffer) : new Uint16Array(bytes.buffer)
      : new Uint8Array(bytes.buffer);

  const vals = new Float32Array(n);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = raw[i] * slope + icpt;
    vals[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const wc = parseFloat((ds.string("x00281050") ?? "").split("\\")[0]);
  const ww = parseFloat((ds.string("x00281051") ?? "").split("\\")[0]);
  const lo = isFinite(wc) && isFinite(ww) ? wc - ww / 2 : min;
  const hi = isFinite(wc) && isFinite(ww) ? wc + ww / 2 : max;
  const invert = ds.string("x00280004") === "MONOCHROME1";

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
