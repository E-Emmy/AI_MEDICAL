import "./globals.css";
import { Instrument_Sans } from "next/font/google";
import Header from "@/components/Header";

const sans = Instrument_Sans({ subsets: ["latin"], axes: ["wdth"], variable: "--font-sans" });

export const metadata = { title: "ScanLens", description: "AI-assisted analysis of X-ray and CT images" };

// Applies the saved theme before first paint so the page doesn't flash the wrong colours.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}
