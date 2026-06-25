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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://s3.tradingview.com",
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
        "https://js.stripe.com",
        "https://api.stripe.com",
      ].join(" "),
      // iFrames: apenas TradingView
      "frame-src https://s.tradingview.com https://widget.tradingview.com",
      // Workers
      "worker-src 'self' blob:",
      // WebAssembly (Cardano)
      "wasm-src 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  outputFileTracingRoot: __dirname,
  staticPageGenerationTimeout: 180,
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
