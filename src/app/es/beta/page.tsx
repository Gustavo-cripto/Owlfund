import type { Metadata } from "next";
import BetaSignup from "@/components/pages/BetaSignup";
import { pageMetadata } from "@/lib/i18n/pageMeta";

export const metadata: Metadata = pageMetadata("beta", "es");

export default function Page() {
  return <BetaSignup />;
}
