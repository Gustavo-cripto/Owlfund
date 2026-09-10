// Verificação de domínio do Bluesky (AT Protocol).
//
// Serve o DID da conta @ChainFolioAi em texto simples. Com este ficheiro no
// ar, o Bluesky aceita mudar o handle de `chainfolioai.bsky.social` para
// `chainfolioai.com` — o perfil passa a mostrar o domínio, o que prova que a
// conta é mesmo de quem controla o site. Alternativa (não usada): registo DNS
// TXT em `_atproto.chainfolioai.com`.
//
// O DID é público e permanente — identifica a conta mesmo que o handle mude.
// Foi confirmado em 2026-09-10 na API pública do Bluesky.

export const runtime = "nodejs";
export const dynamic = "force-static";

const DID = "did:plc:7q5ua3mavfbahnacoe2byx7g";

export function GET() {
  // Tem de ser text/plain e SÓ o DID, sem espaços nem quebras extra.
  return new Response(DID, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
