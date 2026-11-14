"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AUTH_ERROR_EVENT } from "@/lib/useSession";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const NAV: [string, string, (p: string) => boolean][] = [
  ["/", "Overview", (p) => p === "/" || p.startsWith("/scan")],
  ["/upload", "New analysis", (p) => p.startsWith("/upload")],
  ["/series", "Full scans", (p) => p.startsWith("/series")],
  ["/anatomy", "Anatomy lab", (p) => p.startsWith("/anatomy")],
  ["/cases", "Cases", (p) => p.startsWith("/cases")],
];

export default function Header() {
  const path = usePathname();
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    const on = (e: Event) => setAuthError((e as CustomEvent<string>).detail);
    window.addEventListener(AUTH_ERROR_EVENT, on);
    return () => window.removeEventListener(AUTH_ERROR_EVENT, on);
  }, []);
  // Someone opening a share link isn't signed in, so they only get the name and the notice.
  const shared = path.startsWith("/share");

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand"><Logo /><span>Orbi<span className="brand-accent">nova</span> Imaging</span></Link>
        {!shared && (
          <nav className="pills" aria-label="Main">
            {NAV.map(([href, text, on]) => (
              <Link key={href} href={href} aria-current={on(path) ? "page" : undefined}>{text}</Link>
            ))}
          </nav>
        )}
        <div className="topbar-end">
          <ThemeToggle />
        </div>
      </header>
      {authError && <div className="callout bad auth-error" role="alert"><strong>The app couldn&apos;t start</strong>{authError}</div>}
      <p className="notice">Decision support only. Results are not a diagnosis and must be reviewed by a qualified clinician.</p>
    </>
  );
}
