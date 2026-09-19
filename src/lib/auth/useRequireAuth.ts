"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Exige sessão para ver a página.
 *
 * Havia aqui dois defeitos que davam na mesma coisa: a pessoa perder o que
 * estava a fazer sem culpa nenhuma.
 *
 *  1. `getUser()` devolve `user: null` TAMBÉM quando não consegue falar com o
 *     Supabase — rede em baixo, wi-fi a mudar, servidor a responder mal. O
 *     código olhava só para o `user`, via null, e mandava a pessoa para o
 *     login com a sessão válida e tudo. Num telemóvel, com a rede a oscilar,
 *     isto acontece a sério.
 *  2. Nada apanhava uma exceção. O `getUser()` pode rejeitar (a biblioteca
 *     adquire o bloqueio entre separadores fora do seu próprio try), e nesse
 *     caso `setIsLoading(false)` nunca corria: a página ficava em esqueleto
 *     para sempre, sem erro e sem saída.
 *
 * Agora: uma falta de sessão genuína continua a mandar para o login de
 * imediato; uma falha de rede é tentada outra vez antes de desistir.
 */

const TENTATIVAS = 3;
const ESPERA_MS = 1200;

/** É mesmo "não tens sessão", ou foi a rede que falhou? */
function semSessao(erro: unknown): boolean {
  if (!erro) return true;                       // sem erro e sem utilizador = sessão nenhuma
  const e = erro as { status?: number; code?: string; name?: string };
  if (e.status === 401 || e.status === 403) return true;
  if (e.code === "session_not_found" || e.code === "user_not_found") return true;
  if (e.name === "AuthSessionMissingError") return true;
  return false;                                  // tudo o resto: tratar como falha temporária
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useRequireAuth(redirectTo: string = "/login") {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
        let user: { id: string } | null = null;
        let falhou = false;

        try {
          const { data, error } = await supabase.auth.getUser();
          user = data?.user ?? null;
          if (!user) {
            if (semSessao(error)) { if (isMounted) window.location.href = redirectTo; return; }
            falhou = true;
            console.error(`[auth] sessão não confirmada (tentativa ${tentativa}/${TENTATIVAS}):`, error?.message);
          }
        } catch (e) {
          falhou = true;
          console.error(`[auth] erro ao verificar a sessão (tentativa ${tentativa}/${TENTATIVAS}):`, e instanceof Error ? e.message : e);
        }

        if (!isMounted) return;

        if (falhou) {
          // Só desiste depois de tentar mesmo. Antes bastava um soluço da rede.
          if (tentativa === TENTATIVAS) { window.location.href = redirectTo; return; }
          await dorme(ESPERA_MS * tentativa);
          if (!isMounted) return;
          continue;
        }

        // Se a conta tem 2FA ativo mas a sessão ainda é aal1, exige o desafio no
        // login. Uma falha AQUI não pode expulsar: quem já tem sessão válida
        // passa, e cada rota do servidor volta a verificar por sua conta.
        try {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (!isMounted) return;
          if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1") {
            window.location.href = "/login";
            return;
          }
        } catch (e) {
          console.error("[auth] nível de autenticação não confirmado:", e instanceof Error ? e.message : e);
        }

        if (!isMounted) return;
        setUserId(user!.id);
        setIsLoading(false);
        return;
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [redirectTo, supabase]);

  return { isLoading, userId };
}
