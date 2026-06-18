"use client";
import { useEffect, useMemo, useState } from "react";

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

/** Extracts a Bitcoin Ordinals inscription id from a content URL, if present. */
function ordinalId(url: string): string | undefined {
  const m = url.match(/\/content\/([0-9a-f]{64}i\d+)/i);
  return m?.[1];
}

/** Ordered candidate URLs to try for a given source (handles flaky ordinal CDNs). */
function buildCandidates(url: string): string[] {
  const id = ordinalId(url);
  if (id) {
    return [
      `https://ord-mirror.magiceden.dev/content/${id}`,
      `https://ordinals.com/content/${id}`,
      `https://static.unisat.io/content/${id}`,
    ];
  }
  return [toSrc(url)];
}

interface NftImageProps {
  src?: string;
  tokenUri?: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}

export default function NftImage({ src, tokenUri, alt, className, loading }: NftImageProps) {
  const candidates = useMemo(() => (src ? buildCandidates(src) : []), [src]);
  const [idx, setIdx] = useState(0);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(candidates[0]);
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
        if (raw) setResolvedSrc(toSrc(raw));
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [src, tokenUri, failed]);

  // Placeholder for non-visual inscriptions / broken images (e.g. JSON/text Ordinals).
  if (failed || !resolvedSrc) {
    return (
      <div className={`flex items-center justify-center bg-slate-800/60 text-slate-500 ${className ?? ""}`}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-1/3 w-1/3 min-h-3 min-w-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        // Try the next candidate gateway; if exhausted, show the placeholder.
        const next = idx + 1;
        if (next < candidates.length) {
          setIdx(next);
          setResolvedSrc(candidates[next]);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
