"use client";
import { useEffect, useState } from "react";

function extractCid(url: string): string | undefined {
  if (url.startsWith("ipfs://")) return url.slice(7).replace(/^ipfs\//, "");
  const m = url.match(/\/ipfs\/(.+)/);
  return m?.[1];
}

/** Routes any IPFS reference through our resilient proxy; passes http(s) through. */
function toSrc(url: string): string {
  if (url.startsWith("/api/ipfs-image")) return url;
  const cid = extractCid(url);
  if (cid) return `/api/ipfs-image?cid=${encodeURIComponent(cid)}`;
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
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src ? toSrc(src) : undefined);
  const [failed, setFailed] = useState(false);

  // No direct image: fetch the metadata (via proxy if IPFS) and pull out the image.
  useEffect(() => {
    if (src || !tokenUri || failed) return;
    let cancelled = false;
    const metaUrl = toSrc(tokenUri);
    fetch(metaUrl, { signal: AbortSignal.timeout(20000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((meta: unknown) => {
        if (cancelled) return;
        const m = meta as { image?: string; image_url?: string };
        const raw = m?.image ?? m?.image_url;
        if (raw) setCurrentSrc(toSrc(raw));
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
      onError={() => setFailed(true)}
    />
  );
}
