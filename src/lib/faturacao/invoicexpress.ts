// Fatura-recibo automática no InvoiceXpress (programa certificado pela AT), por
// cada pagamento: Stripe (cada mensalidade/anuidade, evento invoice.paid) e cripto
// (valor em euros à cotação do momento). Decisão do dono com o contabilista,
// 20 out 2026: até 10 000 €/ano fatura-se com IVA de Portugal; recibo por cada
// pagamento; cripto faturada em euros.
//
// DESLIGADO enquanto faltar INVOICEXPRESS_ACCOUNT ou INVOICEXPRESS_API_KEY
// (Vercel). Opcionais: INVOICEXPRESS_SEQUENCE_ID (a série do ChainFolioAI),
// INVOICEXPRESS_IVA_NOME (nome do imposto na conta, por omissão "IVA23") e
// INVOICEXPRESS_IVA_TAXA (por omissão 23). FATURACAO_AUTOMATICA=false desliga
// mesmo com as chaves.
//
// Por confirmar no 1.º teste com a conta (a documentação é ambígua): a chave
// raiz do corpo ("invoice") e se o unit_price é sem IVA (assumido: sem IVA,
// como é o habitual na conta). O valor cobrado ao cliente já inclui o IVA.

const env = (k: string) => (process.env[k] ?? "").trim();

export function faturacaoAtiva(): boolean {
  return Boolean(env("INVOICEXPRESS_ACCOUNT") && env("INVOICEXPRESS_API_KEY")) && env("FATURACAO_AUTOMATICA") !== "false";
}

export type DadosFatura = {
  /** Identificador único do pagamento (ex.: id da fatura Stripe, id do evento Helio): nunca duas faturas para o mesmo. */
  idUnico: string;
  /** Código do cliente no InvoiceXpress (estável por cliente: id do cliente Stripe ou da conta). */
  codigoCliente: string;
  nome: string;
  email: string;
  nif?: string | null;
  /** Código ISO do país, se se souber. */
  pais?: string | null;
  /** O que se vendeu ("ChainFolioAI Premium — mensal"). */
  descricao: string;
  /** Total pago pelo cliente, em euros, COM IVA. */
  totalEur: number;
  data?: Date;
  /** Nota impressa na fatura (ex.: "Pago em 45,9 USDC à cotação de 0,8712 €"). */
  observacoes?: string;
};

const dd = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** O corpo do pedido de criação (puro, para testar). */
export function construirFaturaRecibo(f: DadosFatura, opts: { taxa?: number; nomeImposto?: string; serie?: string } = {}) {
  const taxa = opts.taxa ?? (Number(env("INVOICEXPRESS_IVA_TAXA")) || 23);
  const nomeImposto = opts.nomeImposto ?? (env("INVOICEXPRESS_IVA_NOME") || "IVA23");
  const serie = opts.serie ?? env("INVOICEXPRESS_SEQUENCE_ID");
  const data = f.data ?? new Date();
  // Preço unitário SEM IVA, com 4 casas: 14,99 → 12,1870 (× 1,23 = 14,99).
  const semIva = Math.round((f.totalEur / (1 + taxa / 100)) * 10_000) / 10_000;
  const nif = (f.nif ?? "").replace(/\s+/g, "").toUpperCase();
  return {
    invoice: {
      date: dd(data),
      due_date: dd(data),
      reference: f.idUnico.slice(0, 50),
      ...(f.observacoes ? { observations: f.observacoes } : {}),
      ...(serie ? { sequence_id: serie } : {}),
      client: {
        name: f.nome || f.email,
        code: f.codigoCliente.slice(0, 50),
        email: f.email,
        ...(nif ? { fiscal_id: nif } : {}),
        ...(f.pais ? { country: f.pais } : {}),
      },
      items: [{ name: "ChainFolioAI", description: f.descricao, unit_price: semIva, quantity: 1, tax: { name: nomeImposto } }],
    },
    proprietary_uid: f.idUnico.slice(0, 100),
  };
}

type Resultado = { ok: true; id: number; numero?: string } | { ok: false; erro: string; duplicado?: boolean };

async function pedido(metodo: "POST" | "PUT", caminho: string, corpo: unknown): Promise<Response> {
  const url = `https://${env("INVOICEXPRESS_ACCOUNT")}.app.invoicexpress.com/${caminho}?api_key=${encodeURIComponent(env("INVOICEXPRESS_API_KEY"))}`;
  return fetch(url, {
    method: metodo,
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(20_000),
  });
}

/**
 * Cria a fatura-recibo, finaliza-a (passa a ter número e vai para a AT) e envia-a
 * por email ao cliente. Nunca lança. A chave da API vai na query (é como o
 * InvoiceXpress a pede): nunca registar o URL.
 */
export async function emitirFaturaRecibo(f: DadosFatura): Promise<Resultado> {
  if (!faturacaoAtiva()) return { ok: false, erro: "faturação automática desligada" };
  if (!(f.totalEur > 0)) return { ok: false, erro: "valor zero: sem fatura" };
  try {
    const criar = await pedido("POST", "invoice_receipts.json", construirFaturaRecibo(f));
    if (criar.status === 409) return { ok: false, erro: "já em criação (pedido repetido)", duplicado: true };
    if (!criar.ok) return { ok: false, erro: `criar: HTTP ${criar.status} ${(await criar.text().catch(() => "")).slice(0, 200)}` };
    const j = (await criar.json()) as { invoice?: { id?: number }; invoice_receipt?: { id?: number } };
    const id = j.invoice?.id ?? j.invoice_receipt?.id;
    if (!id) return { ok: false, erro: "criar: resposta sem id" };
    const fin = await pedido("PUT", `invoice_receipts/${id}/change-state.json`, { invoice: { state: "finalized" } });
    if (!fin.ok) return { ok: false, erro: `finalizar ${id}: HTTP ${fin.status}` };
    const fj = (await fin.json().catch(() => ({}))) as { invoice?: { inverted_sequence_number?: string; sequence_number?: string } };
    const email = await pedido("PUT", `invoice_receipts/${id}/email-document.json`, { message: { client: { email: f.email, save: "1" }, subject: "A tua fatura-recibo ChainFolioAI", body: "Obrigado! Segue em anexo a fatura-recibo do teu pagamento ao ChainFolioAI." } });
    if (!email.ok) console.error(`[faturacao] fatura ${id} emitida mas o email falhou: HTTP ${email.status}`);
    return { ok: true, id, numero: fj.invoice?.inverted_sequence_number ?? fj.invoice?.sequence_number };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
