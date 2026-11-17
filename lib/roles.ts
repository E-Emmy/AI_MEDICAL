import type { Session } from "@supabase/supabase-js";

// Demo roles. Each one lands on its own section and sees a menu for it. Stored in the Supabase user's
// metadata, which the user can change themselves, so this shapes the experience only: it is not
// access control, and every account can still open every page by its address.
export type Role = "doctor" | "radiologist" | "student";

export type RoleInfo = {
  id: Role;
  title: string;
  blurb: string;
  // Where the role lands after signing in.
  home: string;
  // The sections (path prefixes) that ask to sign in as this role.
  paths: string[];
  // The section this role opens, its picture and what it offers (shown on the sign-in box).
  // Pictures in public/signin are free Pexels photos (pexels.com/license): doctor 4225883 and
  // radiologist 4226264 by Anna Shvets, student 5427646.
  section: string;
  image: string;
  features: string[];
  // The ready-made demo account, filled in on the sign-in box.
  demo: { email: string; password: string };
};

// Shared by the three demo accounts; they hold demo data only.
const DEMO_PASSWORD = "OrbinovaDemo2026";

export const ROLES: RoleInfo[] = [
  {
    id: "doctor",
    title: "Doctor",
    blurb: "Upload one X-ray, CT slice or photo for an AI second opinion, then review, share or print it.",
    home: "/upload",
    paths: ["/upload", "/scan", "/cases"],
    section: "New analysis",
    image: "/signin/doctor.jpg",
    features: ["AI second opinion in seconds", "Findings marked on the image", "Share, review and print reports"],
    demo: { email: "doctor@orbinova-demo.com", password: DEMO_PASSWORD },
  },
  {
    id: "radiologist",
    title: "Radiologist",
    blurb: "Read whole CT and MRI scans in 3D, with every slice checked by AI and findings marked.",
    home: "/series",
    paths: ["/series"],
    section: "Full scans",
    image: "/signin/radiologist.jpg",
    features: ["Whole CT and MRI scans in 3D", "Every slice checked by AI", "Findings circled in place"],
    demo: { email: "radiologist@orbinova-demo.com", password: DEMO_PASSWORD },
  },
  {
    id: "student",
    title: "Student",
    blurb: "Learn the inside of the body in 3D from a real CT scan, one system at a time.",
    home: "/anatomy",
    paths: ["/anatomy"],
    section: "Anatomy lab",
    image: "/signin/student.jpg",
    features: ["80+ structures from a real CT", "Guided lessons by body system", "Labels and notes on every part"],
    demo: { email: "student@orbinova-demo.com", password: DEMO_PASSWORD },
  },
];

export const findRole = (r: unknown) => ROLES.find((x) => x.id === r);
export const roleOf = (s: Session | null) => findRole(s?.user?.user_metadata?.role);

// The role a page belongs to, if it needs a sign-in at all (the overview and share links don't).
export const roleForPath = (path: string) =>
  ROLES.find((r) => r.paths.some((p) => path === p || path.startsWith(p + "/")));
