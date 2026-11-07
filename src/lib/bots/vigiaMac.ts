// O site vigia o Mac dos bots (pedido do dono: esteve 39 h desligado sem ninguém
// saber). O vigia do Mac envia um batimento; o cron bots-watch lê o último e decide
// se avisa. Sem dependências, para se poder testar.
import { createHash, timingSafeEqual } from "crypto";

export type Batimento = {
  quando: number;
  mac_boot: number | null;
  bots_idade_s: Record<string, number>;
  vivos: number | null;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const MAX_BOTS = 50;

/** Só guarda os campos conhecidos, com tamanhos limitados: é JSON vindo de fora. */
export function validarBatimento(corpo: unknown): Batimento | null {
  if (!corpo || typeof corpo !== "object") return null;
  const b = corpo as Record<string, unknown>;
  if (!num(b.quando)) return null;
  const idades: Record<string, number> = {};
  if (b.bots_idade_s && typeof b.bots_idade_s === "object") {
    for (const [nome, idade] of Object.entries(b.bots_idade_s).slice(0, MAX_BOTS)) {
      if (num(idade) && nome.length <= 64) idades[nome] = idade;
    }
  }
  return { quando: b.quando, mac_boot: num(b.mac_boot) ? b.mac_boot : null, bots_idade_s: idades, vivos: num(b.vivos) ? b.vivos : null };
}

/** Em tempo constante; os resumos têm sempre o mesmo tamanho, que é o que timingSafeEqual exige. */
export function segredoCerto(recebido: string | null, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const resumo = (t: string) => createHash("sha256").update(t).digest();
  return timingSafeEqual(resumo(recebido), resumo(esperado));
}

export const SEM_SINAL_MS = 60 * 60_000;
export const BOT_PARADO_S = 900;
export const INTERVALO_AVISO_MS = 6 * 3_600_000;

export type EstadoBots =
  | { estado: "ok" }
  | { estado: "sem_sinal"; minutos: number }
  | { estado: "bot_parado"; nomes: string[] };

export function avaliarBots(payload: unknown, recebidoEm: string, agora: number): EstadoBots {
  const idade = agora - Date.parse(recebidoEm);
  if (!Number.isFinite(idade) || idade > SEM_SINAL_MS) {
    return { estado: "sem_sinal", minutos: Number.isFinite(idade) ? Math.floor(idade / 60_000) : 0 };
  }
  const idades = (payload as { bots_idade_s?: Record<string, unknown> } | null)?.bots_idade_s ?? {};
  const nomes = Object.entries(idades).filter(([, s]) => num(s) && s > BOT_PARADO_S).map(([n]) => n).sort();
  return nomes.length ? { estado: "bot_parado", nomes } : { estado: "ok" };
}

export type UltimoAviso = { estado: EstadoBots["estado"]; em: string };

/**
 * No máximo um aviso por 6 h por estado, e um único "voltou" ao recuperar. O último
 * aviso vive numa coluna à parte: no payload, cada batimento apagava-o e o aviso
 * saía de 30 em 30 minutos (a falha da especificação inicial).
 */
export function decidirAviso(atual: EstadoBots, ultimo: UltimoAviso | null, agora: number): { tipo: "problema" | "voltou" } | null {
  if (atual.estado === "ok") return ultimo && ultimo.estado !== "ok" ? { tipo: "voltou" } : null;
  if (!ultimo || ultimo.estado !== atual.estado) return { tipo: "problema" };
  const passou = agora - Date.parse(ultimo.em);
  return !Number.isFinite(passou) || passou >= INTERVALO_AVISO_MS ? { tipo: "problema" } : null;
}

function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  return minutos % 60 ? `${h} h ${minutos % 60} min` : `${h} h`;
}

/** O texto do aviso; `esc` é o tgEsc, passado aqui para este ficheiro continuar sem dependências. */
export function textoDoAviso(atual: EstadoBots, recebidoEm: string, esc: (t: string) => string): string {
  if (atual.estado === "ok") return "✅ Bots do Mac voltaram a dar sinal.";
  if (atual.estado === "bot_parado") return `🟠 Bots do Mac parados há mais de 15 min: ${esc(atual.nomes.join(", "))}`;
  const hora = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" }).format(new Date(recebidoEm));
  return `🔴 Bots do Mac sem sinal há ${duracao(atual.minutos)} (último às ${hora}). Mac desligado? Corte de corrente? (não tem bateria)`;
}
