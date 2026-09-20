import { API_ENDPOINTS, MCP_TOOLS } from "@/lib/api/catalog";

import DevelopersContent from "./DevelopersContent";

// Os números vêm do catálogo, que é a mesma fonte que serve o índice público
// /api/v1 e a própria página. Estavam escritos à mão e diziam "12 endpoints,
// 11 ferramentas MCP" quando já eram mais do dobro — e esta descrição é
// exatamente o texto que os motores de busca e os robôs de IA mostram como
// resumo da página. Escrito à mão, envelhece sem ninguém dar por isso.
export const metadata = {
  // Sem sufixo da marca: o template do layout raiz já junta "· ChainFolioAI".
  title: "API & MCP — Documentação",
  description: `Documentação da API REST e do servidor MCP do ChainFolioAI: autenticação, ${API_ENDPOINTS.length} endpoints, ${MCP_TOOLS.length} ferramentas MCP, erros e limites.`,
  alternates: { canonical: "/developers" },
};

export default function DevelopersPage() {
  return <DevelopersContent />;
}
