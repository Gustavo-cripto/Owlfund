import type { Metadata } from "next";

import { SITE_URL, socialMeta } from "@/lib/seo/site";

// A página é um client component e não pode exportar metadata; este layout dá-lhe
// título e descrição próprios (o template do layout raiz junta "· ChainFolioAI").
const title = "Termos e Condições";
// 120-155 caracteres a dizer o que a pagina cobre: com 53 o Google ignorava-a
// e escrevia o snippet dele.
const description = "Termos de utilização do ChainFolioAI: planos Free, Pro e Premium, pagamentos por cartão ou cripto, API e MCP, só-leitura sem custódia e responsabilidade.";

export const metadata: Metadata = {
  // Era a unica pagina publica sem canonical. Sem ele, o Google pode tratar
  // variantes com query string (?src=reddit, por exemplo) como paginas
  // diferentes e dividir o valor entre elas.
  alternates: { canonical: "/termos" },
  title,
  description,
  // Sem openGraph proprio a pagina herdava o cartao E o og:url da homepage:
  // partilhar /termos contava para a raiz.
  ...socialMeta({ title, description, url: `${SITE_URL}/termos`, type: "website", locale: "pt_PT", lang: "pt" }),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
