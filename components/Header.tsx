"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const NAV: [string, string, (p: string) => boolean][] = [
  ["/", "Overview", (p) => p === "/" || p.startsWith("/scan")],
  ["/upload", "New analysis", (p) => p.startsWith("/upload")],
  ["/cases", "Cases", (p) => p.startsWith("/cases")],
];

export default function Header() {
  const path = usePathname();
  const router = useRouter();
  if (path === "/login") return null;
  // Someone opening a share link isn't signed in, so they only get the name and the notice.
  const shared = path.startsWith("/share");

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <header className="topbar">
        <Link href={shared ? "/login" : "/"} className="brand"><Logo />ScanLens</Link>
        {!shared && (
          <nav className="pills" aria-label="Main">
            {NAV.map(([href, text, on]) => (
              <Link key={href} href={href} aria-current={on(path) ? "page" : undefined}>{text}</Link>
            ))}
          </nav>
        )}
        <div className="topbar-end">
          <ThemeToggle />
          {!shared && <button className="btn btn-quiet btn-sm" onClick={signOut}>Sign out</button>}
        </div>
      </header>
      <p className="notice">Decision support only. Results are not a diagnosis and must be reviewed by a qualified clinician.</p>
    </>
  );
}
