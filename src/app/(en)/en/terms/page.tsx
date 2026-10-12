import type { Metadata } from "next";
import Terms from "@/components/pages/Terms";
import { pageMetadata } from "@/lib/i18n/pageMeta";

export const metadata: Metadata = pageMetadata("terms", "en");

export default function Page() {
  return <Terms />;
}
