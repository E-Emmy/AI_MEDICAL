"""Prepares a sample scan's organ map for the organ explorer.

Run TotalSegmentator on the scan first (its "total" task, one multi-label file):

    TotalSegmentator -i scan.nii.gz -o scan-total.nii.gz --ml

then:

    python build_organs.py scan-total.nii.gz out-prefix [lung-vessels-folder]

which writes out-prefix.organs.nii.gz (labels as uint8, same grid as the scan) and
out-prefix.organs.json: for each structure present, its label value, name, volume in ml and the
centre of its largest piece as RAS fractions (what the viewer's crosshair uses).
TotalSegmentator is only needed for the first step, so it isn't in requirements.txt.

The optional third argument is the output folder of TotalSegmentator's lung_vessels task
(lung_vessels.nii.gz and lung_trachea_bronchia.nii.gz). Those are added as extra labels, only where
the main map has lung or nothing, so the heart and windpipe keep their own labels.
"""
import json
import sys

import nibabel as nib
import numpy as np
from totalsegmentator.map_to_binary import class_map

# Tiny specks are segmentation noise, not organs worth listing.
MIN_ML = 0.5
# Gap between empty space (0) and the first organ; see the shift in main().
OFFSET = 10
# Label values for the extra structures, above the 117 of the main task (before the shift).
EXTRA = {"lung_trachea_bronchia": 201, "lung_vessels": 202}
LUNG_LOBES = {"lung_upper_lobe_left", "lung_lower_lobe_left", "lung_upper_lobe_right", "lung_middle_lobe_right", "lung_lower_lobe_right"}


def main(src, prefix, extra_dir=None):
    img = nib.load(src)
    labels = np.asarray(img.dataobj).astype(np.uint8)
    names = dict(class_map["total"])
    if extra_dir:
        lung = np.isin(labels, [k for k, v in names.items() if v in LUNG_LOBES]) | (labels == 0)
        for name, value in EXTRA.items():
            mask = np.asarray(nib.load(f"{extra_dir}/{name}.nii.gz").dataobj) > 0
            labels[mask & lung] = value
            names[value] = name
    # Shift every label up by OFFSET so values 1..OFFSET-1 are never used. NiiVue can draw empty space (0)
    # in the colour of the lowest label (label 1 in 2D, the next one up in 3D), so the viewer keeps the
    # values below OFFSET as see-through placeholders. Names keep their TotalSegmentator value + OFFSET.
    labels = np.where(labels > 0, labels + OFFSET, 0).astype(np.uint8)
    names = {k + OFFSET: v for k, v in names.items()}
    canon = nib.as_closest_canonical(nib.Nifti1Image(labels, img.affine))
    data = np.asarray(canon.dataobj)
    voxel_ml = float(np.prod(canon.header.get_zooms()[:3])) / 1000
    dims = np.array(data.shape, dtype=np.float64)

    stats = []
    for value in np.unique(data):
        if value == 0:
            continue
        idx = np.argwhere(data == value)
        ml = len(idx) * voxel_ml
        if ml < MIN_ML:
            continue
        # The voxel nearest the centre of mass, so the point is inside the organ even if it is curved.
        com = idx.mean(axis=0)
        inside = idx[np.argmin(((idx - com) ** 2).sum(axis=1))]
        stats.append({
            "label": int(value),
            "name": names[int(value)],
            "ml": round(ml, 1),
            "center": [round(float(c), 4) for c in (inside + 0.5) / dims],
        })

    nib.save(nib.Nifti1Image(labels, img.affine), f"{prefix}.organs.nii.gz")
    with open(f"{prefix}.organs.json", "w") as f:
        json.dump(stats, f, separators=(",", ":"))
    print(f"{len(stats)} structures, total {sum(s['ml'] for s in stats):.0f} ml")


if __name__ == "__main__":
    main(*sys.argv[1:4])
