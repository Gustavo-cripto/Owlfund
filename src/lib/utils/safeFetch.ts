// Guarda contra SSRF: o que o servidor pode ir buscar quando o endereço veio
// de fora.
//
// Vivia dentro de src/app/api/webhooks/route.ts e só protegia o registo de
// webhooks. Mas há outro sítio que faz pedidos a endereços escolhidos por
// terceiros: os metadados de NFT. O `token_uri` de um NFT é escrito por quem
// cunhou o token — não por nós nem pelo utilizador — e o servidor ia lá buscar
// o conteúdo sem olhar ao protocolo nem ao destino. Bastava cunhar um NFT
// barato com `token_uri` a apontar para o serviço de metadados da nuvem para
// pôr o nosso servidor a fazer esse pedido por dentro da rede.
//
// Isto é defesa em profundidade, não garantia: não resolvemos DNS, por isso um
// nome que aponte para um endereço interno passa. Fecha o caso literal, que é
// o que se explora sem esforço.

/** IPv4 privado, reservado ou de metadados de nuvem. Malformado bloqueia. */
export function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;               // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true;      // RFC 1918
  if (a === 192 && b === 168) return true;               // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true;     // CGNAT
  return false;
}

export function isPrivateHost(host: string): boolean {
  if (host.includes(":")) {                              // IPv6 literal
    const h = host.replace(/^\[|\]$/g, "");
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;  // unique local fc00::/7
    if (/^fe[89ab]/.test(h)) return true;                       // link-local fe80::/10
    const mapped = h.match(/(\d+\.\d+\.\d+\.\d+)$/);            // ::ffff:a.b.c.d
    if (mapped) return isPrivateIpv4(mapped[1]);
    // O parser de URL normaliza ::ffff:169.254.169.254 para ::ffff:a9fe:a9fe,
    // e a forma com pontos deixava de existir antes de chegar aqui: sem isto,
    // o endereco dos metadados da nuvem passava embrulhado em hexadecimal.
    const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
      return isPrivateIpv4([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
    }
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPrivateIpv4(host);
  return false;
}

/** Só https, e nunca para dentro. */
export function isValidHttpsUrl(u: string): boolean {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (isPrivateHost(host)) return false;
  return true;
}

/**
 * Vai buscar um endereço que veio de fora (metadados de NFT, por exemplo).
 *
 * Recusa o que não for https para o exterior, e não segue redirecionamentos:
 * seguir um 302 deitava fora toda a verificação feita ao endereço original.
 * Devolve null em vez de lançar — quem chama trata a ausência como "sem
 * metadados", que é o que já fazia quando o pedido falhava.
 */
export async function fetchExterno(u: string, init?: RequestInit): Promise<Response | null> {
  if (!isValidHttpsUrl(u)) return null;
  try {
    const res = await fetch(u, { ...init, redirect: "manual" });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}
