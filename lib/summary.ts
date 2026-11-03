import { scanName, testName, type Analysis, type ReviewRow } from "./analysis";
import { labelText } from "./format";
import { isNormal } from "./tests";

// Plain-language summaries a doctor can read out or hand to a patient. Built from fixed,
// reviewed sentences rather than generated text, so they never claim more than the result says.

// What a finding means, in words a patient would use. Keys are lower-case model labels.
const MEANING: Record<string, string> = {
  pneumonia: "an infection that inflames the air sacs in the lungs",
  "covid-19": "lung changes of the kind COVID-19 can cause",
  covid: "lung changes of the kind COVID-19 can cause",
  tuberculosis: "tuberculosis, a bacterial infection that usually affects the lungs",
  glioma: "a glioma, a tumour that starts in the brain's supporting cells",
  meningioma: "a meningioma, a usually slow-growing tumour of the brain's outer lining",
  pituitary: "a pituitary tumour, a growth on the small gland at the base of the brain",
  fractured: "a broken bone",
  effusion: "fluid around the lungs",
  cardiomegaly: "an enlarged heart",
  nodule: "a small spot in the lung",
  mass: "a larger area of tissue in the lung",
  atelectasis: "part of a lung not fully inflating",
  pneumothorax: "air leaking around the lung",
  consolidation: "an area of the lung filled with fluid or cells",
  edema: "extra fluid in the lungs",
  emphysema: "damage to the lung's air sacs",
  fibrosis: "scarring of the lung tissue",
  infiltration: "something filling the lung tissue, such as fluid or cells",
  pleural_thickening: "thickening of the lining around the lungs",
  hernia: "part of an organ pushing through the diaphragm",
  adenocarcinoma: "a type of lung cancer",
  large_cell_carcinoma: "a type of lung cancer",
  squamous_cell_carcinoma: "a type of lung cancer",
  positive: "signs the test is looking for",
  melanoma: "melanoma, a serious type of skin cancer",
  "basal cell carcinoma": "basal cell carcinoma, a common and slow-growing skin cancer",
  "actinic keratosis": "a rough, sun-damaged patch of skin that can sometimes turn into skin cancer",
  "benign keratosis": "a harmless skin growth, such as a seborrheic keratosis",
  dermatofibroma: "a harmless firm bump in the skin",
  "mole (melanocytic nevus)": "an ordinary mole",
  "vascular lesion": "a spot made of small blood vessels, usually harmless",
  mild: "early signs of diabetic eye damage",
  moderate: "diabetic eye damage that needs regular checks",
  severe: "advanced diabetic eye damage",
  "proliferative dr": "the most advanced stage of diabetic eye damage, where new fragile blood vessels grow",
  "kl 1 (doubtful)": "possible very early wear of the knee joint",
  "kl 2 (mild)": "mild wear of the knee joint (osteoarthritis)",
  "kl 3 (moderate)": "moderate wear of the knee joint (osteoarthritis)",
  "kl 4 (severe)": "severe wear of the knee joint (osteoarthritis)",
};

function strength(score: number) {
  if (score >= 0.9) return "clear";
  if (score >= 0.7) return "some";
  return "weak";
}

function sentence(r: Analysis, review?: ReviewRow) {
  const top = r.predictions[0];
  const test = testName(r).toLowerCase();
  let s: string;
  if (!top) s = `The ${test} test didn't return a result for this scan.`;
  else if (isNormal(top.label)) s = `The ${test} test didn't find signs of what it looks for.`;
  else {
    const label = labelText(top.label);
    const meaning = MEANING[top.label.toLowerCase()];
    s = `The ${test} test found ${strength(top.score)} signs of ${label.toLowerCase()}${meaning && meaning !== label.toLowerCase() ? ` (${meaning})` : ""}.`;
  }
  if (review?.verdict === "agree") s += " Your doctor looked at this result and agrees with it.";
  if (review?.verdict === "disagree") s += " Your doctor looked at this result and doesn't agree with it.";
  if (review?.verdict === "unsure") s += " Your doctor looked at this result and wants to check it further.";
  return s;
}

export function summarise(runs: Analysis[], reviews: Record<string, ReviewRow> | null): string[] {
  const scan = scanName(runs[0]);
  const intro = runs.length === 1
    ? `Your ${scan} was checked by a computer program trained on many similar scans.`
    : `Your ${scan} was checked by ${runs.length} computer programs, each trained on many similar scans to look for one kind of problem.`;
  return [
    intro,
    ...runs.map((r) => sentence(r, reviews?.[r.id])),
    "These programs can be wrong, and they are not a diagnosis. Your doctor decides what the scan shows and what happens next.",
  ];
}
