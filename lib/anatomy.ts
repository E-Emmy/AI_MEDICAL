// The anatomy lab: short lessons on one body system each, explored in 3D on the sample chest CT's
// organ map. Written for students and patients; simplified, and should be checked by a clinician.

export type Topic = {
  id: string;
  title: string;
  // The body system, shown as a label on the card.
  system: string;
  // One line for the topic card.
  blurb: string;
  // A 3D render of the topic from the same scan, used as the card's background.
  image: string;
  // Organ ids from lib/organs.ts switched on when the lesson opens. Empty means all of them.
  organs: string[];
  lesson: string[];
  // Things to try in the viewer, to make the learner look rather than read.
  tryThis: string[];
  // Not available yet (shown as "coming soon").
  later?: boolean;
};

export const TOPICS: Topic[] = [
  {
    id: "lungs",
    title: "Lungs and airways",
    system: "Respiratory system",
    image: "/anatomy/lungs.jpg",
    blurb: "Lobes, windpipe and the branching airway tree.",
    organs: ["trachea", "bronchi", "lung_upper_lobe_right", "lung_middle_lobe_right", "lung_lower_lobe_right", "lung_upper_lobe_left", "lung_lower_lobe_left"],
    lesson: [
      "Air travels down the windpipe (trachea), which splits into a left and a right main airway (bronchus). These keep dividing, more than 20 times, into ever smaller tubes that end in tiny air sacs called alveoli.",
      "In the alveoli, oxygen passes into the blood and carbon dioxide passes out to be breathed away. Spread flat, the lungs' inner surface would cover roughly a tennis court.",
      "The right lung has three lobes (upper, middle and lower) and the left lung only two, because the heart takes up room on the left.",
    ],
    tryThis: [
      "Untick all the lobes except the airways to see the bronchial tree on its own.",
      "Click each lobe and compare their volumes: which is the largest?",
      "Turn to the side view to see how the lower lobes reach down the back.",
    ],
  },
  {
    id: "heart",
    title: "The heart",
    system: "Cardiovascular system",
    image: "/anatomy/heart.jpg",
    blurb: "The pump, and the great vessels that enter and leave it.",
    organs: ["heart", "atrial_appendage_left", "aorta", "superior_vena_cava", "inferior_vena_cava", "pulmonary_vein"],
    lesson: [
      "The heart is a muscular pump about the size of a fist, sitting between the lungs and tilted towards the left.",
      "It has four chambers. The right side receives used blood from the body through the venae cavae and pumps it to the lungs. The left side receives fresh, oxygen-rich blood from the lungs through the pulmonary veins and pumps it to the whole body through the aorta.",
      "This two-loop design, lungs then body, is called the double circulation.",
    ],
    tryThis: [
      "Switch on the lungs too, then turn the view to see how the heart nestles between them.",
      "Find where the superior vena cava enters the heart from above, and where the aorta arches out of it.",
    ],
  },
  {
    id: "arteries",
    title: "Arteries",
    system: "Cardiovascular system",
    image: "/anatomy/arteries.jpg",
    blurb: "Vessels that carry blood away from the heart.",
    organs: ["aorta", "brachiocephalic_trunk", "carotids", "subclavians"],
    lesson: [
      "Arteries carry blood away from the heart under high pressure, so they have thick, muscular, elastic walls. That pressure is the pulse you can feel at your wrist or neck.",
      "The aorta is the body's largest artery. It rises from the heart, arches over it, and runs down beside the spine.",
      "Three large branches leave the top of the aortic arch: the brachiocephalic trunk (which divides into the right carotid and right subclavian arteries), the left common carotid artery and the left subclavian artery. The carotids supply the head and brain; the subclavians supply the arms.",
    ],
    tryThis: [
      "Use the Front view and follow the aorta from the heart, over the arch, and down.",
      "Count the branches coming off the top of the arch.",
    ],
  },
  {
    id: "veins",
    title: "Veins",
    system: "Cardiovascular system",
    image: "/anatomy/veins.jpg",
    blurb: "Vessels that bring blood back to the heart.",
    organs: ["superior_vena_cava", "inferior_vena_cava", "brachiocephalic_veins", "pulmonary_vein", "portal_vein_and_splenic_vein"],
    lesson: [
      "Veins return blood to the heart at low pressure. Their walls are thinner than arteries', and many have valves that stop blood flowing backwards.",
      "Two great veins empty into the heart: the superior vena cava brings blood from the head, neck and arms, and the inferior vena cava brings blood from the rest of the body.",
      "The pulmonary veins are an exception to the rule that veins carry used blood: they bring oxygen-rich blood from the lungs to the heart. The portal vein is another special case, carrying blood from the gut to the liver first.",
    ],
    tryThis: [
      "Switch on the arteries lesson's aorta (tick Aorta in the list) to compare an artery and a vein side by side.",
      "Follow the brachiocephalic veins as they join to form the superior vena cava.",
    ],
  },
  {
    id: "skeleton",
    title: "Ribs and spine",
    system: "Musculoskeletal system",
    image: "/anatomy/skeleton.jpg",
    blurb: "The bony cage that protects the chest.",
    organs: ["ribs", "costal_cartilages", "sternum", "vertebrae", "spinal_cord", "clavicles", "scapulae"],
    lesson: [
      "Twelve pairs of ribs curve around from the spine to form a protective cage for the heart and lungs. The upper ribs join the breastbone (sternum) through flexible cartilage, which lets the chest expand with each breath.",
      "The spine is a stack of vertebrae. The 12 thoracic vertebrae in the chest each carry a pair of ribs. Inside the spine runs the spinal cord, the main nerve pathway between the brain and the body.",
    ],
    tryThis: [
      "Use the Back view to see the ribs meet the spine.",
      "Tick only the spinal cord and spine, then click the cord to see where it runs.",
    ],
  },
  {
    id: "abdomen",
    title: "Upper abdominal organs",
    system: "Digestive and urinary systems",
    image: "/anatomy/abdomen.jpg",
    blurb: "Liver, stomach, spleen and more, just below the diaphragm.",
    organs: ["liver", "gallbladder", "stomach", "spleen", "pancreas", "kidneys", "adrenals", "duodenum", "colon"],
    lesson: [
      "Just under the diaphragm, the muscle you breathe with, sit the liver on the right and the stomach and spleen on the left. A chest CT usually catches their upper parts.",
      "The liver is the largest internal organ: it filters blood, makes bile, stores energy and clears toxins. The pancreas makes digestive enzymes and insulin. The kidneys filter waste from the blood to make urine.",
    ],
    tryThis: [
      "Click the liver and compare its volume with a lung lobe's.",
      "Switch the lungs back on to see how the liver sits right under the right lung.",
    ],
  },
  {
    id: "chest",
    title: "The whole chest",
    system: "All systems",
    image: "/anatomy/chest.jpg",
    blurb: "Everything at once: take it apart layer by layer.",
    organs: [],
    lesson: [
      "This shows every structure the AI outlined in this scan, over 80 in all. Start with everything on, then switch groups off one by one to dissect the chest from the outside in.",
    ],
    tryThis: [
      "Untick Bones and spine, then Lungs and airway, to reach the heart.",
      "Turn on the scan again (switch off Organs only) to compare the outlines with the real CT.",
    ],
  },
  {
    id: "brain",
    title: "The brain",
    system: "Nervous system",
    image: "/anatomy/brain.jpg",
    blurb: "Lobes, ventricles and deep structures.",
    organs: [],
    lesson: [],
    tryThis: [],
    later: true,
  },
  {
    // Planned: a head-to-thigh CT from the TotalSegmentator dataset (CC BY 4.0), outlined with its "total" task.
    id: "full-body",
    title: "The whole body",
    system: "Full-body CT",
    image: "/anatomy/full-body.jpg",
    blurb: "Head to thigh in one scan: brain, spine, kidneys, pelvis and the bones and muscles of the legs.",
    organs: [],
    lesson: [],
    tryThis: [],
    later: true,
  },
];

export const findTopic = (id: string) => TOPICS.find((t) => t.id === id && !t.later);
