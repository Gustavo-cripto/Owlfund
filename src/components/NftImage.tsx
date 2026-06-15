"use client";
import { useState } from "react";

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

interface NftImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}

export default function NftImage({ src, alt, className, loading }: NftImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [failed, setFailed] = useState(false);

  if (failed) return null;

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
