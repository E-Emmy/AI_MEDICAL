import type { SeriesFacts, SeriesKind } from "./series";

// Full scans from public research datasets, already converted and stored in R2 under samples/.
// TCIA's terms require crediting the collection wherever these are shown.
export type SeriesSample = {
  id: string;
  kind: SeriesKind;
  title: string;
  finding: string;
  key: string;
  thumb: string;
  // Precomputed analysis (public/series-samples), so the sample opens with its results straight away.
  results: string;
  // The original DICOM folder, zipped, for people who want to try uploading a full scan themselves.
  download: { key: string; size: string };
  // Organ map from TotalSegmentator (model-server/build_organs.py): "<prefix>.organs.nii.gz" and ".organs.json".
  organs?: string;
  facts: SeriesFacts;
  credit: string;
  url: string;
};

export const SERIES_SAMPLES: SeriesSample[] = [
  {
    id: "sample-brain-mri",
    kind: "brain-mri",
    title: "Brain MRI",
    finding: "Glioblastoma (brain tumour)",
    key: "samples/brain-mri-glioblastoma.nii.gz",
    thumb: "/series-samples/brain-mri-glioblastoma.jpg",
    results: "/series-samples/brain-mri-glioblastoma.results.json",
    download: { key: "samples/downloads/orbinova-sample-brain-mri-glioblastoma-t1-contrast.zip", size: "8.6 MB" },
    facts: {
      modality: "MR", bodyPart: "BRAIN", description: "T1 axial with contrast",
      size: [192, 256, 192], spacing: [0.98, 0.98, 1], sliceThickness: 1, range: [0, 2504],
    },
    credit: "UPENN-GBM collection, The Cancer Imaging Archive (CC BY 4.0)",
    url: "https://doi.org/10.7937/TCIA.709X-DN49",
  },
  {
    id: "sample-chest-ct",
    kind: "chest-ct",
    title: "Chest CT",
    finding: "Lung nodule marked by radiologists",
    key: "samples/chest-ct-lung-nodule.nii.gz",
    thumb: "/series-samples/chest-ct-lung-nodule.jpg",
    results: "/series-samples/chest-ct-lung-nodule.results.json",
    download: { key: "samples/downloads/orbinova-sample-chest-ct-lung-nodule.zip", size: "35 MB" },
    organs: "/series-samples/chest-ct-lung-nodule",
    facts: {
      modality: "CT", bodyPart: "CHEST",
      size: [512, 512, 133], spacing: [0.7, 0.7, 2.5], sliceThickness: 2.5, range: [-2048, 3071],
    },
    credit: "LIDC-IDRI collection, The Cancer Imaging Archive (CC BY 3.0)",
    url: "https://doi.org/10.7937/K9/TCIA.2015.LO9QL9SX",
  },
];

export const findSeriesSample = (id: string) => SERIES_SAMPLES.find((s) => s.id === id);
