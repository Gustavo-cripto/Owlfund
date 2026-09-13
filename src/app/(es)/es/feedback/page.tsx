import type { Metadata } from "next";
import Feedback from "@/components/pages/Feedback";
import { pageMetadata } from "@/lib/i18n/pageMeta";

export const metadata: Metadata = { ...pageMetadata("feedback", "es"), robots: { index: false, follow: false } };

export default function Page() {
  return <Feedback />;
}
