import TaxGuideIndex from "@/components/guides/TaxGuideIndex";
import { indexMetadata } from "@/lib/tax/guideMeta";

export const metadata = indexMetadata("pt");

export default function Page() {
  return <TaxGuideIndex lang="pt" />;
}
