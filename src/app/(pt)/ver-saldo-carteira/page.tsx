import type { Metadata } from "next";
import VerSaldoPage from "@/components/tools/VerSaldoPage";
import { saldoMetadata } from "@/lib/tools/saldo";

export const metadata: Metadata = saldoMetadata("pt", "todas");

export default function Page() {
  return <VerSaldoPage lang="pt" rede="todas" />;
}
