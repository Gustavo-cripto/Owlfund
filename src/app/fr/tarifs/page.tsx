import type { Metadata } from "next";
import Pricing from "@/components/pages/Pricing";
import { pageMetadata } from "@/lib/i18n/pageMeta";

export const metadata: Metadata = pageMetadata("pricing", "fr");

export default function Page() {
  return <Pricing />;
}
