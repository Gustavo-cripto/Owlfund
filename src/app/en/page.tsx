import type { Metadata } from "next";
import Landing from "@/components/pages/Landing";
import { pageMetadata } from "@/lib/i18n/pageMeta";

export const metadata: Metadata = pageMetadata("home", "en");

export default function Page() {
  return <Landing />;
}
