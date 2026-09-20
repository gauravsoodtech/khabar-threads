import type { Metadata } from "next";
import { Mukta, Rozha_One, Teko } from "next/font/google";
import "./globals.css";

// Rozha One reads like a Hindi daily's nameplate, Mukta is the everyday text face,
// Teko does the ticket-stub numbers. All three cover Devanagari and Latin.
const rozha = Rozha_One({ weight: "400", subsets: ["latin", "devanagari"], variable: "--font-rozha" });
const mukta = Mukta({ weight: ["400", "500", "600", "700"], subsets: ["latin", "devanagari"], variable: "--font-mukta" });
const teko = Teko({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-teko" });

export const metadata: Metadata = {
  title: "Khabar Threads",
  description: "Live news from BBC, NPR, the Guardian and Al Jazeera, threaded into stories on one timeline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${rozha.variable} ${mukta.variable} ${teko.variable} h-full`}>
      <body className="min-h-full bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
