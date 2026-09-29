import type { Metadata } from "next";
import VerSaldoPage from "@/components/tools/VerSaldoPage";
import { saldoMetadata } from "@/lib/tools/saldo";

export const metadata: Metadata = saldoMetadata("es", "sol");

export default function Page() {
  return <VerSaldoPage lang="es" rede="sol" />;
}
