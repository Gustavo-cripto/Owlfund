// Dispensar uma inscrição pendente no beta, partilhado entre a rota do painel e
// o webhook do Telegram — a mesma razão por que o grant.ts existe: os dois sítios
// fazem a mesma coisa e não podem divergir.
//
// O QUE NÃO FAZ: não apaga contas. Só marca o PEDIDO de beta como tratado, para
// sair da lista de pendentes do /admin/beta. Quem já criou conta no site continua
// com ela, no plano gratuito — apagar a conta é outra coisa (/api/account/delete)
// e é a própria pessoa que a pede.
//
// Reversível à mão, se for engano:
//   update beta_signups set status = 'pending' where email = '...';
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type DispensaResult = { ok: boolean; error?: string; email?: string };

export async function dispensarInscricao(emailRaw: string): Promise<DispensaResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email inválido." };

  // O `.eq("status", "pending")` é de propósito: uma inscrição já ativada nunca
  // pode ser dispensada por um toque distraído no botão antigo do Telegram
  // (as mensagens ficam no histórico do chat e os botões continuam clicáveis).
  const { data, error } = await getSupabaseAdmin()
    .from("beta_signups")
    .update({ status: "ignored" })
    .eq("email", email)
    .eq("status", "pending")
    .select("email");

  if (error) return { ok: false, error: "Base de dados indisponível." };
  if (!data || data.length === 0) {
    return { ok: false, error: "Nada a dispensar: esta inscrição já não está pendente." };
  }
  return { ok: true, email };
}
