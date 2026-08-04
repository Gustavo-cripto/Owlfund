import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import FloatingChat from "@/components/FloatingChat";
import ErrorMonitor from "@/components/ErrorMonitor";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { ThemeProvider } from "@/lib/theme/ThemeContext";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";
const SITE_TITLE = "ChainFolioAI — O teu portefólio cripto e tradicional num só lugar";
const SITE_DESC =
  "Carteiras, exchanges e ativos manuais num só painel. PNL em tempo real, métricas avançadas (ROI, Sharpe, drawdown), fiscalidade e um assistente de IA que conhece o teu portefólio. 100% só-leitura e gratuito para começar.";

// Dados estruturados (schema.org) — ajudam Google E modelos de IA a perceberem
// o produto, a categoria e os preços. Ver estratégia GEO.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "ChainFolioAI",
      url: SITE_URL,
      logo: `${SITE_URL}/chainfolioai-icon.png`,
    },
    {
      "@type": "SoftwareApplication",
      name: "ChainFolioAI",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description:
        "Read-only crypto + traditional portfolio tracker with real-time PNL, advanced metrics, multi-country tax tools, an AI assistant, and API/MCP access for AI agents. Non-custodial.",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "EUR" },
        { "@type": "Offer", name: "Pro", price: "14.99", priceCurrency: "EUR" },
        { "@type": "Offer", name: "Premium", price: "39.00", priceCurrency: "EUR" },
      ],
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · ChainFolioAI",
  },
  description: SITE_DESC,
  applicationName: "ChainFolioAI",
  keywords: [
    "portfólio cripto",
    "crypto portfolio tracker",
    "PNL cripto",
    "Bitcoin",
    "Ethereum",
    "Solana",
    "Cardano",
    "DeFi",
    "fiscalidade cripto",
    "assistente de IA",
    "read-only",
  ],
  authors: [{ name: "ChainFolioAI" }],
  icons: {
    icon: "/chainfolioai-icon.png",
    apple: "/apple-touch-icon.png",
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "ChainFolioAI",
    title: SITE_TITLE,
    description: SITE_DESC,
    locale: "pt_PT",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <ThemeProvider>
          <LanguageProvider>
            {children}
            <FloatingChat />
            <ErrorMonitor />
          </LanguageProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
