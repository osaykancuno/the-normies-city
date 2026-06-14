import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import "./globals.css";

// Legible pixel-art UI font, loaded reliably via next/font (self-hosted at
// build, no dead external URL). Exposes a CSS variable consumed by --font-pixel
// in globals.css. The official NormiesFont.otf is a display/logo face that's
// unreadable at small chrome sizes, so the UI uses Silkscreen instead.
const silkscreen = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-silkscreen",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Normies City",
  description:
    "A 3D pixel-art city that tells the story of every Normie. Live on-chain burns, transforms and transfers, rendered in brand monochrome.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={silkscreen.variable}>
      <body>{children}</body>
    </html>
  );
}
