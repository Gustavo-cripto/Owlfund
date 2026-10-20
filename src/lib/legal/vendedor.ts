// Quem presta o serviço (trabalhador independente, CAE de software online —
// contabilista, 20 out 2026). Os dados vêm da Vercel e só aparecem nas páginas
// legais quando o nome E o NIF estiverem definidos; o dono quer que a
// advogada os veja antes (20 out 2026). Públicos de propósito (NEXT_PUBLIC_):
// a lei obriga a identificar quem vende e quem trata os dados.
const v = (k: string) => (process.env[k] ?? "").trim();

export const VENDEDOR = {
  nome: v("NEXT_PUBLIC_VENDEDOR_NOME"),
  nif: v("NEXT_PUBLIC_VENDEDOR_NIF"),
  morada: v("NEXT_PUBLIC_VENDEDOR_MORADA"),
  pais: v("NEXT_PUBLIC_VENDEDOR_PAIS") || "Portugal",
  email: "suporte@chainfolioai.com",
};

export const vendedorDefinido = () => Boolean(VENDEDOR.nome && VENDEDOR.nif);

/** Pagamentos abertos: é a partir daí que os preços dizem "IVA incluído" e os Termos falam de faturas. */
export const pagamentosAbertos = () => process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
