"use client";
import { useEffect, useRef, useState } from "react";
import type { Niivue, NiiVueLocation } from "@niivue/niivue";
import { isCT, writeNifti, type SeriesKind } from "@/lib/series";
import { buildOverlay, type SeriesResults } from "@/lib/seriesResults";
import type { PresentOrgan } from "@/lib/organs";

type Props = {
  // Where to load the NIfTI file from: a signed R2 link or a local blob: URL.
  url: string;
  kind: SeriesKind;
  // The slice-by-slice analysis, shown in red where the model looked.
  results?: SeriesResults | null;
  showFindings?: boolean;
  // Move the crosshair here (RAS fractions). `n` changes on every request, so the same spot can be revisited.
  focus?: { pos: [number, number, number]; n: number } | null;
  // Organs outlined by TotalSegmentator: the label map, the organs in it, and which are switched on.
  // `labels` draws each visible organ's name in 3D with a line to it (teaching mode).
  organs?: { url: string; list: PresentOrgan[]; visible: Set<string>; hideScan: boolean; labels?: boolean } | null;
  // Called with the organ under the crosshair (after a click), or null.
  onOrganAt?: (id: string | null) => void;
  // The view to open in; the anatomy lab starts in 3D.
  initialView?: "all" | "axial" | "coronal" | "sagittal" | "3d";
};

const FINDINGS = "findings.nii";
const ORGANS = "organs.nii.gz";
const ORGAN_OPACITY = 0.6;

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

