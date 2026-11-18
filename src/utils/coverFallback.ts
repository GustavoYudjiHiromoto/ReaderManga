/**
 * Builds an ordered list of fallback image URLs so transient CDN hiccups,
 * proxy rate limits, or missing MangaDex .512.jpg thumbnails recover automatically.
 */
function unwrapProxyUrl(url: string): string | null {
  if (!url.startsWith('/api/proxy/image?')) return null;
  try {
    const qs = url.substring('/api/proxy/image?'.length);
    const params = new URLSearchParams(qs);
    return params.get('url');
  } catch {
    return null;
  }
}

function getMangaDexVariantUrls(directUrl: string): string[] {
  const candidates: string[] = [];
  if (!directUrl.includes('uploads.mangadex.org/covers/')) {
    return candidates;
  }

  if (/\.(512|256)\.jpg$/i.test(directUrl)) {
    const is512 = /\.512\.jpg$/i.test(directUrl);
    const small = directUrl.replace(/\.(512|256)\.jpg$/i, '.256.jpg');
    const original = directUrl.replace(/\.(512|256)\.jpg$/i, '');
    if (is512) {
      candidates.push(small);
    }
    candidates.push(original);
  } else {
    candidates.push(`${directUrl}.512.jpg`, `${directUrl}.256.jpg`);
  }

  return candidates;
}

export function getNextCoverFallback(currentUrl: string, attempted: Set<string>): string | null {
  if (!currentUrl) return null;
  attempted.add(currentUrl);

  const candidates: string[] = [];
  const proxiedTarget = unwrapProxyUrl(currentUrl);

  if (proxiedTarget) {
    // 1. Try direct CDN load (works for CORS-friendly CDNs like uploads.mangadex.org with referrerPolicy="no-referrer")
    if (proxiedTarget.startsWith('http')) {
      candidates.push(proxiedTarget);
    }
    // 2. For MangaDex covers, try alternative sizes (.256.jpg and original cover file) via proxy and direct
    for (const variant of getMangaDexVariantUrls(proxiedTarget)) {
      candidates.push(`/api/proxy/image?url=${encodeURIComponent(variant)}`);
      candidates.push(variant);
    }
  } else if (currentUrl.startsWith('http')) {
    // 1. Try via backend image proxy (bypasses hotlink / CORS / Referer blocks)
    candidates.push(`/api/proxy/image?url=${encodeURIComponent(currentUrl)}`);
    // 2. For direct MangaDex URLs, also try size/original variants
    for (const variant of getMangaDexVariantUrls(currentUrl)) {
      candidates.push(`/api/proxy/image?url=${encodeURIComponent(variant)}`);
      candidates.push(variant);
    }
  }

  for (const next of candidates) {
    if (next && next !== currentUrl && !attempted.has(next)) {
      return next;
    }
  }

  return null;
}
