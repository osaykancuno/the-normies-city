import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Normies City",
  description:
    "A 3D pixel-art city that tells the story of every Normie. Live on-chain burns, transforms and transfers, rendered in brand monochrome.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
