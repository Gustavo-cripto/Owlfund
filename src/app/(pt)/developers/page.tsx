import DevelopersContent from "./DevelopersContent";

export const metadata = {
  // Sem sufixo da marca: o template do layout raiz já junta "· ChainFolioAI".
  title: "API & MCP — Documentação",
  description: "Documentação da API REST e do servidor MCP do ChainFolioAI: autenticação, 12 endpoints, 11 ferramentas MCP, erros e limites.",
  alternates: { canonical: "/developers" },
};

export default function DevelopersPage() {
  return <DevelopersContent />;
}
