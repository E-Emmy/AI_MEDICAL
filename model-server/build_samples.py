"""Builds public/samples/: a few labelled, anonymised scans from public datasets, shown as
"Try a sample scan" on the upload page. Each keeps its dataset label as the known answer.

  .venv/bin/pip install pyarrow   # only needed for this script
  .venv/bin/python build_samples.py

Images already in public/samples/ are kept; delete one to download it again.
"""
import io
import json
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
}

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
]


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for sid, scan, truth, where in WANTED:
        src = SOURCES[scan]
        path = OUT / f"{sid}.jpg"
        if not path.exists():
            raw = from_parquet(src["repo"], where) if isinstance(where, int) else from_folder(src["repo"], where)
            img = Image.open(io.BytesIO(raw)).convert("L")
            img.thumbnail((1024, 1024))
            img.save(path, "JPEG", quality=90)
            print("downloaded", path.name)
        manifest.append(dict(id=sid, file=path.name, scan=scan, truth=truth, source=src["source"],
                             url=f"{HF}/{src['repo']}", licence=src["licence"]))
    (OUT / "samples.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {len(manifest)} samples")


if __name__ == "__main__":
    main()
