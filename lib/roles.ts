import type { Session } from "@supabase/supabase-js";

// Demo roles. A clinician (doctor or radiologist) uses New analysis and Full scans with one sign-in; a
// student uses the Anatomy lab. The role is stored in the Supabase user's metadata, which the user can
// change themselves, so this shapes the experience only: it is not access control, and every account
// can still open every page by its address.
export type Role = "doctor" | "student";

export type RoleInfo = {
  id: Role;
  title: string;
  blurb: string;
  // Where the role lands after signing in from the login page.
  home: string;
  // The ready-made demo account, filled in on the sign-in box.
  demo: { email: string; password: string };
};

// Shared by the demo accounts; they hold demo data only.
const DEMO_PASSWORD = "OrbinovaDemo2026";

export const ROLES: RoleInfo[] = [
  {
    id: "doctor",
    title: "Clinician",
    blurb: "For doctors and radiologists: AI analysis of single images and of whole CT and MRI scans in 3D.",
    home: "/upload",
    demo: { email: "doctor@orbinova-demo.com", password: DEMO_PASSWORD },
  },
  {
    id: "student",
    title: "Student",
    blurb: "Learn the inside of the body in 3D from a real CT scan, one system at a time.",
    home: "/anatomy",
    demo: { email: "student@orbinova-demo.com", password: DEMO_PASSWORD },
  },
];

// The sections that ask for a sign-in, and what the sign-in box shows for each. New analysis and Full
// scans share the clinician sign-in, so signing in for one opens the other too.
// Pictures in public/signin are free Pexels photos (pexels.com/license): doctor 4225883 and
// radiologist 4226264 by Anna Shvets, student 5427646.
export type SectionInfo = {
  title: string;
  role: Role;
  audience: string;
  blurb: string;
  image: string;
  features: string[];
  paths: string[];
};

export const SECTIONS: SectionInfo[] = [
  {
    title: "New analysis",
    role: "doctor",
    audience: "For doctors",
    blurb: "Upload one X-ray, CT slice or photo for an AI second opinion, then review, share or print it.",
    image: "/signin/doctor.jpg",
    features: ["AI second opinion in seconds", "Findings marked on the image", "Share, review and print reports"],
    paths: ["/upload", "/scan", "/cases"],
  },
  {
    title: "Full scans",
    role: "doctor",
    audience: "For radiologists",
    blurb: "Read whole CT and MRI scans in 3D, with every slice checked by AI and findings marked.",
    image: "/signin/radiologist.jpg",
    features: ["Whole CT and MRI scans in 3D", "Every slice checked by AI", "Findings circled in place"],
    paths: ["/series"],
  },
  {
    title: "Anatomy lab",
    role: "student",
    audience: "For students",
    blurb: "Learn the inside of the body in 3D from a real CT scan, one system at a time.",
    image: "/signin/student.jpg",
    features: ["80+ structures from a real CT", "Guided lessons by body system", "Labels and notes on every part"],
    paths: ["/anatomy"],
  },
];

// Accounts made before the roles were merged may still say "radiologist"; that is a clinician now.
export const findRole = (r: unknown) => ROLES.find((x) => x.id === (r === "radiologist" ? "doctor" : r));
export const roleOf = (s: Session | null) => findRole(s?.user?.user_metadata?.role);

// The section a page belongs to, if it needs a sign-in at all (the overview and share links don't).
export const sectionForPath = (path: string) =>
  SECTIONS.find((s) => s.paths.some((p) => path === p || path.startsWith(p + "/")));
