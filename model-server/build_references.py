"""Builds references.json: the average MedSigLIP fingerprint of real example scans for each
scan type that has tests. server.py uses it to tell scan types apart; text descriptions alone
mistook photos of X-ray films and annotated X-rays for CT scans.

  .venv/bin/python build_references.py

Downloads a few random images per type from public Hugging Face datasets into references/
(git-ignored), embeds them, and writes references.json. Needs HF_TOKEN (see server.py).
"""
import json
import random
import time
import urllib.parse
import urllib.request
from pathlib import Path

import torch
from PIL import Image

import server

SOURCES = {
    "chest-xray": ["hf-vision/chest-xray-pneumonia", "sasi2004/chest-xrays-indiana-university"],
    "chest-ct": ["Mahadih534/Chest_CT-Scan_images-Dataset"],
    "bone-xray": ["Hemg/bone-fracture-detection"],
    "brain-mri": ["BJyotibrat/Masoud-Nickparvar-Brain-Tumor-MRI-Dataset", "Mahadih534/brain-tumor-MRI-dataset"],
    # Tight crops of the knee joint (the osteoarthritis grading set) and whole knee X-rays.
    "knee-xray": ["SilpaCS/kneeosteoarthritis", "Mary-m007/knee_classification01"],
    "retina-photo": ["bumbledeep/aptos", "bumbledeep/eyepacs"],
    # Dermatoscope images: the skin test was trained on these, not on ordinary photos of skin.
    "skin-photo": ["marmal88/skin_cancer", "MedOtter/ISIC2017"],
}
PER_DATASET = 6
HERE = Path(__file__).parent
IMAGES = HERE / "references"


def _get(url):
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                return json.load(r)
        except Exception:
            time.sleep(3)
    return None


def download():
    random.seed(7)
    for scan, datasets in SOURCES.items():
        n = len(list(IMAGES.glob(f"{scan}-*.jpg")))
        if n:
            continue  # already downloaded
        for ds in datasets:
            q = urllib.parse.quote(ds)
            splits = (_get(f"https://datasets-server.huggingface.co/splits?dataset={q}") or {}).get("splits")
            if not splits:
                continue
            s = splits[0]
            size = _get(f"https://datasets-server.huggingface.co/size?dataset={q}") or {}
            total = next((x["num_rows"] for x in size.get("size", {}).get("splits", [])
                          if x["split"] == s["split"] and x["config"] == s["config"]), 200)
            for offset in random.sample(range(total), min(PER_DATASET, total)):
                rows = (_get(f"https://datasets-server.huggingface.co/rows?dataset={q}&config={s['config']}"
                             f"&split={s['split']}&offset={offset}&length=1") or {}).get("rows")
                if not rows:
                    continue
                img = next((v for v in rows[0]["row"].values() if isinstance(v, dict) and "src" in v), None)
                if img:
                    urllib.request.urlretrieve(img["src"], IMAGES / f"{scan}-{n}.jpg")
                    n += 1


def main():
    IMAGES.mkdir(exist_ok=True)
    download()
    check = server.ScanTypeCheck(server.GATE_MODEL, references=None)
    out = {"model": server.GATE_MODEL, "types": {}}
    for scan, datasets in SOURCES.items():
        files = sorted(IMAGES.glob(f"{scan}-*.jpg"))
        vectors = torch.stack([check.embed(Image.open(f).convert("RGB")) for f in files])
        mean = vectors.mean(0)
        out["types"][scan] = {"count": len(files), "datasets": datasets, "vector": [round(v, 6) for v in (mean / mean.norm()).tolist()]}
        print(f"{scan}: {len(files)} images")
    (HERE / "references.json").write_text(json.dumps(out))
    print("wrote references.json")


if __name__ == "__main__":
    main()
