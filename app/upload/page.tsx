"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { readDicom, CT_WINDOWS, type Dicom, type Window } from "@/lib/dicom";
import ScanImage from "@/components/ScanImage";
import ImageEditor, { type Edits } from "@/components/ImageEditor";
import type { Test } from "@/lib/tests";
import { SAMPLES, type Sample } from "@/lib/samples";
import Stage from "@/components/Stage";
import CasePicker from "@/components/CasePicker";
import DicomFacts from "@/components/DicomFacts";

const isDicomFile = (f: File) => /\.(dcm|dicom)$/i.test(f.name) || f.type === "application/dicom";

// The model endpoint expects PNG, so other image formats are redrawn as PNG in the browser.
async function imageToPng(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("The image couldn't be converted to PNG."))), "image/png"));
}

const formatName = (f: File) => {
  if (isDicomFile(f)) return "DICOM, converted to PNG";
  if (f.type === "image/png") return "PNG";
  return "JPG, converted to PNG";
};

const SCAN_NAMES: Record<string, string> = {
  "chest-xray": "Chest X-ray", "chest-ct": "Chest CT", "brain-mri": "Brain MRI", "bone-xray": "Bone X-ray",
  "knee-xray": "Knee X-ray", "retina-photo": "Retina photo", "skin-photo": "Skin photo",
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export default function Upload() {
  const session = useSession();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [png, setPng] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const [errTitle, setErrTitle] = useState("");
  const [tests, setTests] = useState<Test[] | null>(null);
  const [testsErr, setTestsErr] = useState("");
  const [testId, setTestId] = useState("auto");
  const [sample, setSample] = useState<Sample | null>(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Edits | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [dicom, setDicom] = useState<Dicom | null>(null);
  const [frame, setFrame] = useState(0);
  const [win, setWin] = useState<Window | null>(null);

  useEffect(() => {
    // "Add a scan" on a case page comes here with ?case=<id>.
    const c = new URLSearchParams(window.location.search).get("case");
    if (c) setCaseId(c);
    fetch("/api/tests")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setTests(body);
        let last = "";
        try { last = localStorage.getItem("lastTest") ?? ""; } catch {}
        if (last === "auto" || body.some((t: Test) => t.id === last)) setTestId(last);
      })
      .catch((e) => setTestsErr((e as Error).message || "The list of tests couldn't be loaded."));
  }, []);

  function chooseTest(id: string) {
    setTestId(id);
    setErr("");
    try { localStorage.setItem("lastTest", id); } catch {}
  }

  // Group tests by the kind of scan they need, keeping the server's order.
  const groups: [string, Test[]][] = [];
  for (const t of tests ?? []) {
    const g = groups.find(([name]) => name === t.scan_name);
    if (g) g[1].push(t);
    else groups.push([t.scan_name, [t]]);
  }
  const chosen = tests?.find((t) => t.id === testId);

  function show(blob: Blob) {
    if (preview) URL.revokeObjectURL(preview);
    setPng(blob);
    setPreview(URL.createObjectURL(blob));
  }

  async function pick(f: File | null, from: Sample | null = null) {
    setErr(""); setPng(null); setPreview(""); setFile(f); setSample(from); setEditing(false); setEdits(null); setDicom(null);
    if (!f) return;
    try {
      if (isDicomFile(f)) {
        const d = await readDicom(f);
        const w = d.info.window ?? null;
        setDicom(d); setFrame(0); setWin(w);
        show(await d.render(0, w));
      } else if (f.type === "image/png") show(f);
      else if (f.type === "image/jpeg") show(await imageToPng(f));
      else throw new Error("This file type isn't supported. Use a PNG, a JPG, or an uncompressed DICOM file.");
    } catch (e) {
      setFile(null);
      setErr((e as Error).message);
    }
  }

  // Re-draws the DICOM with another frame or window. Edits are dropped: they were made on the old picture.
  async function redraw(nextFrame: number, nextWin: Window | null) {
    if (!dicom) return;
    setFrame(nextFrame); setWin(nextWin); setEdits(null);
    show(await dicom.render(nextFrame, nextWin));
  }

  async function pickSample(s: Sample) {
    try {
      const r = await fetch(`/samples/${s.file}`);
      if (!r.ok) throw new Error();
      await pick(new File([await r.blob()], s.file, { type: "image/jpeg" }), s);
    } catch {
      setErr("The sample couldn't be loaded. Refresh the page and try again.");
    }
  }

  function applyEdits(blob: Blob, e: Edits) {
    show(blob);
    setEdits(e);
    setEditing(false);
  }

  async function analyse() {
    if (!file || !png || !session || !testId) return;
    setBusy(true); setErr(""); setErrTitle("");
    try {
      const uid = session.user.id;
      const base = `${uid}/${crypto.randomUUID()}`;
      const imagePath = `${base}.png`;
      let dicomPath: string | undefined;

      const up = await supabase.storage.from("scans").upload(imagePath, png, { contentType: "image/png" });
      if (up.error) throw up.error;
      // Keep the DICOM alongside the PNG, with identifying header fields blanked.
      // An edited image skips it: the original still holds the cropped-out or covered parts.
      if (dicom && !edits) {
        dicomPath = `${base}.dcm`;
        const d = await supabase.storage.from("scans").upload(dicomPath, dicom.anonymised, { contentType: "application/dicom" });
        if (d.error) throw d.error;
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          imagePath, dicomPath, testId, sampleId: sample?.id, caseId,
          dicom: dicom ? { ...dicom.info, frame, window: win ?? undefined } : undefined,
        }),
      });
      const body = await res.json();
      if (res.status === 422) setErrTitle(chosen ? "Wrong kind of scan for this test" : "This image can't be tested");
      if (!res.ok) throw new Error(body.error ?? "The analysis failed.");
      router.push(`/scan/${body.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const error = err && (
    <div className="callout bad" role="alert"><strong>{errTitle || (png ? "The scan wasn't analysed" : "That file can't be used")}</strong>{err}</div>
  );
  const windows = dicom ? [
    ...(dicom.info.window ? [{ name: "From file", window: dicom.info.window }] : []),
    ...(dicom.isCT ? CT_WINDOWS : []),
  ] : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New analysis</h1>
          <p className="lede">Upload one scan, then choose a test. Each test is a model trained for one kind of scan, and the scan is checked before the test runs.</p>
        </div>
      </div>

      {!preview ? (
        <>
          {error}
          <label
            className={over ? "drop over" : "drop"}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0] ?? null); }}
          >
            <input className="sr-only" type="file" accept=".dcm,.dicom,.png,.jpg,.jpeg,application/dicom,image/png,image/jpeg" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" />
            </svg>
            <strong>Drop a scan here</strong>
            <span className="muted">PNG, JPG, or uncompressed DICOM (single or multi-frame), one image at a time</span>
            <span className="btn btn-quiet" aria-hidden="true">Choose a file</span>
          </label>

          <section className="samples" aria-labelledby="samples-h">
            <h2 id="samples-h" className="section-title">Or try a sample scan</h2>
            <p className="muted">Anonymised scans from public research datasets, each with a known answer to compare against.</p>
            <ul className="sample-grid">
              {SAMPLES.map((s) => (
                <li key={s.id}>
                  <button type="button" className="sample" onClick={() => pickSample(s)}>
                    <img src={`/samples/${s.file}`} alt="" loading="lazy" />
                    <strong>{SCAN_NAMES[s.scan] ?? s.scan}</strong>
                    <span className="muted">Known answer: {s.truth}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : editing ? (
        <ImageEditor src={preview} onApply={applyEdits} onCancel={() => setEditing(false)} />
      ) : (
        <div className="scan-layout">
          <div className="scan-main">
            <Stage word={dicom?.info.modality ?? (sample ? SCAN_NAMES[sample.scan] : undefined)}>
              <ScanImage src={preview} alt="Preview of the selected scan" natural scanning={busy} overlays={{ bl: file?.name }} />
            </Stage>
            {dicom && (dicom.info.frames > 1 || windows.length > 0) && (
              <div className="card dicom-tools">
                {dicom.info.frames > 1 && (
                  <label className="field">
                    <span>Frame {frame + 1} of {dicom.info.frames}</span>
                    <input type="range" min={0} max={dicom.info.frames - 1} value={frame} disabled={busy}
                      onChange={(e) => redraw(Number(e.target.value), win)} />
                  </label>
                )}
                {windows.length > 0 && (
                  <div>
                    <p className="small muted" id="win-h">Window</p>
                    <div className="seg" role="radiogroup" aria-labelledby="win-h">
                      {[...windows, { name: "Full range", window: null }].map((w) => (
                        <button key={w.name} type="button" role="radio" disabled={busy}
                          aria-checked={win?.center === w.window?.center && win?.width === w.window?.width}
                          onClick={() => redraw(frame, w.window)}>{w.name}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {dicom && <DicomFacts info={{ ...dicom.info, frame }} blanked={dicom.blanked} />}
          </div>
          <aside className="scan-side">
            <section className="card">
              <h2 className="card-title">{busy ? "Analysing…" : "Choose what to run"}</h2>
              <p className="muted small">
                {busy
                  ? chosen
                    ? `Checking the scan type, then running the ${chosen.name} test. The first run of a test can take up to a minute.`
                    : "Working out what kind of scan this is, then running every test made for it. This can take up to a minute."
                  : "Not sure which test you need? Leave it on the first option."}
              </p>
              {testsErr && <div className="callout bad" role="alert"><strong>Tests aren&apos;t available</strong>{testsErr}</div>}
              {!tests && !testsErr && <p className="muted">Loading tests…</p>}
              {tests && (
                <fieldset className="tests" disabled={busy}>
                  <legend className="sr-only">Test to run</legend>
                  <label className={testId === "auto" ? "test on" : "test"}>
                    <input type="radio" name="test" value="auto" checked={testId === "auto"} onChange={() => chooseTest("auto")} />
                    <span>
                      <strong>Every matching test</strong>
                      <span className="muted">Checks what kind of scan this is, then runs every test made for it.</span>
                    </span>
                  </label>
                  {groups.map(([scanName, list]) => (
                    <div key={scanName} className="test-group">
                      <p className="test-scan">{capital(scanName)}</p>
                      {list.map((t) => (
                        <label key={t.id} className={testId === t.id ? "test on" : "test"}>
                          <input type="radio" name="test" value={t.id} checked={testId === t.id} onChange={() => chooseTest(t.id)} />
                          <span>
                            <strong>{t.name}</strong>
                            <span className="muted">{t.about}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </fieldset>
              )}
            </section>

            <section className="card">
              <CasePicker value={caseId} onChange={setCaseId} disabled={busy} label="Patient case (optional)" />
              {!sample && !edits && (
                <p className="fine caution">Names, dates or ID numbers on the image? Use Crop or cover text to remove them before analysing.</p>
              )}
              {sample && <p className="known">Sample scan. The dataset labels it <strong>{sample.truth}</strong>.</p>}
              <dl className="facts">
                <div><dt>File</dt><dd>{file?.name}</dd></div>
                <div><dt>Size</dt><dd>{file && kb(file.size)}</dd></div>
                <div><dt>Format</dt><dd>{file && formatName(file)}</dd></div>
                {edits && <div><dt>Edited</dt><dd>{[edits.cropped && "cropped", edits.covered > 0 && `${edits.covered} ${edits.covered === 1 ? "area" : "areas"} covered`].filter(Boolean).join(", ")}</dd></div>}
              </dl>
              {error}
              <div className="actions">
                <button className="btn" disabled={busy || !testId} onClick={analyse}>{busy ? "Analysing…" : "Analyse scan"}</button>
                <button className="btn btn-quiet" disabled={busy} onClick={() => setEditing(true)}>{edits ? "Edit again" : "Crop or cover text"}</button>
                <button className="btn btn-quiet" disabled={busy} onClick={() => pick(null)}>Choose a different file</button>
              </div>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
