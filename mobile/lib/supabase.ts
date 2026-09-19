// Cliente Supabase da app — MESMO projeto do site (chainfolioai.com), por isso
// o login é a mesma conta. A anon key é pública por natureza (vai em todos os
// browsers que abrem o site); a segurança vem do RLS + validação server-side.
//
// NOTA: inicialização LAZY — criar o cliente no import rebenta no render
// estático do expo-router (Node 20 sem WebSocket para o Realtime). No runtime
// (browser/dispositivo) há sempre WebSocket, e o SSR nunca chama getSupabase().
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// De variaveis de ambiente, como no site. A chave continua a ir para dentro do
// pacote publicado — e publicavel por natureza, e a seguranca vem do RLS — mas
// deixa de haver um literal com ar de segredo no repositorio, e trocar de
// projeto (ou rodar a chave) passa a ser mudar o .env em vez de editar codigo.
// O Metro substitui EXPO_PUBLIC_* no pacote, por isso nao e preciso mais nada.
// Ver mobile/.env.example.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const SITE_URL = 'https://chainfolioai.com';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    // Aqui dentro, nao no topo do modulo: o render estatico do expo-router
    // importa este ficheiro sem nunca chamar esta funcao.
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Faltam EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY. Copia mobile/.env.example para mobile/.env.',
      );
    }
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // No web (expo web) o storage por defeito (localStorage) serve; no
        // nativo usamos AsyncStorage para a sessão sobreviver a reinícios.
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
