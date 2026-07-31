import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StageCue - Browser Show Control",
  description: "A Chromium-based cue workspace for live show control.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
