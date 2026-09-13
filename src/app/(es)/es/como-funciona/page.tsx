import type { Metadata } from "next";
import HowItWorks from "@/components/pages/HowItWorks";
import { pageMetadata } from "@/lib/i18n/pageMeta";

export const metadata: Metadata = pageMetadata("howItWorks", "es");

export default function Page() {
  return <HowItWorks />;
}
