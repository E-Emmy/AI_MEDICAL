"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const path = usePathname();
  const router = useRouter();
  if (path === "/login") return null;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand"><Logo />ScanLens</Link>
        <nav className="mainnav" aria-label="Main">
          <Link href="/" aria-current={path === "/" ? "page" : undefined}>Dashboard</Link>
          <Link href="/upload" aria-current={path.startsWith("/upload") ? "page" : undefined}>New analysis</Link>
        </nav>
        <div className="topbar-end">
          <ThemeToggle />
          <button className="btn btn-quiet btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <p className="notice">Decision support only. Results are not a diagnosis and must be reviewed by a qualified clinician.</p>
    </>
  );
}
