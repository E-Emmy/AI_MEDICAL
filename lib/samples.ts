import list from "@/public/samples/samples.json";

// Labelled, anonymised scans from public datasets, so anyone can try the app without their own
// scans. `truth` is the dataset's own label, shown next to the model's answer.
// Rebuild public/samples/ with model-server/build_samples.py.
export type Sample = { id: string; file: string; scan: string; truth: string; source: string; url: string; licence: string };

export const SAMPLES: Sample[] = list;

export const findSample = (id: unknown) => SAMPLES.find((s) => s.id === id);
