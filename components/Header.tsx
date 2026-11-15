"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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
  const router = useRouter();
  // Whether this is the automatic visitor account (shows "Sign in") or a real one (shows "Sign out").
  const [anon, setAnon] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAnon(data.session ? !!data.session.user.is_anonymous : null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAnon(s ? !!s.user.is_anonymous : null));
    return () => data.subscription.unsubscribe();
  }, []);
  // On phones the tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    document.querySelector('.pills a[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);
  if (path === "/login") return null;
  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Someone opening a share link isn't signed in, so they only get the name and the notice.
  const shared = path.startsWith("/share");

  return (
    <>
      <header className="topbar">
        <Link href={shared ? "/login" : "/"} className="brand"><Logo /><span>Orbi<span className="brand-accent">nova</span> Imaging</span></Link>
        {!shared && (
          <nav className="pills" aria-label="Main">
            {NAV.map(([href, text, on]) => (
              <Link key={href} href={href} aria-current={on(path) ? "page" : undefined}>{text}</Link>
            ))}
          </nav>
        )}
        <div className="topbar-end">
          <ThemeToggle />
          {!shared && anon === true && <Link className="btn btn-sm" href="/login">Sign in</Link>}
          {!shared && anon === false && <button className="btn btn-quiet btn-sm" onClick={signOut}>Sign out</button>}
        </div>
      </header>
      <p className="notice">Decision support only. Results are not a diagnosis and must be reviewed by a qualified clinician.</p>
    </>
  );
}
