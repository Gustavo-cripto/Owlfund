// "Querias dizer …@gmail.com?" no registo. Com a confirmação de email desligada
// no Supabase, um domínio mal escrito (gmial.com, hotmai.com) cria uma conta que
// nunca recebe nada — nem as boas-vindas nem a recuperação da palavra-passe — e
// nada avisava (bot social, 14 out 2026). Só sugere; nunca bloqueia nem corrige
// sozinho. Preferido a um segundo campo de email: menos uma barreira no registo.

// Domínios comuns (e alguns parecidos que EXISTEM, para não os "corrigir").
const DOMINIOS = [
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "hotmail.es", "hotmail.co.uk", "hotmail.it",
  "outlook.com", "outlook.pt", "outlook.fr", "outlook.es", "live.com", "live.fr", "msn.com",
  "yahoo.com", "yahoo.fr", "yahoo.es", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "pm.me", "sapo.pt", "gmx.com", "gmx.de", "gmx.net", "web.de", "aol.com",
  "orange.fr", "free.fr", "laposte.net", "wanadoo.fr", "sfr.fr", "mail.com", "zoho.com", "tutanota.com", "uol.com.br", "bol.com.br",
];
const CONHECIDOS = new Set(DOMINIOS);

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // troca de duas letras seguidas (gmial) conta como um só erro
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** O email corrigido a sugerir, ou null se o domínio parece certo (ou é desconhecido e longe dos comuns). */
export function sugerirEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return null;
  const local = e.slice(0, at);
  const dominio = e.slice(at + 1);
  if (CONHECIDOS.has(dominio)) return null;
  let melhor: string | null = null;
  let melhorD = 3;
  for (const d of DOMINIOS) {
    // Só os domínios curtos admitem 2 erros; nos outros, 1 basta para errar pouco.
    const limite = d.length >= 9 ? 2 : 1;
    const dist = distancia(dominio, d);
    if (dist <= limite && dist < melhorD) { melhor = d; melhorD = dist; }
  }
  return melhor ? `${local}@${melhor}` : null;
}
