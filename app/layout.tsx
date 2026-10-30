import "./globals.css";
import Link from "next/link";

export const metadata = { title: "ScanLens", description: "AI-assisted CT scan analysis" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <strong>ScanLens</strong>
          <Link href="/">Dashboard</Link>
          <Link href="/upload">New analysis</Link>
        </header>
        <div className="notice">Decision support only. Results are not a diagnosis and must be reviewed by a qualified clinician.</div>
        <main>{children}</main>
      </body>
    </html>
  );
}
