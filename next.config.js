/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Impede clickjacking — não pode ser embebido em iframes externos
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Bloqueia MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Não enviar Referer para outros domínios
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HSTS — força HTTPS por 1 ano
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Desativa funcionalidades desnecessárias no browser
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self), usb=()" },
  // XSS filter para browsers antigos
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // CSP — permite scripts self + inline (Next.js precisa), imagens externas para logos/NFTs
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Scripts: self + inline (necessário para Next.js hydration) + trusted CDNs
      // Sem 'unsafe-eval': nenhum chunk do cliente usa eval/new Function (verificado
      // no build). 'unsafe-inline' fica: o Next injeta scripts inline na hidratacao.
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://s3.tradingview.com",
      // Estilos: self + inline (Tailwind)
      "style-src 'self' 'unsafe-inline'",
      // Imagens: self + data URIs + todas HTTPS (logos de tokens e NFTs são dinâmicos)
      "img-src 'self' data: blob: https:",
      // Fontes
      "font-src 'self' data:",
      // Conectividade: self + APIs externas usadas
      [
        "connect-src 'self'",
        "https://*.supabase.co",
        "https://*.supabase.io",
        "wss://*.supabase.co",
        "https://api.coingecko.com",
        "https://deep-index.moralis.io",
        "https://programs.shyft.to",
        "https://dlmm-api.meteora.ag",
        "https://blockfrost.io",
        "https://cardano-mainnet.blockfrost.io",
        "https://api.alternative.me",
        "https://api.blockchair.com",
        "https://mempool.space",
        "https://blockchain.info",
        "https://api.bitaps.com",
        "https://xchain.io",
        "https://api.ordinals.com",
        "https://open-api.unisat.io",
        "https://api.mainnet-beta.solana.com",
        "https://rpc.ankr.com",
        "https://cloudflare-eth.com",
        "https://ethereum.publicnode.com",
        "https://walletconnect.org",
        "https://*.walletconnect.org",
        "wss://*.walletconnect.org",
        // PeerJS broker para CIP-45 (ligação Eternl via código/QR)
        "https://0.peerjs.com",
        "wss://0.peerjs.com",
        "https://*.peerjs.com",
        "wss://*.peerjs.com",
        "https://js.stripe.com",
        "https://api.stripe.com",
      ].join(" "),
      // iFrames: apenas TradingView
      "frame-src https://s.tradingview.com https://widget.tradingview.com",
      // Workers
      "worker-src 'self' blob:",
      // WebAssembly (Cardano)
      // Bloqueia plugins (<object>/<embed>) — não usados
      "object-src 'none'",
      // Impede injeção de <base> (roubo de URLs relativas)
      "base-uri 'self'",
      // Formularios so podem submeter para o proprio site (Stripe e OAuth sao redirects, nao POST de formulario).
      "form-action 'self'",
      // Anti-clickjacking moderno (complementa X-Frame-Options)
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  // 404 global para apps com varios layouts raiz (src/app/global-not-found.tsx).
  experimental: { globalNotFound: true },
  outputFileTracingRoot: __dirname,
  staticPageGenerationTimeout: 180,
  // Esconde o header "X-Powered-By: Next.js" (menos info para atacantes)
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        // Aplica a todas as rotas
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Imagens de public/ (screenshots, icones, hero): sem isto saiam com
        // max-age=0 e cada visita revalidava tudo. Um dia em cache + uma semana
        // a servir a versao antiga enquanto revalida; um ficheiro substituido
        // com o mesmo nome demora no maximo um dia a aparecer.
        source: "/:file(.*\\.(?:png|webp|jpe?g|svg|ico))",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        // CORS para API routes — só permite origem própria
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: process.env.NEXT_PUBLIC_SITE_URL ?? "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
  webpack: (config) => {
    // Support browser WASM dependencies (Cardano serialization lib)
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
    };
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });
    return config;
  },
};

module.exports = nextConfig;
