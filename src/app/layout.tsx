import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import CharacterAiFloatingChat from "@/components/CharacterAiFloatingChat";

export const metadata: Metadata = {
  title: "Portfólio Owlfund",
  description:
    "Dashboard inteligente para acompanhar seus investimentos com clareza.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <CharacterAiFloatingChat />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
