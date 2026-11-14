// The organ explorer: structures outlined by TotalSegmentator (its "total" task), grouped for display.
// Several labels can share one entry (every rib is "Ribs"). Descriptions are short, plain-language
// summaries for education; they are not medical advice and should be checked by a clinician.

export type OrganGroup = "Lungs and airway" | "Heart and blood vessels" | "Bones and spine" | "Other organs";
export const ORGAN_GROUPS: OrganGroup[] = ["Lungs and airway", "Heart and blood vessels", "Bones and spine", "Other organs"];

export type Organ = {
  id: string;
  name: string;
  group: OrganGroup;
  color: [number, number, number];
  about: string;
  // TotalSegmentator label names covered by this entry. Defaults to [id].
  labels?: string[];
};

const ribs = Array.from({ length: 12 }, (_, i) => [`rib_left_${i + 1}`, `rib_right_${i + 1}`]).flat();
const vertebrae = [...Array.from({ length: 7 }, (_, i) => `vertebrae_C${i + 1}`), ...Array.from({ length: 12 }, (_, i) => `vertebrae_T${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `vertebrae_L${i + 1}`), "vertebrae_S1", "sacrum"];

export const ORGANS: Organ[] = [
  // Lungs and airway
  { id: "lung_upper_lobe_right", name: "Right lung, upper lobe", group: "Lungs and airway", color: [96, 165, 250],
    about: "The right lung has three lobes. Air reaches the lungs' tiny air sacs, where oxygen passes into the blood and carbon dioxide passes out." },
  { id: "lung_middle_lobe_right", name: "Right lung, middle lobe", group: "Lungs and airway", color: [56, 189, 248],
    about: "Only the right lung has a middle lobe; the left lung has two lobes to make room for the heart." },
  { id: "lung_lower_lobe_right", name: "Right lung, lower lobe", group: "Lungs and airway", color: [59, 130, 246],
    about: "The largest lobe of the right lung, resting on the diaphragm. Lower lobes are a common place for infections and nodules." },
  { id: "lung_upper_lobe_left", name: "Left lung, upper lobe", group: "Lungs and airway", color: [125, 211, 252],
    about: "The left lung's upper lobe, which wraps around the front of the heart." },
  { id: "lung_lower_lobe_left", name: "Left lung, lower lobe", group: "Lungs and airway", color: [14, 165, 233],
    about: "The left lung's lower lobe. In the sample chest CT, the nodule radiologists marked is in this lobe." },
  { id: "trachea", name: "Trachea (windpipe)", group: "Lungs and airway", color: [167, 243, 208],
    about: "The tube that carries air from the throat to the lungs, where it splits into the left and right main airways." },
  { id: "bronchi", name: "Airway tree (bronchi)", group: "Lungs and airway", color: [52, 211, 153], labels: ["lung_trachea_bronchia"],
    about: "The windpipe divides into two main bronchi, which keep branching into smaller and smaller airways inside the lungs, like an upside-down tree." },
  { id: "lung_vessels", name: "Blood vessels in the lungs", group: "Lungs and airway", color: [248, 113, 113],
    about: "Branches of the pulmonary arteries and veins that run alongside the airways, carrying blood to the air sacs to pick up oxygen and back to the heart." },
  { id: "esophagus", name: "Oesophagus (food pipe)", group: "Lungs and airway", color: [251, 191, 36],
    about: "The muscular tube that carries food and drink from the throat to the stomach, running behind the windpipe and heart." },

  // Heart and blood vessels
  { id: "heart", name: "Heart", group: "Heart and blood vessels", color: [220, 38, 38],
    about: "A muscular pump with four chambers. The right side sends blood to the lungs for oxygen; the left side pumps oxygen-rich blood to the whole body." },
  { id: "atrial_appendage_left", name: "Left atrial appendage", group: "Heart and blood vessels", color: [244, 114, 182],
    about: "A small pouch on the heart's left upper chamber. In an irregular heartbeat (atrial fibrillation), blood clots can form here." },
  { id: "aorta", name: "Aorta", group: "Heart and blood vessels", color: [239, 68, 68],
    about: "The body's largest artery. It carries oxygen-rich blood from the heart, arches over it, and runs down beside the spine." },
  { id: "pulmonary_vein", name: "Pulmonary veins", group: "Heart and blood vessels", color: [251, 113, 133],
    about: "Bring oxygen-rich blood from the lungs back to the heart's left upper chamber, ready to be pumped to the body." },
  { id: "brachiocephalic_trunk", name: "Brachiocephalic trunk", group: "Heart and blood vessels", color: [249, 115, 22],
    about: "The first branch of the aorta. It supplies the right arm and the right side of the head and neck." },
  { id: "carotids", name: "Carotid arteries", group: "Heart and blood vessels", color: [234, 88, 12],
    labels: ["common_carotid_artery_left", "common_carotid_artery_right"],
    about: "Run up both sides of the neck and supply the head, face and most of the brain." },
  { id: "subclavians", name: "Subclavian arteries", group: "Heart and blood vessels", color: [251, 146, 60],
    labels: ["subclavian_artery_left", "subclavian_artery_right"],
    about: "Run under the collarbones and supply blood to the arms." },
  { id: "superior_vena_cava", name: "Superior vena cava", group: "Heart and blood vessels", color: [99, 102, 241],
    about: "The large vein that returns blood from the head, neck, arms and chest to the heart's right upper chamber." },
  { id: "brachiocephalic_veins", name: "Brachiocephalic veins", group: "Heart and blood vessels", color: [129, 140, 248],
    labels: ["brachiocephalic_vein_left", "brachiocephalic_vein_right"],
    about: "Collect blood from the head, neck and arms and join to form the superior vena cava." },
  { id: "inferior_vena_cava", name: "Inferior vena cava", group: "Heart and blood vessels", color: [79, 70, 229],
    about: "The large vein that returns blood from the legs, abdomen and pelvis to the heart." },
  { id: "portal_vein_and_splenic_vein", name: "Portal and splenic veins", group: "Heart and blood vessels", color: [139, 92, 246],
    about: "Carry blood from the stomach, bowel and spleen to the liver, which processes nutrients before they reach the rest of the body." },

  // Bones and spine
  { id: "ribs", name: "Ribs", group: "Bones and spine", color: [231, 222, 200], labels: ribs,
    about: "Twelve pairs of curved bones that protect the heart and lungs and move with each breath." },
  { id: "costal_cartilages", name: "Rib cartilage", group: "Bones and spine", color: [214, 211, 209],
    about: "Flexible cartilage joining the front of the ribs to the breastbone, letting the chest expand when breathing." },
  { id: "sternum", name: "Sternum (breastbone)", group: "Bones and spine", color: [245, 236, 214],
    about: "The flat bone at the front of the chest that the ribs attach to; it shields the heart." },
  { id: "vertebrae", name: "Spine (vertebrae)", group: "Bones and spine", color: [253, 230, 138], labels: vertebrae,
    about: "The stack of bones that supports the body and protects the spinal cord. The chest section (thoracic spine) has 12 vertebrae, one for each pair of ribs." },
  { id: "spinal_cord", name: "Spinal cord", group: "Bones and spine", color: [250, 204, 21],
    about: "The bundle of nerves running inside the spine, carrying signals between the brain and the body." },
  { id: "clavicles", name: "Collarbones", group: "Bones and spine", color: [226, 232, 240], labels: ["clavicula_left", "clavicula_right"],
    about: "Connect the shoulders to the breastbone and hold the arms away from the body." },
  { id: "scapulae", name: "Shoulder blades", group: "Bones and spine", color: [203, 213, 225], labels: ["scapula_left", "scapula_right"],
    about: "Flat triangular bones on the upper back that anchor the shoulder and arm muscles." },
  { id: "humeri", name: "Upper arm bones", group: "Bones and spine", color: [241, 245, 249], labels: ["humerus_left", "humerus_right"],
    about: "The humerus, the long bone of the upper arm; only the top end is usually seen on a chest CT." },
  { id: "back_muscles", name: "Back muscles", group: "Bones and spine", color: [190, 120, 110], labels: ["autochthon_left", "autochthon_right"],
    about: "The deep muscles alongside the spine that keep the back upright and help it bend and twist." },

  // Other organs (often only partly in view on a chest CT)
  { id: "liver", name: "Liver", group: "Other organs", color: [146, 64, 14],
    about: "The largest internal organ. It filters the blood, makes bile to digest fat, stores energy and clears drugs and toxins." },
  { id: "gallbladder", name: "Gallbladder", group: "Other organs", color: [101, 163, 13],
    about: "A small pouch under the liver that stores bile and releases it into the gut after meals." },
  { id: "spleen", name: "Spleen", group: "Other organs", color: [168, 85, 247],
    about: "Filters the blood, removes old red blood cells and helps fight infection." },
  { id: "stomach", name: "Stomach", group: "Other organs", color: [236, 72, 153],
    about: "Stores food and starts digesting it with acid and enzymes." },
  { id: "pancreas", name: "Pancreas", group: "Other organs", color: [250, 204, 21],
    about: "Makes digestive enzymes and the hormones insulin and glucagon, which control blood sugar." },
  { id: "kidneys", name: "Kidneys", group: "Other organs", color: [180, 83, 9], labels: ["kidney_left", "kidney_right"],
    about: "Filter waste and extra water from the blood to make urine, and help control blood pressure." },
  { id: "adrenals", name: "Adrenal glands", group: "Other organs", color: [217, 119, 6], labels: ["adrenal_gland_left", "adrenal_gland_right"],
    about: "Small glands on top of the kidneys that make stress hormones such as adrenaline and cortisol." },
  { id: "duodenum", name: "Duodenum", group: "Other organs", color: [244, 114, 182],
    about: "The first part of the small intestine, just after the stomach, where bile and pancreatic juices mix with food." },
  { id: "small_bowel", name: "Small intestine", group: "Other organs", color: [253, 164, 175],
    about: "A long, coiled tube where most nutrients from food are absorbed into the blood." },
  { id: "colon", name: "Colon (large intestine)", group: "Other organs", color: [217, 70, 239],
    about: "Absorbs water and salts from what remains of food and forms stool." },
  { id: "thyroid_gland", name: "Thyroid gland", group: "Other organs", color: [16, 185, 129],
    about: "A butterfly-shaped gland in the neck whose hormones control the body's metabolism." },
];

// What the precompute script (model-server/build_organs.py) saves next to a sample's organ map.
export type OrganStat = { label: number; name: string; ml: number; center: [number, number, number] };
export type OrganMap = { url: string; stats: OrganStat[] };

// One entry per organ actually present in the scan, with its label values, total volume and a point to jump to.
export type PresentOrgan = Organ & { values: number[]; ml: number; center: [number, number, number] };

export function presentOrgans(stats: OrganStat[]): PresentOrgan[] {
  const byName = new Map(stats.map((s) => [s.name, s]));
  const out: PresentOrgan[] = [];
  for (const o of ORGANS) {
    const found = (o.labels ?? [o.id]).map((n) => byName.get(n)).filter((s): s is OrganStat => !!s);
    if (found.length === 0) continue;
    // Jump to the largest part, e.g. the biggest rib rather than an average of all of them.
    const main = found.reduce((a, b) => (b.ml > a.ml ? b : a));
    out.push({ ...o, values: found.map((s) => s.label), ml: found.reduce((t, s) => t + s.ml, 0), center: main.center });
  }
  return out;
}
