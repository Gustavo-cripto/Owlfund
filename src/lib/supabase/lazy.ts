import type { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase carregado DEPOIS de a pagina pintar.
//
// A biblioteca sao ~55 KB comprimidos e, em quase todo o lado, so serve para
// responder a "ha sessao?" dentro de um useEffect — ou seja, nada disto e
// preciso para desenhar o primeiro ecra. Importada no topo do ficheiro, entrava
// no JS inicial de todas as paginas, incluindo a landing, que e a primeira
// coisa que um visitante descarrega.
//
// Uma so instancia partilhada (a promessa e guardada), para nao haver dois
// clientes a ouvir o mesmo evento de autenticacao.

type Client = ReturnType<typeof createBrowserClient>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let cliente: Promise<Client> | null = null;

/** Devolve o cliente do browser, carregando a biblioteca a primeira vez. */
export function getSupabase(): Promise<Client> {
  if (!cliente) {
    cliente = import("@supabase/ssr").then((m) => m.createBrowserClient(url, anonKey));
  }
  return cliente;
}

/**
 * Corre `fn` com o cliente, sem rebentar se as variaveis nao estiverem
 * configuradas ou a biblioteca nao carregar (rede a cair a meio). Devolve a
 * funcao de limpeza que o `fn` produzir, para o useEffect a poder chamar.
 */
export function comSupabase(fn: (c: Client) => void | (() => void)): () => void {
  let vivo = true;
  let limpar: (() => void) | undefined;
  if (!url || !anonKey) return () => { vivo = false; };
  void getSupabase()
    .then((c) => { if (vivo) limpar = fn(c) ?? undefined; })
    .catch(() => { /* sem sessao conhecida: a UI fica no estado por omissao */ });
  return () => { vivo = false; limpar?.(); };
}
