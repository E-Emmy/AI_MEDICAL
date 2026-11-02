export const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const pct = (score: number | null | undefined, digits = 1) => (score == null ? "" : `${(score * 100).toFixed(digits)}%`);

// Models often return labels like "PNEUMONIA" or "LARGE_CELL"; show them in sentence case.
export const labelText = (label: string) =>
  /^[A-Z0-9_ ]+$/.test(label) ? (label.charAt(0) + label.slice(1).toLowerCase()).replace(/_/g, " ") : label;

// "org/chest-xray-model" reads better as "chest-xray-model" in tight spaces.
export const shortModel = (model: string) => model.split("/").pop() ?? model;
