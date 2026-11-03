"""Local model server for ScanLens.

Runs several image-classification models ("tests") and checks that each image
is the kind of scan a test was trained on before running it.

  GET  /tests        -> the available tests
  POST /tests/<id>   -> run one test on an image sent as the raw request body
  POST /tests/auto   -> work out the scan type and run every test made for it

Only safetensors weights are loaded; pickle (.bin) weights can run code when loaded.
"""
import hmac
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "30")
# Xet transfers stalled on this machine; plain HTTPS downloads are reliable.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


def _token_from_env_file():
    """MedSigLIP is gated, so downloads need the HF_TOKEN kept in the app's .env.local."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env.local")
    try:
        with open(path) as f:
            for line in f:
                if line.startswith("HF_TOKEN=") and line.strip()[9:].startswith("hf_"):
                    return line.strip()[9:]
    except OSError:
        pass
    return None


if not os.environ.get("HF_TOKEN") and _token_from_env_file():
    os.environ["HF_TOKEN"] = _token_from_env_file()

import numpy as np
import torch
from PIL import Image, UnidentifiedImageError
from transformers import AutoModel, AutoProcessor, pipeline

# Hosted (e.g. on Hugging Face Spaces) this runs with HOST=0.0.0.0 so it can be reached from outside.
HOST, PORT = os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8000"))
# When set, every request must carry it in the X-Server-Secret header, so only the ScanLens app can
# use a public server. A custom header, because a private Space needs Authorization for its own token.
SECRET = os.environ.get("MODEL_SERVER_SECRET")
# "cuda" on the ZeroGPU Space (app.py sets it); this plain HTTP server runs on the CPU.
DEVICE = os.environ.get("DEVICE", "cpu")
MAX_BYTES = 25 * 1024 * 1024

# What the scan-type check can recognise. Only the types in references.json have tests; the rest
# exist so other images have somewhere to land instead of being forced into a test.
SCANS = {
    "chest-xray": "a chest X-ray radiograph, a front view of the whole chest showing the ribs, both lungs, the heart and the collarbones",
    "bone-xray": "an X-ray of a bone, hand, wrist, arm, leg or joint",
    "knee-xray": "an X-ray of the knee joint, showing the end of the thigh bone above the shin bone with the joint space between them",
    "brain-mri": "an MRI scan of the brain",
    "chest-ct": "a chest CT scan, a cross-sectional slice through the body seen from below, showing both lungs as dark ovals beside the spine",
    "retina-photo": "a retinal fundus photograph, a round orange-red image of the back of the eye showing the optic disc and blood vessels",
    "skin-photo": "a dermatoscope close-up photograph of a mole or skin lesion",
    "head-ct": "a CT scan of the head",
    "abdomen-ct": "a CT scan of the abdomen",
    "ultrasound": "an ultrasound image",
    "dental-xray": "a dental X-ray of teeth",
    "photo": "a photograph of a person, object or place",
    "document": "a screenshot, document or drawing",
}
SCAN_NAMES = {
    "chest-xray": "chest X-ray", "bone-xray": "bone X-ray", "brain-mri": "brain MRI", "chest-ct": "chest CT",
    "head-ct": "head CT", "abdomen-ct": "abdominal CT", "ultrasound": "ultrasound", "dental-xray": "dental X-ray",
    "photo": "photograph", "document": "screenshot or document",
    "knee-xray": "knee X-ray", "retina-photo": "retina photo", "skin-photo": "skin lesion photo",
}
# Colour photographs rather than scans: never split into slices.
PHOTO_SCANS = {"retina-photo", "skin-photo"}

# scoring: "softmax" for models that pick one label, "sigmoid" for models that score each label on its own.
# Optional "scans": every scan type a test accepts, when more than its main "scan".
TESTS = {
    "chest-xray-pneumonia": {
        "name": "Pneumonia", "scan": "chest-xray", "scoring": "softmax",
        "model": "nickmuchi/vit-finetuned-chest-xray-pneumonia",
        # main only has pickle weights; this PR from Hugging Face's conversion bot adds safetensors.
        "revision": "refs/pr/1",
        "about": "Normal or pneumonia. Trained mostly on children's chest X-rays.",
    },
    "chest-xray-covid": {
        "name": "COVID-19 and pneumonia", "scan": "chest-xray", "scoring": "softmax",
        "model": "GGital/vit-Covid", "revision": "main",
        "about": "COVID-19, other pneumonia, or normal.",
    },
    "chest-xray-14": {
        "name": "14 chest conditions", "scan": "chest-xray", "scoring": "sigmoid",
        "model": "Sohaibsoussi/ViT-NIH-Chest-X-ray-dataset-small", "revision": "main",
        "about": "Scores each of 14 conditions separately, such as effusion, nodule and cardiomegaly.",
    },
    "chest-xray-tb": {
        "name": "Tuberculosis", "scan": "chest-xray", "scoring": "softmax",
        "model": "runaksh/chest_xray_tuberculosis_detection", "revision": "main",
        # Uploaded without its image settings; it was fine-tuned from this model, so it uses its settings.
        "processor": "google/vit-base-patch16-224-in21k",
        "about": "Normal or tuberculosis. Only knows these two, so other lung disease can show as tuberculosis: "
                 "in testing it called 3 of 15 pneumonia X-rays tuberculosis.",
    },
    "bone-xray-fracture": {
        # Not offered for knee X-rays: in testing it called 11 of 24 knees with no known fracture fractured.
        "name": "Bone fracture", "scan": "bone-xray", "scoring": "softmax",
        "model": "prithivMLmods/Bone-Fracture-Detection", "revision": "main",
        "about": "Fractured or not fractured.",
    },
    "knee-xray-oa": {
        "name": "Knee osteoarthritis", "scan": "knee-xray", "scoring": "softmax",
        "model": "thanhle829/kneexpert-xray-kl", "revision": "bf9e73749478e69e372c6b10e0d02b9b0c7cd786",
        # Published for the timm library; loaded by _timm_convnext instead.
        "loader": "timm-convnext", "file": "convnext_tiny_weighted_smoothed",
        "labels": {"KL0": "KL 0 (none)", "KL1": "KL 1 (doubtful)", "KL2": "KL 2 (mild)",
                   "KL3": "KL 3 (moderate)", "KL4": "KL 4 (severe)"},
        "about": "Kellgren-Lawrence grade 0 to 4 on a front-view knee X-ray. Trained on close crops of the knee "
                 "joint; often one grade off, especially between grades 0, 1 and 2.",
    },
    "retina-photo-dr": {
        "name": "Diabetic retinopathy", "scan": "retina-photo", "scoring": "softmax", "color": True,
        "model": "nadahh/APTOS2019DetectionViaLLMMConvNextV2", "revision": "main",
        "labels": {"0": "No DR", "1": "Mild", "2": "Moderate", "3": "Severe", "4": "Proliferative DR"},
        "about": "No diabetic retinopathy, or mild, moderate, severe or proliferative. Trained on one clinic's "
                 "photos (APTOS 2019); on other photos it told retinopathy from none well but often got the grade wrong.",
    },
    "skin-photo-lesion": {
        "name": "Skin lesion", "scan": "skin-photo", "scoring": "softmax", "color": True,
        "model": "spycoder/vit-base-patch16-224-in21k-enhanced-ham10000", "revision": "main",
        "labels": {"akiec": "Actinic keratosis", "bcc": "Basal cell carcinoma", "bkl": "Benign keratosis",
                   "df": "Dermatofibroma", "mel": "Melanoma", "nv": "Mole (melanocytic nevus)", "vasc": "Vascular lesion"},
        "about": "Seven kinds of skin lesion, including melanoma, basal cell carcinoma and moles. Made for "
                 "dermatoscope close-ups; much less accurate on images from other clinics, and not for ordinary photos.",
    },
    "brain-mri-tumour": {
        "name": "Brain tumour", "scan": "brain-mri", "scoring": "softmax",
        "model": "prithivMLmods/BrainTumor-Classification-Mini", "revision": "main",
        "about": "No tumour, glioma, meningioma or pituitary tumour.",
    },
    "chest-ct-lung-cancer": {
        "name": "Lung cancer", "scan": "chest-ct", "scoring": "softmax",
        "model": "oohtmeel/swin-tiny-patch4-finetuned-lung-cancer-ct-scans", "revision": "main",
        "about": "Positive or negative for lung cancer on a single CT slice.",
    },
}
# Google's medical SigLIP: trained on X-ray, CT, MRI and more, so it tells scan types apart far better
# than the general-purpose SigLIP. Gated: needs HF_TOKEN from an account that accepted its terms.
GATE_MODEL = os.environ.get("GATE_MODEL", "google/medsiglip-448")
# The scan type is whichever set of real example scans (references.json) the image most resembles.
# In testing, real scans matched their type at 0.60-0.93 similarity and a screenshot of a scan at 0.53.
# Below this the image isn't clearly any scan type, so no test runs.
MIN_SCAN_SCORE = float(os.environ.get("MIN_SCAN_SCORE", "0.58"))
# Fundus photos vary more in colour and framing than scans: real ones matched their type at 0.54-0.84,
# while everyday photos stayed below 0.36 and every other scan type below 0.45.
MIN_SCAN_SCORES = {"retina-photo": 0.5}
# Text descriptions still catch scan types that have no tests (ultrasound, head CT...) when confident.
MIN_OTHER_TEXT_SCORE = 0.5
REFERENCES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "references.json")


class ScanTypeCheck:
    """Works out the scan type by comparing the image with example scans of each type with tests,
    and with text descriptions of other kinds of image."""

    def __init__(self, model_id, references=REFERENCES):
        self.processor = AutoProcessor.from_pretrained(model_id)
        self.model = AutoModel.from_pretrained(model_id, use_safetensors=True).eval()
        self.keys = list(SCANS)
        texts = [f"This is {SCANS[k]}." for k in self.keys]
        tokens = self.processor(text=texts, padding="max_length", return_tensors="pt")
        # The text side is worked out once here, on the CPU; only images go through the model later.
        with torch.no_grad():
            t = self.model.get_text_features(**tokens)
        self.text = t / t.norm(dim=-1, keepdim=True)
        self.scale, self.bias = float(self.model.logit_scale.exp()), float(self.model.logit_bias)
        self.model.to(DEVICE)
        self.refs = {}
        if references:
            with open(references) as f:
                data = json.load(f)
            if data["model"] != model_id:
                raise ValueError(f"{references} was built with {data['model']}; run build_references.py")
            self.refs = {k: torch.tensor(v["vector"]) for k, v in data["types"].items()}

    def embed(self, image):
        with torch.no_grad():
            v = self.model.get_image_features(**self.processor(images=image, return_tensors="pt").to(DEVICE))
        return (v / v.norm(dim=-1, keepdim=True))[0].cpu()

    def __call__(self, image):
        v = self.embed(image)
        logits = (v @ self.text.T) * self.scale + self.bias
        probs = logits.softmax(dim=-1)
        i = int(probs.argmax())
        text_scan, text_score = self.keys[i], float(probs[i])
        if text_scan not in self.refs and text_score >= MIN_OTHER_TEXT_SCORE:
            return {"scan": text_scan, "name": SCAN_NAMES[text_scan], "score": text_score, "clear": True}
        scan, score = max(((k, float(v @ ref)) for k, ref in self.refs.items()), key=lambda x: x[1])
        return {"scan": scan, "name": SCAN_NAMES[scan], "score": round(score, 3), "clear": score >= MIN_SCAN_SCORES.get(scan, MIN_SCAN_SCORE)}


_pipes = {}
_locks = {key: threading.Lock() for key in [*TESTS, "gate"]}


def _load(key):
    """Load a model once; later calls reuse it. Safe to call from several threads."""
    with _locks[key]:
        if key not in _pipes:
            if key == "gate":
                print(f"Loading scan-type check ({GATE_MODEL}) ...", flush=True)
                _pipes[key] = ScanTypeCheck(GATE_MODEL)
            else:
                t = TESTS[key]
                print(f"Loading {key} ({t['model']} @ {t['revision']}) ...", flush=True)
                if t.get("loader") == "timm-convnext":
                    _pipes[key] = _timm_convnext(t)
                else:
                    # "processor": a repo to take the image preprocessing from, for a model uploaded without its own.
                    extra = {"image_processor": t["processor"]} if t.get("processor") else {}
                    _pipes[key] = pipeline("image-classification", model=t["model"], revision=t["revision"], device=DEVICE,
                                           model_kwargs={"use_safetensors": True}, **extra)
            print(f"Ready: {key}", flush=True)
        return _pipes[key]


def _timm_convnext(t):
    """A pipeline for a ConvNeXt-tiny trained with timm and published as bare safetensors.

    Its weights are renamed to the transformers ConvNeXt layout, so timm itself isn't needed.
    """
    import re
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file
    from transformers import ConvNextConfig, ConvNextForImageClassification, ConvNextImageProcessor

    meta_path = hf_hub_download(t["model"], f"{t['file']}.json", revision=t["revision"])
    with open(meta_path) as f:
        meta = json.load(f)
    weights = load_file(hf_hub_download(t["model"], f"{t['file']}.safetensors", revision=t["revision"]))
    renames = [
        (r"^stem\.0\.", "convnext.embeddings.patch_embeddings."),
        (r"^stem\.1\.", "convnext.embeddings.layernorm."),
        (r"^stages\.(\d+)\.downsample\.", r"convnext.encoder.stages.\1.downsampling_layer."),
        (r"^stages\.(\d+)\.blocks\.(\d+)\.conv_dw\.", r"convnext.encoder.stages.\1.layers.\2.dwconv."),
        (r"^stages\.(\d+)\.blocks\.(\d+)\.norm\.", r"convnext.encoder.stages.\1.layers.\2.layernorm."),
        (r"^stages\.(\d+)\.blocks\.(\d+)\.mlp\.fc1\.", r"convnext.encoder.stages.\1.layers.\2.pwconv1."),
        (r"^stages\.(\d+)\.blocks\.(\d+)\.mlp\.fc2\.", r"convnext.encoder.stages.\1.layers.\2.pwconv2."),
        (r"^stages\.(\d+)\.blocks\.(\d+)\.gamma$", r"convnext.encoder.stages.\1.layers.\2.layer_scale_parameter"),
        (r"^head\.norm\.", "convnext.layernorm."),
        (r"^head\.fc\.", "classifier."),
    ]
    state = {}
    for k, v in weights.items():
        for pattern, new in renames:
            k = re.sub(pattern, new, k)
        state[k] = v
    # The publisher's calibration: logits / temperature, folded into the last layer.
    temperature = float(meta.get("temperature", 1.0))
    state["classifier.weight"] = state["classifier.weight"] / temperature
    state["classifier.bias"] = state["classifier.bias"] / temperature
    labels = meta["classes"]
    config = ConvNextConfig(depths=[3, 3, 9, 3], hidden_sizes=[96, 192, 384, 768], num_labels=len(labels),
                            id2label=dict(enumerate(labels)), label2id={l: i for i, l in enumerate(labels)})
    model = ConvNextForImageClassification(config).eval()
    model.load_state_dict(state, strict=True)
    # Resize the short side and centre-crop a square, keeping proportions: trained on square crops of
    # the joint, it graded wider knee images better this way than squeezed to a square.
    processor = ConvNextImageProcessor(size={"shortest_edge": meta["input_size"]}, crop_pct=1.0,
                                       image_mean=meta["normalize"]["mean"], image_std=meta["normalize"]["std"])
    return pipeline("image-classification", model=model, image_processor=processor, device=DEVICE)


def _preload():
    for key in ["gate", *TESTS]:
        try:
            _load(key)
        except Exception as e:  # keep serving; the failing test reports its error when used
            print(f"Failed to load {key}: {e!r}", flush=True)


def list_tests():
    return [
        {"id": k, "name": t["name"], "scan": t["scan"], "scan_name": SCAN_NAMES[t["scan"]],
         "model": t["model"], "about": t["about"], "ready": k in _pipes}
        for k, t in TESTS.items()
    ]


def detect_scan(image):
    return _load("gate")(image)


def _test_info(test_id):
    t = TESTS[test_id]
    return {"id": test_id, "name": t["name"], "scan": t["scan"], "scan_name": SCAN_NAMES[t["scan"]]}


def _scans(t):
    """Every scan type a test accepts; "scan" is the main one, shown in list_tests."""
    return t.get("scans", [t["scan"]])


def _slices(image, scan):
    """Photos are never grids of slices; a dark fundus border or skin folds could look like one."""
    return None if scan in PHOTO_SCANS else find_slices(image)


def _prepare(t, image):
    # Scans are grayscale; tinted stock images (blue X-rays, pink-highlighted tumours) fooled the
    # models in testing, and grayscale versions of the same images were read correctly.
    # Colour photos (retina, skin) keep their colour: it is much of what those models read.
    return image.convert("RGB") if t.get("color") else image.convert("L").convert("RGB")


def _label(t, label):
    """The label to show: some models name their classes with codes such as "nv", "2" or "KL3"."""
    return t.get("labels", {}).get(label, label)


# Top labels that mean "nothing found"; there is nothing to point at, so no heatmap is made for them.
# Compared after "labels" renames, so these are the names shown, lower-cased. The skin test has no
# "nothing found" answer: every label is a kind of lesion.
NORMAL_LABELS = {"normal", "no finding", "no tumor", "not fractured", "negative", "no dr", "kl 0 (none)"}

# Occlusion heatmap: grey out a PATCH x PATCH block of an 8 x 8 grid at every position and
# measure how much the model's evidence for its finding drops. Big drops mark where it looked.
# Evidence is measured as log-odds, not probability: at 99.9% the probability barely moves when
# part of the scan is covered, which left confident findings with no heatmap.
GRID, PATCH = 8, 2
# Below this largest drop in log-odds, covering any area barely changes the answer and the map is noise.
MIN_HEAT = 0.1
# Circle up to this many separate areas, each at least PEAK_SHARE as strong as the strongest.
MAX_PEAKS, PEAK_SHARE = 3, 0.5


def occlusion_heatmap(clf, image, label, scoring):
    model = clf.model
    index = {name: int(i) for i, name in model.config.id2label.items()}[label]
    x = clf.image_processor(images=image, return_tensors="pt")["pixel_values"].to(model.device)
    _, _, h, w = x.shape
    ch, cw = h // GRID, w // GRID

    def confidence(batch):
        with torch.no_grad():
            logits = model(pixel_values=batch).logits
        if scoring == "sigmoid":
            return logits[:, index]  # a sigmoid logit is already the log-odds
        others = torch.cat([logits[:, :index], logits[:, index + 1:]], dim=1)
        return logits[:, index] - torch.logsumexp(others, dim=1)

    base = float(confidence(x)[0])
    positions = [(gy, gx) for gy in range(GRID - PATCH + 1) for gx in range(GRID - PATCH + 1)]
    drops = []
    for start in range(0, len(positions), 16):
        batch = []
        for gy, gx in positions[start:start + 16]:
            covered = x.clone()
            # 0 after normalisation is the processor's mean colour, a neutral grey.
            covered[:, :, gy * ch:(gy + PATCH) * ch, gx * cw:(gx + PATCH) * cw] = 0
            batch.append(covered)
        drops += (base - confidence(torch.cat(batch))).clamp(min=0).tolist()

    total = [[0.0] * GRID for _ in range(GRID)]
    count = [[0] * GRID for _ in range(GRID)]
    for (gy, gx), drop in zip(positions, drops):
        for yy in range(gy, gy + PATCH):
            for xx in range(gx, gx + PATCH):
                total[yy][xx] += drop
                count[yy][xx] += 1
    grid = [[total[y][x] / count[y][x] for x in range(GRID)] for y in range(GRID)]
    peak = max(max(row) for row in grid)
    if peak < MIN_HEAT:
        return None
    # Strongest cells first; skip any within two cells of one already circled so circles don't overlap.
    cells = sorted(((grid[y][x], y, x) for y in range(GRID) for x in range(GRID)), reverse=True)
    peaks = []
    for value, y, x in cells:
        if value < peak * PEAK_SHARE or len(peaks) == MAX_PEAKS:
            break
        if all(max(abs(y - py), abs(x - px)) >= 2 for _, py, px in peaks):
            peaks.append((value, y, x))
    return {
        "label": label,
        # Rows top to bottom, each 0-1 relative to the strongest cell; covers the whole image.
        "grid": [[round(v / peak, 3) for v in row] for row in grid],
        "peaks": [{"x": (x + 0.5) / GRID, "y": (y + 0.5) / GRID, "strength": round(v / peak, 3)} for v, y, x in peaks],
        # Kept for analyses saved before multiple circles existed.
        "peak": {"x": (peaks[0][2] + 0.5) / GRID, "y": (peaks[0][1] + 0.5) / GRID},
        "drop": round(peak, 3),
    }


def _bands(profile, min_gap, min_len):
    """Runs of lines with content along one axis, separated by at least min_gap empty lines."""
    runs, start, end, gap = [], None, 0, 0
    for i, has_content in enumerate(profile > 0.02):
        if has_content:
            if start is None:
                start = i
            gap, end = 0, i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                runs.append((start, end + 1))
                start = None
    if start is not None:
        runs.append((start, end + 1))
    return [r for r in runs if r[1] - r[0] >= min_len]


def find_slices(image):
    """Boxes of the slices when the image is a grid of slices (a montage), else None.

    The models were trained on one slice at a time; shown a whole grid, the brain model called a
    clearly visible tumour "No Tumor" at 96%. Tested slice by slice, the same slices were flagged.
    """
    g = np.asarray(image.convert("L"), dtype=np.float32) / 255
    h, w = g.shape
    bright = g > 0.12
    rows = _bands(bright.mean(axis=1), max(2, h // 200), h // 12)
    cols = _bands(bright.mean(axis=0), max(2, w // 200), w // 12)
    # A grid has real gaps both across and down; one band either way is a single image
    # (white padding beside a single scan looks like a gap in one direction only).
    if len(rows) < 2 or len(cols) < 2:
        return None
    # Slices in a grid are about the same size; split bands where neighbouring slices touch.
    unit = float(np.median([b - a for a, b in rows + cols]))

    def split(runs):
        out = []
        for a, b in runs:
            k = max(1, round((b - a) / unit))
            out += [(a + (b - a) * i // k, a + (b - a) * (i + 1) // k) for i in range(k)]
        return out

    boxes = [(x0, y0, x1, y1) for y0, y1 in split(rows) for x0, x1 in split(cols)
             if bright[y0:y1, x0:x1].mean() > 0.05]
    return boxes if len(boxes) >= 4 else None


def _classify_slices(test_id, image, boxes):
    """Run a test on each slice of a grid and box the slices with a finding."""
    t = TESTS[test_id]
    clf = _load(test_id)
    crops = [_prepare(t, image.crop(b)) for b in boxes]
    per_slice = clf(crops, function_to_apply=t["scoring"], top_k=len(clf.model.config.id2label))
    per_slice = [[{"label": _label(t, p["label"]), "score": p["score"]} for p in r] for r in per_slice]
    flagged = [(b, r) for b, r in zip(boxes, per_slice) if r[0]["label"].lower() not in NORMAL_LABELS]
    if flagged:
        # The overall answer is the most confident flagged slice.
        results = max(flagged, key=lambda f: f[1][0]["score"])[1]
    else:
        # Nothing flagged: average every slice's scores.
        totals = {}
        for r in per_slice:
            for p in r:
                totals[p["label"]] = totals.get(p["label"], 0) + p["score"] / len(per_slice)
        results = sorted(({"label": k, "score": v} for k, v in totals.items()), key=lambda p: -p["score"])
    return {
        "test": _test_info(test_id), "model": t["model"],
        "predictions": [{"label": r["label"], "score": float(r["score"])} for r in results],
        # In image pixels, the same shape detection models return.
        "regions": [{"label": r[0]["label"], "score": float(r[0]["score"]),
                     "box": {"xmin": b[0], "ymin": b[1], "xmax": b[2], "ymax": b[3]}} for b, r in flagged],
        "slices": {"count": len(boxes), "flagged": len(flagged)},
        # Covering parts of a whole grid says nothing useful; the boxes show where instead.
        "heatmap": None, "heatmap_note": None,
    }


def _classify(test_id, image, slices=None):
    if slices:
        return _classify_slices(test_id, image, slices)
    t = TESTS[test_id]
    clf = _load(test_id)
    image = _prepare(t, image)
    results = clf(image, function_to_apply=t["scoring"], top_k=len(clf.model.config.id2label))
    top = results[0]["label"]
    finding = _label(t, top).lower() not in NORMAL_LABELS
    heatmap = occlusion_heatmap(clf, image, top, t["scoring"]) if finding else None
    if heatmap:
        heatmap["label"] = _label(t, top)
    return {
        "test": _test_info(test_id), "model": t["model"],
        "predictions": [{"label": _label(t, r["label"]), "score": float(r["score"])} for r in results],
        "heatmap": heatmap,
        # A finding that no area of the scan explains: the model is reacting to the whole image
        # (contrast, style, source), which in testing went with unreliable results.
        "heatmap_note": "diffuse" if finding and heatmap is None else None,
    }


def _unclear(scan):
    return 422, {
        "error": "This doesn't clearly look like a medical scan. Upload the scan image itself, "
                 "not a photo or screenshot of it, cropped to the scan.",
        "scan_check": scan,
    }


def run_test(test_id, image):
    t = TESTS[test_id]
    scan = detect_scan(image)
    if not scan["clear"]:
        return _unclear(scan)
    if scan["scan"] not in _scans(t):
        needs = " or ".join(SCAN_NAMES[s] for s in _scans(t))
        return 422, {
            "error": f"This looks like a {scan['name']}, but the {t['name']} test needs a {needs}. "
                     f"Choose a test for {scan['name']} scans, or upload a {needs}.",
            "test": _test_info(test_id), "scan_check": scan,
        }
    return 200, {"results": [_classify(test_id, image, _slices(image, scan["scan"]))], "scan_check": scan}


def run_matching(image):
    """For "not sure which test": work out the scan type, then run every test made for it."""
    scan = detect_scan(image)
    if not scan["clear"]:
        return _unclear(scan)
    matching = [k for k, t in TESTS.items() if scan["scan"] in _scans(t)]
    if not matching:
        have = sorted({SCAN_NAMES[s] for t in TESTS.values() for s in _scans(t)})
        return 422, {
            "error": f"This looks like a {scan['name']}. ScanLens doesn't have a test for that yet. "
                     f"It has tests for {', '.join(have[:-1])} and {have[-1]} scans.",
            "scan_check": scan,
        }
    slices = _slices(image, scan["scan"])
    return 200, {"results": [_classify(k, image, slices) for k in matching], "scan_check": scan}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _allowed(self):
        if SECRET and not hmac.compare_digest(self.headers.get("X-Server-Secret", ""), SECRET):
            self._send(401, {"error": "Missing or wrong X-Server-Secret header."})
            return False
        return True

    def do_GET(self):
        if not self._allowed():
            return
        if self.path.rstrip("/") in ("", "/tests"):
            return self._send(200, list_tests())
        self._send(404, {"error": "Not found."})

    def do_POST(self):
        if not self._allowed():
            return
        parts = self.path.strip("/").split("/")
        if len(parts) != 2 or parts[0] != "tests" or (parts[1] not in TESTS and parts[1] != "auto"):
            return self._send(404, {"error": "Unknown test."})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BYTES:
            return self._send(400, {"error": "Send one image of up to 25 MB as the request body."})
        try:
            image = Image.open(io.BytesIO(self.rfile.read(length))).convert("RGB")
        except UnidentifiedImageError:
            return self._send(400, {"error": "The request body isn't an image this server can read."})
        try:
            self._send(*(run_matching(image) if parts[1] == "auto" else run_test(parts[1], image)))
        except Exception as e:
            self._send(500, {"error": f"The model failed: {e}"})


if __name__ == "__main__":
    threading.Thread(target=_preload, daemon=True).start()
    print(f"Serving on http://{HOST}:{PORT} (models load in the background)", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
