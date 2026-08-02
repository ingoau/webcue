import type { Metadata } from "next";
import "./globals.css";
import Pwa from "./pwa";

export const metadata: Metadata = {
  title: "StageCue - Browser Show Control",
  description: "A Chromium-based cue workspace for live show control.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", apple: "/icon-192.png" },
};

export const viewport = { themeColor: "#171717" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Pwa />{children}</body></html>;
}
