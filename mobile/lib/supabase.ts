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

const SUPABASE_URL = 'https://maqirdzclnsfytghgufa.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcWlyZHpjbG5zZnl0Z2hndWZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjQyMTIsImV4cCI6MjA5NTkwMDIxMn0.89ZOwfR9mSMwcwoZfWUpnEgSB6b9kp8BFQ3abEjKduc';

export const SITE_URL = 'https://chainfolioai.com';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
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
