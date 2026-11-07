// Sessão da conta ChainFolioAI (mesma conta do site). Persistente entre
// arranques (AsyncStorage no nativo, localStorage no web).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  /** true enquanto restauramos a sessão gravada (arranque). */
  isLoading: boolean;
  /** A palavra-passe passou, mas a conta tem 2FA: falta o código da app autenticadora. */
  precisaCodigo: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  confirmarCodigo: (codigo: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isLoading: true,
  precisaCodigo: false,
  signIn: async () => ({ error: 'Auth não inicializada' }),
  confirmarCodigo: async () => ({ error: 'Auth não inicializada' }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [precisaCodigo, setPrecisaCodigo] = useState(false);

  useEffect(() => {
    let mounted = true;

    // O servidor recusa a sessão só com palavra-passe de uma conta com 2FA, por isso
    // só conta como sessão depois do código.
    const aplicar = async (next: Session | null) => {
      let falta = false;
      if (next) {
        try {
          const { data } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
          falta = data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2';
        } catch {
          // Sem resposta, segue: o servidor decide e a app mostra o erro dele.
        }
      }
      if (!mounted) return;
      setPrecisaCodigo(falta);
      setSession(falta ? null : next);
    };

    getSupabase().auth
      .getSession()
      .then(async ({ data }) => {
        await aplicar(data.session ?? null);
        if (mounted) setIsLoading(false);
      })
      .catch(() => {
        if (mounted) setIsLoading(false);
      });

    const { data: sub } = getSupabase().auth.onAuthStateChange((_event, next) => {
      // Fora do callback: chamar o Supabase lá dentro pode bloquear a biblioteca.
      setTimeout(() => void aplicar(next ?? null), 0);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      precisaCodigo,
      signIn: async (email, password) => {
        const { error } = await getSupabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        return { error: error ? traduzErro(error.message) : null };
      },
      confirmarCodigo: async (codigo) => {
        try {
          const { data: fatores, error: errFatores } = await getSupabase().auth.mfa.listFactors();
          const fator = fatores?.totp?.[0];
          if (errFatores || !fator) return { error: 'Não foi possível ler o 2FA desta conta. Tenta no site.' };
          const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo.trim() });
          return { error: error ? 'Código errado ou expirado.' : null };
        } catch {
          return { error: 'Sem ligação. Tenta novamente.' };
        }
      },
      signOut: async () => {
        try {
          await getSupabase().auth.signOut();
        } catch {
          // mesmo offline, limpa a sessão local
        }
        setSession(null);
        setPrecisaCodigo(false);
      },
    }),
    [session, isLoading, precisaCodigo]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email ou password errados.';
  if (m.includes('email not confirmed')) return 'Email ainda não confirmado — vê a tua caixa de correio.';
  if (m.includes('network')) return 'Sem ligação. Tenta novamente.';
  return msg;
}