export default function SeriesViewer({ url, kind, results, showFindings = true, focus, organs, onOrganAt, initialView = "all" }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const ct = isCT(kind);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [view, setView] = useState<View>(initialView);
  const [win, setWin] = useState<string>(ct ? (kind === "chest-ct" ? "Lung" : "Soft tissue") : "Auto");
  const [zoom, setZoom] = useState(1);
  const [cut, setCut] = useState(ct ? NO_CUT : 0);
  const [loc, setLoc] = useState<NiiVueLocation | null>(null);
  const [dims, setDims] = useState<number[]>([1, 1, 1]);
  const [organsLoaded, setOrgansLoaded] = useState(false);
  // The organ under the mouse in the flat views, for the hover tooltip.
  const [hover, setHover] = useState<{ organ: PresentOrgan; x: number; y: number } | null>(null);
  const hoverFrame = useRef(0);
  // Label value to organ id, for reporting which organ was clicked.
  const labelToOrgan = useRef(new Map<number, string>());
  const onOrganAtRef = useRef(onOrganAt);
  onOrganAtRef.current = onOrganAt;

  useEffect(() => {
    let gone = false;
    (async () => {
      const { Niivue, SHOW_RENDER, MULTIPLANAR_TYPE } = await import("@niivue/niivue");
      if (gone || !canvas.current) return;
      const nv = new Niivue({
        backColor: [0.02, 0.03, 0.05, 1],
        crosshairColor: [0.95, 0.72, 0.29, 1],
        crosshairWidth: 1,
        // Draw at normal resolution even on Retina screens: the 3D view redraws every pixel on each move,
        // and at double density that is four times the work, which made it lag on laptops.
        forceDevicePixelRatio: -1,
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
      nv.onLocationChange = (l) => {
        const where = l as NiiVueLocation;
        setLoc(where);
        const i = nv.volumes.findIndex((v) => v.name === ORGANS);
        if (i >= 0 && onOrganAtRef.current) {
          const value = Math.round(where.values?.[i]?.value ?? 0);
          onOrganAtRef.current(labelToOrgan.current.get(value) ?? null);
        }
      };
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
      if (ct) applyWindow(nv, CT_WINDOWS.find((w) => w.name === win)!, initialView);
      nv.setSliceType(SLICE[initialView]);
      if (initialView === "3d") nv.setRenderAzimuthElevation(180, 10);
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
      removeLayer(n, FINDINGS);
      const overlay = results ? buildOverlay(results) : null;
      if (!overlay) return n.drawScene();
      blobUrl = URL.createObjectURL(new Blob([writeNifti(overlay.data, overlay.dims, overlay.affine)]));
      await n.addVolumeFromUrl({ url: blobUrl, name: FINDINGS, colormap: "warm", opacity: showFindings ? FINDING_OPACITY : 0, cal_min: FINDING_MIN, cal_max: 1 });
      if (gone) removeLayer(n, FINDINGS);
    })();
    return () => { gone = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
    // showFindings is applied by the effect below without rebuilding the layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, results]);

  useEffect(() => {
    const n = nvRef.current;
    const i = n ? n.volumes.findIndex((v) => v.name === FINDINGS) : -1;
    if (ready && n && i > 0) n.setOpacity(i, showFindings ? FINDING_OPACITY : 0);
  }, [ready, showFindings]);

  // Loads the organ map once; colours and visibility are applied by the effect after it.
  const organUrl = organs?.url;
  useEffect(() => {
    const n = nvRef.current;
    if (!ready || !n || !organUrl) return;
    let gone = false;
    (async () => {
      removeLayer(n, ORGANS);
      await n.addVolumeFromUrl({ url: organUrl, name: ORGANS, opacity: ORGAN_OPACITY });
      if (gone) return removeLayer(n, ORGANS);
      setOrgansLoaded(true);
    })();
    return () => { gone = true; setOrgansLoaded(false); };
  }, [ready, organUrl]);

  // Each organ's colour; hidden organs get zero alpha, so switching one off is just a new colour table.
  useEffect(() => {
    const n = nvRef.current;
    const i = n ? n.volumes.findIndex((v) => v.name === ORGANS) : -1;
    if (!ready || !n || !organsLoaded || i < 0 || !organs) return;
    // NiiVue can paint empty space (0) in the colour of the lowest label (label 1 in 2D, the next one up in
    // 3D), so the organ map never uses values 1-9 (model-server/build_organs.py) and 0-9 are see-through here.
    const GAP = 10;
    const I: number[] = Array.from({ length: GAP }, (_, i) => i);
    const R: number[] = I.map(() => 0), G: number[] = I.map(() => 0), B: number[] = I.map(() => 0), A: number[] = I.map(() => 0);
    const labels: string[] = I.map(() => "");
    labelToOrgan.current = new Map();
    for (const o of organs.list) {
      for (const v of o.values) {
        R.push(o.color[0]); G.push(o.color[1]); B.push(o.color[2]);
        A.push(organs.visible.has(o.id) ? 255 : 0); I.push(v); labels.push(o.name);
        labelToOrgan.current.set(v, o.id);
      }
    }
    n.volumes[i].setColormapLabel({ R, G, B, A, I, labels });
    // "Organs only": the scan itself fades out so the organs float on their own, in every view.
    n.setOpacity(0, organs.hideScan ? 0 : 1);
    n.setOpacity(i, organs.hideScan ? 1 : ORGAN_OPACITY);
    n.updateGLVolume();
  }, [ready, organsLoaded, organs]);

  useEffect(() => {
    const n = nvRef.current;
    if (!ready || !n || !focus) return;
    if (view === "3d") pickView("all");
    n.scene.crosshairPos = [...focus.pos] as typeof n.scene.crosshairPos;
    n.createOnLocationChange();
    n.drawScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus]);

  // Teaching labels: in the 3D view, each visible organ's name sits in a column beside the model with a
  // line to the organ. Clicking a label selects that organ. Hidden in the flat views, where the column
  // would cover the slices.
  useEffect(() => {
    const n = nvRef.current;
    if (!ready || !n) return;
    n.document.labels = [];
    if (organs?.labels && organsLoaded && view === "3d") {
      n.opts.legendBackgroundColor = [0.02, 0.03, 0.05, 0.75];
      // Narrow (phone) viewers get smaller labels and fewer of them, so the model stays visible.
      const narrow = (canvas.current?.clientWidth ?? 800) < 560;
      const shown = organs.list.filter((o) => organs.visible.has(o.id)).sort((a, b) => b.ml - a.ml).slice(0, narrow ? 8 : 18);
      for (const o of shown) {
        const c = [...o.color.map((v) => v / 255), 1];
        const mm = n.frac2mm(o.center);
        n.addLabel(o.name, {
          textColor: [1, 1, 1, 1], textScale: narrow ? 0.6 : 1.05, lineWidth: narrow ? 1 : 2, lineColor: c,
          lineTerminator: "circle" as never, bulletScale: 1, bulletColor: c,
        } as never, [mm[0], mm[1], mm[2]], undefined, () => onOrganAtRef.current?.(o.id));
      }
    }
    n.drawScene();
  }, [ready, organsLoaded, organs, view]);

  // Finds the organ under the mouse in a flat view. NiiVue only reports positions on click, so this
  // reads the organ map directly, at most once per frame.
  function onHover(e: React.MouseEvent<HTMLCanvasElement>) {
    const n = nvRef.current;
    if (!n || !organs || !organsLoaded) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = requestAnimationFrame(() => {
      const i = n.volumes.findIndex((v) => v.name === ORGANS);
      const rect = canvas.current!.getBoundingClientRect();
      const x = clientX - rect.left, y = clientY - rect.top;
      const dpr = n.uiData.dpr ?? 1;
      const frac = n.canvasPos2frac([x * dpr, y * dpr]);
      if (i < 0 || frac[0] < 0) return setHover(null);
      // The organ map is on exactly the same grid as the scan, so the scan's voxel is the organ map's voxel.
      const vox = n.frac2vox(frac, 0);
      const id = labelToOrgan.current.get(Math.round(n.volumes[i].getValue(vox[0], vox[1], vox[2])));
      const organ = id && organs.visible.has(id) ? organs.list.find((o) => o.id === id) : undefined;
      setHover(organ ? { organ, x, y } : null);
    });
  }

  function removeLayer(n: Niivue, name: string) {
    for (let i = n.volumes.length - 1; i > 0; i--) if (n.volumes[i].name === name) n.removeVolumeByIndex(i);
  }

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
        <div className="vt-seg vt-tabs" role="radiogroup" aria-label="View">
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} disabled={!ready} onClick={() => pickView(v)}>{label}</button>
          ))}
        </div>
        <div className="vt-seg" role="radiogroup" aria-label="Window">
          {windows.map((w) => (
            <button key={w} type="button" role="radio" aria-checked={win === w} disabled={!ready} onClick={() => pickWindow(w)}>{w}</button>
          ))}
        </div>
      </div>

      <div className="viewer-stage">
        <canvas ref={canvas} onMouseMove={onHover} onMouseLeave={() => setHover(null)}
          aria-label="Scan viewer. Click to move the crosshair, drag the 3D view to rotate it, scroll to move through slices." />
        {hover && (
          <div className="organ-tip" style={{ left: hover.x, top: hover.y }} role="tooltip">
            <strong><span className="swatch" style={{ background: `rgb(${hover.organ.color.join(",")})` }} />{hover.organ.name}</strong>
            <span>{hover.organ.about}</span>
          </div>
        )}
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
          <div className="vt-group vt-grow">
            <span className="vt-label">{AXIS_NAME[axis]} slice <b>{sliceIndex + 1}</b> / {dims[axis]}</span>
            <input className="vt-range" type="range" min={0} max={dims[axis] - 1} value={sliceIndex} disabled={!ready}
              aria-label={`${AXIS_NAME[axis]} slice`} onChange={(e) => goToSlice(axis, Number(e.target.value))} />
          </div>
        )}
        {show3D && (
          <div className="vt-group">
            <span className="vt-label">3D view</span>
            <div className="vt-row">
              <div className="vt-seg">
                {ANGLES.map(([name, a, e]) => (
                  <button key={name} type="button" disabled={!ready} onClick={() => nv()?.setRenderAzimuthElevation(a, e)}>{name}</button>
                ))}
              </div>
              <div className="vt-seg" aria-label="Rotate step by step">
                <button type="button" disabled={!ready} onClick={() => turn(-20, 0)} aria-label="Turn left">◀</button>
                <button type="button" disabled={!ready} onClick={() => turn(0, 20)} aria-label="Tilt up">▲</button>
                <button type="button" disabled={!ready} onClick={() => turn(0, -20)} aria-label="Tilt down">▼</button>
                <button type="button" disabled={!ready} onClick={() => turn(20, 0)} aria-label="Turn right">▶</button>
              </div>
            </div>
          </div>
        )}
        {show3D && (
          <div className="vt-group">
            <span className="vt-label">{ct ? "Cut open from the front" : "Cut depth"}</span>
            <div className="vt-row">
              <input className="vt-range" type="range" min={DEEPEST} max={ct ? 0.6 : MRI_SHALLOWEST} step={0.025} disabled={!ready}
                aria-label={ct ? "Cut open from the front" : "Cut depth"} value={Math.min(cut, ct ? 0.6 : MRI_SHALLOWEST)}
                onChange={(e) => moveCut(Number(e.target.value))} />
              {ct && cut < NO_CUT && <button type="button" className="vt-btn" onClick={() => moveCut(NO_CUT)}>Close</button>}
            </div>
          </div>
        )}
        <div className="vt-group">
          <span className="vt-label">Zoom <b>{zoom.toFixed(1)}×</b></span>
          <div className="vt-seg">
            <button type="button" disabled={!ready || zoom <= 1} onClick={() => setZoomTo(zoom / 1.25)} aria-label="Zoom out">−</button>
            <button type="button" disabled={!ready || zoom >= 8} onClick={() => setZoomTo(zoom * 1.25)} aria-label="Zoom in">+</button>
            <button type="button" disabled={!ready} onClick={resetView}>Reset</button>
          </div>
        </div>
      </div>
      {!ct && show3D && <p className="viewer-note">The front of the head is always cut away in 3D, so the view can never show the patient&apos;s face.</p>}
    </div>
  );
}
