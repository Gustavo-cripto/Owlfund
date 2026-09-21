import AppShell from "@/components/AppShell";
import PageSkeleton from "@/components/PageSkeleton";

// Mostrado pelo Next enquanto o código desta página chega ao browser. Sem isto,
// clicar no menu deixava o ecrã parado uns segundos, sem sinal nenhum — o dono
// não distinguia "lento" de "partido". A silhueta vai dentro do AppShell para a
// barra lateral não desaparecer entretanto.
export default function Loading() {
  return <AppShell><PageSkeleton variant="table" /></AppShell>;
}
