// Reads the files out of a .zip in the browser, so a zipped DICOM folder can be uploaded without
// unzipping it first. Handles the two methods zip tools use (stored and deflate); not Zip64 (> 4 GB).

const STORED = 0;
const DEFLATE = 8;

export const isZip = (f: File) => /\.zip$/i.test(f.name) || f.type === "application/zip";

export async function readZip(file: File): Promise<File[]> {
  const buf = await file.arrayBuffer();
  const v = new DataView(buf);
  // The end-of-central-directory record is in the last 64 KB (22 bytes plus an optional comment).
  let end = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("This .zip file couldn't be read. Unzip it and choose the folder instead.");
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const names = new TextDecoder();
  const files: File[] = [];

  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("This .zip file is damaged. Unzip it and choose the folder instead.");
    const method = v.getUint16(p + 10, true);
    const packed = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = names.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    // Skip folders and the extra files macOS adds (__MACOSX/, .DS_Store).
    const base = name.split("/").pop() ?? "";
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || base.startsWith(".")) continue;
    // The local header repeats the name and has its own extra field; the data starts after both.
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = new Uint8Array(buf, start, packed);
    let data: Blob;
    if (method === STORED) data = new Blob([raw]);
    else if (method === DEFLATE) data = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
    else throw new Error("This .zip uses a compression method that isn't supported. Unzip it and choose the folder instead.");
    files.push(new File([data], base));
  }
  return files;
}
