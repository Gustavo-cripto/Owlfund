// Vigia dos crons (auditoria 6 nov 2026, MEL1-2 e FUN2-8). Metade dos crons podia
// falhar a responder 200, sem aviso a ninguém, e só os snapshots davam por um cron
// que nem correu. Aqui fica a regra única, sem dependências, para se poder testar:
//   - 2xx: correu bem e fica registado;
//   - 5xx ou exceção: fica registado como falha e avisa no Telegram, no máximo uma
//     vez por dia e por cron (a whale-alerts corre de hora a hora);
//   - o resto (401, 429): não correu, por isso não conta nem para um lado nem para o outro.
// Quem decide o que é uma falha é cada rota, pelo estado que devolve: um erro de um
// só utilizador (chave de exchange revogada, webhook dele em baixo) não é falha do cron.

export type DepsVigia = {
  registar: (nome: string, ok: boolean, detalhe: string | null) => Promise<void>;
  podeAvisar: (nome: string) => Promise<boolean>;
  avisar: (nome: string, detalhe: string) => Promise<unknown>;
};

/** `avisa: false` nos crons que já têm o seu próprio aviso; uma exceção avisa na mesma. */
export type OpcoesVigia = { avisa?: boolean };

const textoDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function detalheDa(res: Response): Promise<string> {
  const corpo = (await res.clone().json().catch(() => null)) as { aviso?: unknown; error?: unknown } | null;
  const texto = corpo?.aviso ?? corpo?.error;
  return String(typeof texto === "string" && texto ? texto : `HTTP ${res.status}`).slice(0, 300);
}

export function criarVigia(deps: DepsVigia) {
  return <A extends unknown[]>(nome: string, handler: (...args: A) => Promise<Response>, opcoes: OpcoesVigia = {}) =>
    async (...args: A): Promise<Response> => {
      let res: Response;
      let excecao = false;
      try {
        res = await handler(...args);
      } catch (e) {
        console.error(`[cron/${nome}]`, textoDe(e));
        excecao = true;
        res = Response.json({ error: textoDe(e).slice(0, 300) }, { status: 500 });
      }

      if (res.status >= 200 && res.status < 300) {
        await deps.registar(nome, true, null).catch(() => undefined);
      } else if (res.status >= 500) {
        const detalhe = await detalheDa(res);
        await deps.registar(nome, false, detalhe).catch(() => undefined);
        if (excecao || opcoes.avisa !== false) {
          // Um cron nunca falha por causa do aviso. Sem contador, avisa: é precisamente
          // quando a base de dados está em baixo que o aviso faz mais falta.
          const pode = await deps.podeAvisar(nome).catch(() => true);
          if (pode) await deps.avisar(nome, detalhe).catch(() => undefined);
        }
      }
      return res;
    };
}

const HORA_MS = 3_600_000;

/**
 * Idade máxima da última execução correta, por cron. Tem de bater certo com o
 * vercel.json (há um teste a garanti-lo), com folga para duas passagens falhadas
 * nos crons frequentes e para os atrasos normais nos diários.
 */
export const IDADE_MAXIMA_MS: Record<string, number> = {
  "snapshot": 26 * HORA_MS,
  "news-briefing": 26 * HORA_MS,
  "crypto-expiry": 26 * HORA_MS,
  "beta-expiry": 26 * HORA_MS,
  "whale-alerts": 3 * HORA_MS,
  "cleanup": 26 * HORA_MS,
  "telegram-health": 26 * HORA_MS,
  "backup": 26 * HORA_MS,
  "cex-refresh": 5 * HORA_MS,
  "resumo-semanal": 8 * 24 * HORA_MS,
  "bots-watch": 2 * HORA_MS,
};

export type LinhaCron = { cron: string; ultimo_ok_em: string | null; criado_em: string | null };

/**
 * Os crons cuja última execução correta é demasiado antiga. Um cron que nunca
 * registou nada conta a partir do início do próprio registo (a linha mais antiga),
 * para quem acabou de ligar a tabela não ver tudo "atrasado" no primeiro dia.
 */
export function cronsAtrasados(linhas: LinhaCron[], agora: number): string[] {
  const porCron = new Map(linhas.map((l) => [l.cron, l]));
  const inicios = linhas.map((l) => Date.parse(l.criado_em ?? "")).filter(Number.isFinite);
  const inicio = inicios.length ? Math.min(...inicios) : agora;
  return Object.entries(IDADE_MAXIMA_MS)
    .filter(([cron, maximo]) => {
      const desde = Date.parse(porCron.get(cron)?.ultimo_ok_em ?? "");
      return agora - (Number.isFinite(desde) ? desde : inicio) > maximo;
    })
    .map(([cron]) => cron);
}

export type ContagemCex = { contas: number; ok: number; erroExchange: number; erroSistema: number };

/**
 * A cex-refresh só falha por razões do sistema: cofre que não decifra (segredo mudado)
 * ou gravação recusada. Uma chave revogada dá erro em todas as passagens e fica
 * visível à própria pessoa; com poucas contas, "nada correu bem" seria só isso e um
 * aviso de duas em duas horas. Por isso o "tudo falhou" só conta a partir de 3 contas.
 */
export function falhaDaCexRefresh(c: ContagemCex): string | null {
  if (c.erroSistema > 0) return `${c.erroSistema} de ${c.contas} conta(s) com erro no cofre ou na gravação`;
  if (c.contas >= 3 && c.ok === 0) return `todas as ${c.contas} contas falharam nas exchanges`;
  return null;
}
