import type { Metadata } from "next";
import Status from "@/components/pages/Status";
import { pageMetadata } from "@/lib/i18n/pageMeta";

export const metadata: Metadata = pageMetadata("status", "en");

export default function Page() {
  return <Status />;
}
