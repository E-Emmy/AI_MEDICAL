"""Slice-by-slice analysis of a full CT or MRI scan (a NIfTI file, as the app stores it in R2).

The tests were trained on single axial slices, so a full scan is cut into axial slices shown the way
a radiologist reads them (front of the body at the top, the patient's right on the left), each slice
is cropped to the body like the training images, and the test runs on every slice. Heatmaps are made
for the most confident findings only, which keeps a whole scan to about one GPU call.

prepare(source, kind) is CPU work (download, decode, slice) and run(prepared) is the model work, so
the ZeroGPU Space only holds a GPU for the second part.
"""
import gzip
import io
import urllib.parse
import urllib.request

import nibabel as nib
import numpy as np
from PIL import Image

import server

# Which test runs on which kind of full scan.
TESTS = {"brain-mri": "brain-mri-tumour", "chest-ct": "chest-ct-lung-cancer"}
MAX_BYTES = 400 * 1024 * 1024
# Only R2 links are fetched, so the server can't be pointed at other addresses.
ALLOWED_HOST = ".r2.cloudflarestorage.com"
# Slices where the body covers less than this share of the image (the top of the head, the ends of
# the scan) are skipped: too little anatomy for a meaningful answer.
MIN_FILL = 0.08
# A slice only counts as a finding at this confidence or above.
MIN_FLAG_SCORE = 0.6
# Heatmaps for at most this many slices, the most confident findings.
MAX_HEAT_SLICES = 12
# CT window for the lung cancer test, in Hounsfield units: lungs dark, soft tissue grey, like its training images.
CT_WINDOW = (-1000, 400)
BATCH = 32


def _download(url):
    host = urllib.parse.urlparse(url).hostname or ""
    if not (url.startswith("https://") and host.endswith(ALLOWED_HOST)):
        raise ValueError("Only scan links from the app's R2 storage can be analysed.")
    with urllib.request.urlopen(url, timeout=60) as r:
        data = r.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("The scan is too large to analyse.")
    return data


def _load(data):
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    img = nib.as_closest_canonical(nib.Nifti1Image.from_bytes(data))
    vol = np.asarray(img.dataobj, dtype=np.float32)
    if vol.ndim == 4:
        vol = vol[..., 0]
    if vol.ndim != 3 or min(vol.shape) < 3:
        raise ValueError("This isn't a 3D scan.")
    return vol, img.affine


def axial(vol, k):
    """Slice k as displayed: rows run front to back, columns from the patient's right to their left."""
    return vol[:, :, k].T[::-1, ::-1]


def _range(vol, kind):
    if kind.endswith("-ct"):
        return CT_WINDOW
    body = vol[vol > np.percentile(vol, 60)]
    return float(np.percentile(body, 1)), float(np.percentile(body, 99.5))


def _slice_image(a, kind, lo, hi):
    """The slice as an 8-bit image cropped to the body, and the crop box, or None when nearly empty."""
    body = a > (-500 if kind.endswith("-ct") else lo + 0.1 * (hi - lo))
    if body.mean() < MIN_FILL:
        return None, None
    rows, cols = np.where(body.any(axis=1))[0], np.where(body.any(axis=0))[0]
    h, w = a.shape
    m = max(2, int(0.03 * max(h, w)))
    r0, r1 = max(0, rows[0] - m), min(h, rows[-1] + 1 + m)
    c0, c1 = max(0, cols[0] - m), min(w, cols[-1] + 1 + m)
    g = (np.clip((a[r0:r1, c0:c1] - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
    # Greyscale here, RGB only inside run(): the slices are passed to the GPU process, so smaller is faster.
    return Image.fromarray(g), [int(r0), int(r1), int(c0), int(c1)]


def prepare(source, kind):
    """source: an R2 link, or raw NIfTI bytes (for precomputing the samples)."""
    if kind not in TESTS:
        raise ValueError("Full-scan analysis is available for brain MRI and chest CT.")
    vol, affine = _load(_download(source) if isinstance(source, str) else source)
    lo, hi = _range(vol, kind)
    slices = []
    for k in range(vol.shape[2]):
        image, box = _slice_image(axial(vol, k), kind, lo, hi)
        if image is not None:
            slices.append((k, image, box))
    return {"kind": kind, "dims": [int(d) for d in vol.shape], "affine": np.round(affine, 5).tolist(), "slices": slices}


def run(prepared):
    test_id = TESTS[prepared["kind"]]
    t = server.TESTS[test_id]
    clf = server._load(test_id)
    slices = prepared["slices"]
    n_labels = len(clf.model.config.id2label)

    found = []  # (k, raw label, shown label, score, image, box)
    analysed = []
    for start in range(0, len(slices), BATCH):
        chunk = [(k, im.convert("RGB"), box) for k, im, box in slices[start:start + BATCH]]
        out = clf([im for _, im, _ in chunk], function_to_apply=t["scoring"], top_k=n_labels)
        for (k, im, box), preds in zip(chunk, out):
            top = preds[0]
            shown = server._label(t, top["label"])
            score = float(top["score"])
            analysed.append({"k": k, "label": shown, "score": round(score, 3)})
            if shown.lower() not in server.NORMAL_LABELS and score >= MIN_FLAG_SCORE:
                found.append((k, top["label"], shown, score, im, box))

    heat_ks = {f[0] for f in sorted(found, key=lambda f: -f[3])[:MAX_HEAT_SLICES]}
    flagged = []
    for k, raw, shown, score, im, box in found:
        item = {"k": k, "label": shown, "score": round(score, 3), "box": box}
        if k in heat_ks:
            hm = server.occlusion_heatmap(clf, im, raw, t["scoring"])
            if hm:
                item["grid"], item["peaks"] = hm["grid"], hm["peaks"]
        flagged.append(item)

    labels = [f["label"] for f in flagged]
    main = max(set(labels), key=labels.count) if labels else None
    strongest = max(flagged, key=lambda f: f["score"]) if flagged else None
    return {
        "test": server._test_info(test_id),
        "model": t["model"],
        "dims": prepared["dims"],
        "affine": prepared["affine"],
        "analysed": analysed,
        "skipped": prepared["dims"][2] - len(analysed),
        "flagged": flagged,
        "summary": {
            "label": main,
            "flagged": len(flagged),
            "analysed": len(analysed),
            "first": min(f["k"] for f in flagged) if flagged else None,
            "last": max(f["k"] for f in flagged) if flagged else None,
            "strongest": {"k": strongest["k"], "label": strongest["label"], "score": strongest["score"]} if strongest else None,
        },
    }


def analyse(source, kind):
    return run(prepare(source, kind))
