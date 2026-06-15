"use client";
import { useEffect, useState } from "react";

const IPFS_GATEWAYS = [
  "https://nftstorage.link/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/",
];

function nextGatewayUrl(src: string): string | null {
  for (let i = 0; i < IPFS_GATEWAYS.length - 1; i++) {
    if (src.startsWith(IPFS_GATEWAYS[i])) {
      return IPFS_GATEWAYS[i + 1] + src.slice(IPFS_GATEWAYS[i].length);
    }
  }
  return null;
}

function normalizeUrl(url: string): string {
  if (url.startsWith("ipfs://")) return `${IPFS_GATEWAYS[0]}${url.slice(7)}`;
  if (url.startsWith("/ipfs/")) return `${IPFS_GATEWAYS[0]}${url.slice(6)}`;
  return url;
}

interface NftImageProps {
  src?: string;
  tokenUri?: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}

export default function NftImage({ src, tokenUri, alt, className, loading }: NftImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src);
  const [failed, setFailed] = useState(false);

  // If no src but tokenUri provided, fetch metadata client-side
  useEffect(() => {
    if (src || !tokenUri || failed) return;
    let cancelled = false;
    const url = normalizeUrl(tokenUri);
    fetch(url, { signal: AbortSignal.timeout(8000) })
      .then((r) => r.json())
      .then((meta: unknown) => {
        if (cancelled) return;
        const m = meta as { image?: string; image_url?: string };
        const raw = m?.image ?? m?.image_url;
        if (raw) setCurrentSrc(normalizeUrl(raw));
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
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
