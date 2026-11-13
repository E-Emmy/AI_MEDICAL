"use client";
import { useEffect, useRef, useState } from "react";
import type { Niivue, NiiVueLocation } from "@niivue/niivue";
import { isCT, writeNifti, type SeriesKind } from "@/lib/series";
import { buildOverlay, type SeriesResults } from "@/lib/seriesResults";

type Props = {
  // Where to load the NIfTI file from: a signed R2 link or a local blob: URL.
  url: string;
  kind: SeriesKind;
  // The slice-by-slice analysis, shown in red where the model looked.
  results?: SeriesResults | null;
  showFindings?: boolean;
  // Move the crosshair here (RAS fractions). `n` changes on every request, so the same spot can be revisited.
  focus?: { pos: [number, number, number]; n: number } | null;
};

// Findings below this strength (0-1, heatmap x confidence) aren't drawn, so only clear areas show.
const FINDING_MIN = 0.4;
const FINDING_OPACITY = 0.75;

type View = "all" | "axial" | "coronal" | "sagittal" | "3d";
const VIEWS: [View, string][] = [["all", "All views"], ["axial", "Axial"], ["coronal", "Coronal"], ["sagittal", "Sagittal"], ["3d", "3D"]];
// NiiVue's SLICE_TYPE values.
const SLICE: Record<View, number> = { axial: 0, coronal: 1, sagittal: 2, all: 3, "3d": 4 };
// Which RAS axis the slice slider moves along in each view.
const AXIS: Record<View, number> = { sagittal: 0, coronal: 1, axial: 2, all: 2, "3d": 2 };
const AXIS_NAME = ["Sagittal", "Coronal", "Axial"];

// 3D camera angles. Azimuth 180 looks at the patient's front, 90 at their left side.
const ANGLES: [string, number, number][] = [
  ["Front", 180, 0], ["Back", 0, 0], ["Left", 90, 0], ["Right", 270, 0], ["Top", 180, 90], ["Bottom", 180, -90],
];

// CT windows in Hounsfield units. Anything below `lo` is see-through in 3D, so the 3D-only view uses
// `lo3d` to hide what would block the view: air for the lungs, skin and fat for bone.
// The lung window starts at -950 rather than the usual -1350 so the air around the body stays hidden.
type Win = { name: string; lo: number; hi: number; lo3d: number };
const CT_WINDOWS: Win[] = [
  { name: "Lung", lo: -950, hi: 150, lo3d: -500 },
  { name: "Soft tissue", lo: -160, hi: 240, lo3d: -60 },
  { name: "Bone", lo: -500, hi: 1300, lo3d: 180 },
];

// The cut that removes the front of the scan in 3D: [depth, azimuth, elevation]. Lower depth cuts deeper.
// For MRI the front half of the head is always removed, so a 3D view can never show the face (TCIA terms).
const NO_CUT = 2;
const DEEPEST = -0.4;
const MRI_SHALLOWEST = 0;

