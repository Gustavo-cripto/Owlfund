// Sessão da conta ChainFolioAI (mesma conta do site). Persistente entre
// arranques (AsyncStorage no nativo, localStorage no web).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  /** true enquanto restauramos a sessão gravada (arranque). */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isLoading: true,
  signIn: async () => ({ error: 'Auth não inicializada' }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getSupabase().auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        if (mounted) setIsLoading(false);
      });

    const { data: sub } = getSupabase().auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
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
      signIn: async (email, password) => {
        const { error } = await getSupabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        return { error: error ? traduzErro(error.message) : null };
      },
      signOut: async () => {
        try {
          await getSupabase().auth.signOut();
        } catch {
          // mesmo offline, limpa a sessão local
        }
        setSession(null);
      },
    }),
    [session, isLoading]
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
