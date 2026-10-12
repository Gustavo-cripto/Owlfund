import type { Metadata } from "next";
import Privacy from "@/components/pages/Privacy";
import { pageMetadata } from "@/lib/i18n/pageMeta";

export const metadata: Metadata = pageMetadata("privacy", "es");

export default function Page() {
  return <Privacy />;
}
