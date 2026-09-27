import type { Metadata } from "next";

import { SITE_URL, socialMeta } from "@/lib/seo/site";

// A página é um client component e não pode exportar metadata; este layout dá-lhe
// título e descrição próprios (o template do layout raiz junta "· ChainFolioAI").
const title = "Política de Privacidade";
// 120-155 caracteres a dizer o que a pagina cobre: com 57 o Google ignorava-a
// e escrevia o snippet dele.
const description = "Como o ChainFolioAI recolhe, usa e guarda os teus dados: endereços só-leitura, chaves de exchange cifradas, cookies, RGPD, retenção e como apagar a conta.";

export const metadata: Metadata = {
  // Era a unica pagina publica sem canonical. Sem ele, o Google pode tratar
  // variantes com query string (?src=reddit, por exemplo) como paginas
  // diferentes e dividir o valor entre elas.
  alternates: { canonical: "/privacidade" },
  title,
  description,
  // Sem openGraph proprio a pagina herdava o cartao E o og:url da homepage:
  // partilhar /privacidade contava para a raiz.
  ...socialMeta({ title, description, url: `${SITE_URL}/privacidade`, type: "website", locale: "pt_PT", lang: "pt" }),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
