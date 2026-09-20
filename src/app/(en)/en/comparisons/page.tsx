import ComparisonIndex from "@/components/compare/ComparisonIndex";
import { compareIndexMetadata } from "@/lib/compare/compareMeta";

export const metadata = compareIndexMetadata("en");

export default function Page() {
  return <ComparisonIndex lang="en" />;
}
