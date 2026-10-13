import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Virtual Dice Roller for Tabletop 🎲",
  description:
    "Roll D4–D100, build custom notation, track history & stats, and ask Dice Master AI. Built with Next.js, Supabase and Gemini."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
