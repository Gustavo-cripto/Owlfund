import type { Metadata } from "next";

import { API_ENDPOINTS, MCP_TOOLS } from "@/lib/api/catalog";
import { SITE_URL, socialMeta } from "@/lib/seo/site";

import DevelopersContent from "./DevelopersContent";

// Os números vêm do catálogo, que é a mesma fonte que serve o índice público
// /api/v1 e a própria página. Estavam escritos à mão e diziam "12 endpoints,
// 11 ferramentas MCP" quando já eram mais do dobro — e esta descrição é
// exatamente o texto que os motores de busca e os robôs de IA mostram como
// resumo da página. Escrito à mão, envelhece sem ninguém dar por isso.
// Sem sufixo da marca: o template do layout raiz já junta "· ChainFolioAI".
const title = "API & MCP — Documentação";
const description = `Documentação da API REST e do servidor MCP do ChainFolioAI: autenticação, ${API_ENDPOINTS.length} endpoints, ${MCP_TOOLS.length} ferramentas MCP, erros e limites.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/developers" },
  // Sem openGraph proprio a pagina herdava o cartao E o og:url da homepage —
  // e esta e a pagina que se quer por a frente de programadores e diretorios MCP.
  ...socialMeta({ title, description, url: `${SITE_URL}/developers`, type: "website", locale: "pt_PT" }),
};

export default function DevelopersPage() {
  return <DevelopersContent />;
}
