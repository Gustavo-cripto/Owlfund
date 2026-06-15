"use client";
import { useEffect, useState } from "react";

// Ordered by reliability for browser-side fetching
const IPFS_GATEWAYS = [
  "https://ipfs.fleek.co/ipfs/",
  "https://nftstorage.link/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/",
];

function extractCid(url: string): string | undefined {
  if (url.startsWith("ipfs://")) return url.slice(7);
  const m = url.match(/\/ipfs\/(.+)/);
  return m?.[1];
}

function normalizeUrl(url: string): string {
  if (url.startsWith("ipfs://")) return `${IPFS_GATEWAYS[0]}${url.slice(7)}`;
  if (url.startsWith("/ipfs/")) return `${IPFS_GATEWAYS[0]}${url.slice(6)}`;
  // Rewrite any known slow/blocked gateways to fleek
  if (url.includes("ipfs.io/ipfs/")) return `${IPFS_GATEWAYS[0]}${extractCid(url) ?? ""}`;
  return url;
}

function nextGatewayUrl(src: string): string | null {
  for (let i = 0; i < IPFS_GATEWAYS.length - 1; i++) {
    if (src.startsWith(IPFS_GATEWAYS[i])) {
      return IPFS_GATEWAYS[i + 1] + src.slice(IPFS_GATEWAYS[i].length);
    }
  }
  return null;
}

interface NftImageProps {
  src?: string;
  tokenUri?: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}

export default function NftImage({ src, tokenUri, alt, className, loading }: NftImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src ? normalizeUrl(src) : undefined);
  const [failed, setFailed] = useState(false);

  // If no src, fetch tokenUri metadata client-side
  useEffect(() => {
    if (src || !tokenUri || failed) return;
    let cancelled = false;

    const tryGateways = async () => {
      const cid = extractCid(tokenUri);
      const urls = cid
        ? IPFS_GATEWAYS.map((gw) => `${gw}${cid}`)
        : [normalizeUrl(tokenUri)];

      for (const url of urls) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) continue;
          const meta = (await r.json()) as { image?: string; image_url?: string };
          const raw = meta?.image ?? meta?.image_url;
          if (raw && !cancelled) {
            setCurrentSrc(normalizeUrl(raw));
            return;
          }
        } catch { continue; }
      }
      if (!cancelled) setFailed(true);
    };

    void tryGateways();
    return () => { cancelled = true; };
  }, [src, tokenUri, failed]);

  if (failed || !currentSrc) return null;

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        const next = nextGatewayUrl(currentSrc);
        if (next) {
          setCurrentSrc(next);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
