import type { Metadata } from "next";
import VerSaldoPage from "@/components/tools/VerSaldoPage";
import { saldoMetadata } from "@/lib/tools/saldo";

export const metadata: Metadata = saldoMetadata("fr", "sol");

export default function Page() {
  return <VerSaldoPage lang="fr" rede="sol" />;
}