export default function SeriesViewer({ url, kind, results, showFindings = true, focus }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const ct = isCT(kind);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [view, setView] = useState<View>("all");
  const [win, setWin] = useState<string>(ct ? (kind === "chest-ct" ? "Lung" : "Soft tissue") : "Auto");
  const [zoom, setZoom] = useState(1);
  const [cut, setCut] = useState(ct ? NO_CUT : 0);
  const [loc, setLoc] = useState<NiiVueLocation | null>(null);
  const [dims, setDims] = useState<number[]>([1, 1, 1]);

  useEffect(() => {
    let gone = false;
    (async () => {
      const { Niivue, SHOW_RENDER, MULTIPLANAR_TYPE } = await import("@niivue/niivue");
      if (gone || !canvas.current) return;
      const nv = new Niivue({
        backColor: [0.02, 0.03, 0.05, 1],
        crosshairColor: [0.95, 0.72, 0.29, 1],
        crosshairWidth: 1,
        // Radiologists read slices with the patient's right on the left of the screen.
        isRadiologicalConvention: true,
        show3Dcrosshair: false,
        isColorbar: false,
        multiplanarShowRender: SHOW_RENDER.ALWAYS,
        multiplanarLayout: MULTIPLANAR_TYPE.GRID,
        dragAndDropEnabled: false,
        loadingText: "Loading scan…",
        logLevel: "error",
        // Keys that would let someone remove the cut. Never matched, so they do nothing.
        clipPlaneHotKey: "Disabled",
        cycleClipPlaneHotKey: "Disabled",
      });
      // Draw a line around the findings in the flat views, like the circles on single scans.
      nv.overlayOutlineWidth = 0.6;
      await nv.attachToCanvas(canvas.current);
      nv.setClipPlaneColor([0, 0, 0, 0]);
      nv.setClipPlane([ct ? NO_CUT : 0, 180, 0]);
      nv.setRenderAzimuthElevation(150, 15);
      // Scrolling over the 3D view moves the cut. Keep it facing the front and, for MRI, deep enough.
      nv.addEventListener("clipPlaneChange", () => {
        const [d, a, e] = nv.scene.clipPlaneDepthAziElevs[0];
        const max = ct ? NO_CUT : MRI_SHALLOWEST;
        const fixed = Math.min(Math.max(d >= 1.8 && ct ? NO_CUT : d, DEEPEST), max);
        if (fixed !== d || a !== 180 || e !== 0) nv.setClipPlane([fixed, 180, 0]);
        setCut(fixed);
      });
      nv.onLocationChange = (l) => setLoc(l as NiiVueLocation);
      try {
        await nv.loadVolumes([{ url, name: "scan.nii.gz", colormap: "gray" }]);
      } catch {
        if (!gone) setErr("The scan couldn't be loaded. Check your connection and reload the page.");
        return;
      }
      if (gone) return;
      nvRef.current = nv;
      const vol = nv.volumes[0];
      setDims((vol.dimsRAS ?? [3, 1, 1, 1]).slice(1, 4));
      if (ct) applyWindow(nv, CT_WINDOWS.find((w) => w.name === win)!, "all");
      nv.setSliceType(SLICE.all);
      nv.createOnLocationChange();
      setReady(true);
    })();
    return () => {
      gone = true;
      const gl = nvRef.current?.gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      nvRef.current = null;
    };
    // The viewer is built once per scan; the controls below talk to it directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Adds the findings as a red layer once the scan is loaded, and replaces it when the results change.
  useEffect(() => {
    const n = nvRef.current;
    if (!ready || !n) return;
    let gone = false;
    let blobUrl = "";
    (async () => {
      while (n.volumes.length > 1) n.removeVolumeByIndex(1);
      const overlay = results ? buildOverlay(results) : null;
      if (!overlay) return n.drawScene();
      blobUrl = URL.createObjectURL(new Blob([writeNifti(overlay.data, overlay.dims, overlay.affine)]));
      await n.addVolumeFromUrl({ url: blobUrl, name: "findings.nii", colormap: "warm", opacity: showFindings ? FINDING_OPACITY : 0, cal_min: FINDING_MIN, cal_max: 1 });
      if (gone) n.removeVolumeByIndex(1);
    })();
    return () => { gone = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
    // showFindings is applied by the effect below without rebuilding the layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, results]);

  useEffect(() => {
    const n = nvRef.current;
    if (ready && n && n.volumes.length > 1) n.setOpacity(1, showFindings ? FINDING_OPACITY : 0);
  }, [ready, showFindings]);

  useEffect(() => {
    const n = nvRef.current;
    if (!ready || !n || !focus) return;
    if (view === "3d") pickView("all");
    n.scene.crosshairPos = [...focus.pos] as typeof n.scene.crosshairPos;
    n.createOnLocationChange();
    n.drawScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus]);

  function applyWindow(nv: Niivue, w: Win, v: View) {
    const vol = nv.volumes[0];
    vol.cal_min = v === "3d" ? w.lo3d : w.lo;
    vol.cal_max = w.hi;
    nv.updateGLVolume();
  }

  const nv = () => nvRef.current;

  function pickView(v: View) {
    const n = nv();
    if (!n) return;
    setView(v);
    n.setSliceType(SLICE[v]);
    if (ct) applyWindow(n, CT_WINDOWS.find((w) => w.name === win)!, v);
  }

  function pickWindow(name: string) {
    const n = nv();
    if (!n) return;
    setWin(name);
    if (ct) applyWindow(n, CT_WINDOWS.find((w) => w.name === name)!, view);
    else {
      // MRI has no standard units, so the windows are relative to the scan's own range.
      const vol = n.volumes[0];
      const lo = vol.robust_min ?? vol.global_min ?? 0, hi = vol.robust_max ?? vol.global_max ?? 1;
      vol.cal_min = lo;
      vol.cal_max = name === "Bright" ? lo + (hi - lo) * 0.6 : hi;
      n.updateGLVolume();
    }
  }

  function setZoomTo(z: number) {
    const n = nv();
    if (!n) return;
    const next = Math.min(Math.max(z, 1), 8);
    setZoom(next);
    const p = n.scene.pan2Dxyzmm;
    n.setPan2Dxyzmm([p[0], p[1], p[2], next]);
    n.setScale(next);
  }

  function resetView() {
    const n = nv();
    if (!n) return;
    setZoom(1);
    n.setPan2Dxyzmm([0, 0, 0, 1]);
    n.setScale(1);
    n.setRenderAzimuthElevation(150, 15);
  }

  function turn(dAz: number, dEl: number) {
    const n = nv();
    if (!n) return;
    const el = Math.min(Math.max(n.scene.renderElevation + dEl, -90), 90);
    n.setRenderAzimuthElevation((n.scene.renderAzimuth + dAz + 360) % 360, el);
  }

  function moveCut(d: number) {
    setCut(d);
    nv()?.setClipPlane([d, 180, 0]);
  }

  function goToSlice(axis: number, index: number) {
    const n = nv();
    if (!n) return;
    const pos = [...n.scene.crosshairPos];
    pos[axis] = (index + 0.5) / dims[axis];
    n.scene.crosshairPos = pos as typeof n.scene.crosshairPos;
    n.createOnLocationChange(axis === 2 ? 0 : axis === 1 ? 1 : 2);
    n.drawScene();
  }

  const axis = AXIS[view];
  const sliceIndex = loc ? Math.min(Math.floor(loc.frac[axis] * dims[axis]), dims[axis] - 1) : 0;
  const value = loc?.values?.[0]?.value;
  const windows = ct ? CT_WINDOWS.map((w) => w.name) : ["Auto", "Bright"];
  const show3D = view === "3d" || view === "all";

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <div className="seg" role="radiogroup" aria-label="View">
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} disabled={!ready} onClick={() => pickView(v)}>{label}</button>
          ))}
        </div>
        <div className="seg" role="radiogroup" aria-label="Window">
          {windows.map((w) => (
            <button key={w} type="button" role="radio" aria-checked={win === w} disabled={!ready} onClick={() => pickWindow(w)}>{w}</button>
          ))}
        </div>
      </div>

      <div className="viewer-stage">
        <canvas ref={canvas} aria-label="Scan viewer. Click to move the crosshair, drag the 3D view to rotate it, scroll to move through slices." />
        {err && <div className="viewer-msg" role="alert">{err}</div>}
        {loc && view !== "3d" && (
          <p className="viewer-readout" aria-live="polite">
            {AXIS_NAME[axis]} slice <b>{sliceIndex + 1}</b> of {dims[axis]}
            {value != null && <> · {ct ? `${Math.round(value)} HU` : `signal ${Math.round(value)}`}</>}
          </p>
        )}
      </div>

      <div className="viewer-tools">
        {view !== "3d" && (
          <label className="field viewer-slider">
            <span>{AXIS_NAME[axis]} slice</span>
            <input type="range" min={0} max={dims[axis] - 1} value={sliceIndex} disabled={!ready}
              onChange={(e) => goToSlice(axis, Number(e.target.value))} />
          </label>
        )}
        {show3D && (
          <div className="viewer-group">
            <span className="small muted">Turn the 3D view</span>
            <div className="viewer-angles">
              {ANGLES.map(([name, a, e]) => (
                <button key={name} type="button" className="btn btn-quiet btn-sm" disabled={!ready}
                  onClick={() => nv()?.setRenderAzimuthElevation(a, e)}>{name}</button>
              ))}
            </div>
            <div className="viewer-arrows" aria-label="Rotate step by step">
              <button type="button" className="btn btn-quiet btn-sm" disabled={!ready} onClick={() => turn(0, 20)} aria-label="Tilt up">↑</button>
              <button type="button" className="btn btn-quiet btn-sm" disabled={!ready} onClick={() => turn(-20, 0)} aria-label="Turn left">←</button>
              <button type="button" className="btn btn-quiet btn-sm" disabled={!ready} onClick={() => turn(20, 0)} aria-label="Turn right">→</button>
              <button type="button" className="btn btn-quiet btn-sm" disabled={!ready} onClick={() => turn(0, -20)} aria-label="Tilt down">↓</button>
            </div>
          </div>
        )}
        {show3D && (
          <div className="viewer-group">
            <label className="field viewer-slider">
              <span>{ct ? "Cut open from the front" : "Cut depth"}</span>
              <input type="range" min={DEEPEST} max={ct ? 0.6 : MRI_SHALLOWEST} step={0.025} disabled={!ready}
                value={Math.min(cut, ct ? 0.6 : MRI_SHALLOWEST)}
                onChange={(e) => moveCut(Number(e.target.value))} />
            </label>
            {ct && cut < NO_CUT && <button type="button" className="btn btn-quiet btn-sm" onClick={() => moveCut(NO_CUT)}>Close the cut</button>}
          </div>
        )}
        <div className="viewer-group">
          <span className="small muted">Zoom {zoom.toFixed(1)}×</span>
          <div className="viewer-angles">
            <button type="button" className="btn btn-quiet btn-sm" disabled={!ready || zoom <= 1} onClick={() => setZoomTo(zoom / 1.25)} aria-label="Zoom out">−</button>
            <button type="button" className="btn btn-quiet btn-sm" disabled={!ready || zoom >= 8} onClick={() => setZoomTo(zoom * 1.25)} aria-label="Zoom in">+</button>
            <button type="button" className="btn btn-quiet btn-sm" disabled={!ready} onClick={resetView}>Reset</button>
          </div>
        </div>
      </div>
      {!ct && show3D && <p className="fine">The front of the head is always cut away in 3D, so the view can never show the patient&apos;s face.</p>}
    </div>
  );
}
