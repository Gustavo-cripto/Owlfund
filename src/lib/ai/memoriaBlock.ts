"use client";

// Memória do Block (Gestor IA) por conta: perfil que o utilizador preenche
// (país fiscal, idade, objetivos) e notas que o Block aprendeu na conversa
// (etiquetas <lembrar>). Fica no localStorage da conta e viaja entre aparelhos
// pelo blob de sincronização (NAMESPACED_BASE_KEYS em accounts.ts).

import { ALL_ACCOUNTS_ID, MEMORIA_BLOCK_BASE, getActiveAccountId, gravarSeMudou, readNamespaced } from "@/lib/portfolios/accounts";
import { notaAceitavel } from "@/lib/ai/etiquetasBlock";

export type NotaBlock = { id: string; texto: string; em: number };
export type MemoriaBlock = { paisFiscal?: string; idade?: number; objetivos?: string; notas: NotaBlock[] };

const LIMITE_NOTAS = 20;
const VAZIA: MemoriaBlock = { notas: [] };

export function lerMemoria(): MemoriaBlock {
  if (typeof window === "undefined") return VAZIA;
  const id = getActiveAccountId();
  if (id === ALL_ACCOUNTS_ID) return VAZIA;
  try {
    const j = JSON.parse(readNamespaced(id, MEMORIA_BLOCK_BASE) ?? "null") as Partial<MemoriaBlock> | null;
    if (!j || typeof j !== "object") return VAZIA;
    return {
      paisFiscal: typeof j.paisFiscal === "string" && /^[A-Z]{2}$/.test(j.paisFiscal) ? j.paisFiscal : undefined,
      idade: typeof j.idade === "number" && j.idade > 0 && j.idade < 120 ? j.idade : undefined,
      objetivos: typeof j.objetivos === "string" ? j.objetivos.slice(0, 400) : undefined,
      notas: Array.isArray(j.notas) ? j.notas.filter((n): n is NotaBlock => Boolean(n && typeof n.texto === "string" && typeof n.id === "string")).slice(-LIMITE_NOTAS) : [],
    };
  } catch { return VAZIA; }
}

export function guardarMemoria(m: MemoriaBlock): void {
  const limpa: MemoriaBlock = {
    ...(m.paisFiscal ? { paisFiscal: m.paisFiscal } : {}),
    ...(m.idade ? { idade: m.idade } : {}),
    ...(m.objetivos?.trim() ? { objetivos: m.objetivos.trim().slice(0, 400) } : {}),
    notas: m.notas.slice(-LIMITE_NOTAS),
  };
  gravarSeMudou(MEMORIA_BLOCK_BASE, JSON.stringify(limpa));
}

/** Junta notas novas (sem repetidas, ignorando maiúsculas) e devolve a memória atualizada. */
export function adicionarNotas(textos: string[], em = Date.now()): MemoriaBlock {
  const m = lerMemoria();
  const existentes = new Set(m.notas.map((n) => n.texto.toLowerCase()));
  for (const t of textos) {
    const texto = t.trim();
    if (!notaAceitavel(texto) || existentes.has(texto.toLowerCase())) continue;
    m.notas.push({ id: `${em.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, texto, em });
    existentes.add(texto.toLowerCase());
  }
  m.notas = m.notas.slice(-LIMITE_NOTAS);
  guardarMemoria(m);
  return m;
}

export function removerNota(id: string): MemoriaBlock {
  const m = lerMemoria();
  m.notas = m.notas.filter((n) => n.id !== id);
  guardarMemoria(m);
  return m;
}

/** Secção para o prompt (null sem nada guardado). */
export function textoMemoria(m: MemoriaBlock): string | null {
  const linhas: string[] = [];
  if (m.paisFiscal) linhas.push(`País onde declara impostos: ${m.paisFiscal}`);
  if (m.idade) linhas.push(`Idade: ${m.idade}`);
  if (m.objetivos) linhas.push(`Objetivos (escritos pelo utilizador): ${m.objetivos}`);
  if (m.notas.length) linhas.push("Notas de conversas anteriores:", ...m.notas.map((n) => `  - ${n.texto}`));
  if (!linhas.length) return null;
  return `=== O QUE SEI DO UTILIZADOR (memória do Block; usa sem voltar a perguntar) ===\n${linhas.join("\n")}`;
}
