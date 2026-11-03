"""Builds public/samples/: a few labelled, anonymised scans from public datasets, shown as
"Try a sample scan" on the upload page. Each keeps its dataset label as the known answer.

  .venv/bin/pip install pyarrow   # only needed for this script
  .venv/bin/python build_samples.py

Images already in public/samples/ are kept; delete one to download it again.
"""
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
OUT = HERE.parent / "public" / "samples"
HF = "https://huggingface.co/datasets"

SOURCES = {
    "chest-xray": dict(repo="hf-vision/chest-xray-pneumonia", source="Chest X-ray pneumonia dataset (Kermany et al.)", licence="CC BY 4.0"),
    "brain-mri": dict(repo="BJyotibrat/Masoud-Nickparvar-Brain-Tumor-MRI-Dataset", source="Brain tumour MRI dataset (Masoud Nickparvar)", licence="CC BY 4.0"),
    "chest-ct": dict(repo="Mahadih534/Chest_CT-Scan_images-Dataset", source="Chest CT-scan images (Mohamed Hany)", licence="CC"),
    "chest-xray-tb": dict(repo="realsudarshan/chest-xray-tb-pneumonia", source="Chest X-ray TB, pneumonia and normal (compiled from public sets)", licence="CC BY 4.0"),
    "retina-photo": dict(repo="bumbledeep/eyepacs", source="EyePACS diabetic retinopathy photos (Kaggle 2015)", licence="MIT (as listed on the Hugging Face copy)"),
    "skin-photo": dict(repo="marmal88/skin_cancer", source="HAM10000 dermatoscopic images (Tschandl et al.)", licence="CC BY-NC 4.0"),
    "knee-xray": dict(repo="SilpaCS/kneeosteoarthritis", source="Knee osteoarthritis severity grading dataset (Chen, from the OAI)", licence="CC BY 4.0"),
}

# Row numbers of the parquet-only samples below (see from_rows).
ROWS = {"chest-xray-tuberculosis": 1700, "retina-photo-moderate-dr": 12663, "retina-photo-no-dr": 12600,
        "skin-photo-melanoma": 1201, "skin-photo-nevus": 800, "knee-xray-kl3": 8000, "knee-xray-kl0": 500}

# (sample id, scan type, dataset label, folder in the dataset repo). Chest X-rays come from a
# parquet file instead of folders, so their folder is the class index.
WANTED = [
    ("chest-xray-normal", "chest-xray", "Normal", 0),
    ("chest-xray-pneumonia", "chest-xray", "Pneumonia", 1),
    ("brain-mri-glioma", "brain-mri", "Glioma", "Testing/glioma"),
    ("brain-mri-meningioma", "brain-mri", "Meningioma", "Testing/meningioma"),
    ("brain-mri-notumor", "brain-mri", "No tumour", "Testing/notumor"),
    ("chest-ct-adenocarcinoma", "chest-ct", "Adenocarcinoma", "test/adenocarcinoma"),
    ("chest-ct-normal", "chest-ct", "Normal", "test/normal"),
    # These datasets are only parquet files, so samples are picked by row through the datasets server:
    # (split, row number). A fifth item names the SOURCES entry when it isn't the scan type.
    ("chest-xray-tuberculosis", "chest-xray", "Tuberculosis", ("test", ROWS["chest-xray-tuberculosis"]), "chest-xray-tb"),
    ("retina-photo-moderate-dr", "retina-photo", "Moderate diabetic retinopathy", ("train", ROWS["retina-photo-moderate-dr"])),
    ("retina-photo-no-dr", "retina-photo", "No diabetic retinopathy", ("train", ROWS["retina-photo-no-dr"])),
    ("skin-photo-melanoma", "skin-photo", "Melanoma", ("test", ROWS["skin-photo-melanoma"])),
    ("skin-photo-nevus", "skin-photo", "Mole (melanocytic nevus)", ("test", ROWS["skin-photo-nevus"])),
    ("knee-xray-kl3", "knee-xray", "Kellgren-Lawrence grade 3", ("train", ROWS["knee-xray-kl3"])),
    ("knee-xray-kl0", "knee-xray", "Kellgren-Lawrence grade 0", ("train", ROWS["knee-xray-kl0"])),
]
# Colour photographs stay in colour; scans are saved in grayscale.
COLOUR = {"retina-photo", "skin-photo"}


def get(url, tries=3):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except urllib.error.URLError:  # the datasets server sometimes answers 502 or 429
            if attempt == tries - 1:
                raise
            time.sleep(10)


def from_folder(repo, folder):
    """A file a third of the way through the folder, so reruns pick the same image."""
    tree = json.loads(get(f"https://huggingface.co/api/datasets/{repo}/tree/main/{urllib.parse.quote(folder)}"))
    files = sorted(f["path"] for f in tree if f["type"] == "file")
    return get(f"{HF}/{repo}/resolve/main/{urllib.parse.quote(files[len(files) // 3])}")


def from_parquet(repo, label):
    import pyarrow.parquet as pq
    data = get(f"{HF}/{repo}/resolve/main/data/validation-00000-of-00001.parquet")
    rows = pq.read_table(io.BytesIO(data)).to_pylist()
    return next(r for r in rows if r["label"] == label)["image"]["bytes"]


def from_rows(repo, split, row):
    q = urllib.parse.quote(repo)
    config = json.loads(get(f"https://datasets-server.huggingface.co/splits?dataset={q}"))["splits"][0]["config"]
    rows = json.loads(get(f"https://datasets-server.huggingface.co/rows?dataset={q}&config={config}"
                          f"&split={split}&offset={row}&length=1"))["rows"]
    image = next(v for v in rows[0]["row"].values() if isinstance(v, dict) and "src" in v)
    return get(image["src"])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for sid, scan, truth, where, *source in WANTED:
        src = SOURCES[source[0] if source else scan]
        path = OUT / f"{sid}.jpg"
        if not path.exists():
            if isinstance(where, tuple):
                raw = from_rows(src["repo"], *where)
            elif isinstance(where, int):
                raw = from_parquet(src["repo"], where)
            else:
                raw = from_folder(src["repo"], where)
            img = Image.open(io.BytesIO(raw)).convert("RGB" if scan in COLOUR else "L")
            # Colour photos compress less well; smaller keeps each sample under about 150 KB.
            img.thumbnail((768, 768) if scan in COLOUR else (1024, 1024))
            img.save(path, "JPEG", quality=85 if scan in COLOUR else 90)
            print("downloaded", path.name)
        manifest.append(dict(id=sid, file=path.name, scan=scan, truth=truth, source=src["source"],
                             url=f"{HF}/{src['repo']}", licence=src["licence"]))
    (OUT / "samples.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {len(manifest)} samples")


if __name__ == "__main__":
    main()
