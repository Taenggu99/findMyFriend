const CLOUDFRONT_SHELTER_BASE = "https://d12l2mexpetzlh.cloudfront.net/images/shelter/";

export function absolutizeShelterImageUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `${CLOUDFRONT_SHELTER_BASE}${s.replace(/^\/+/, "")}`;
}

function isUsableImageUrl(url: string): boolean {
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/")
  );
}

function normalizeRowImageField(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return absolutizeShelterImageUrl(s);
}

/** 브리지 JSON의 image / image2 / … / more_image1 / … 필드 순서 */
function bridgeImageFieldRank(key: string): number {
  if (key === "image") return 0;
  const im = /^image(\d+)$/.exec(key);
  if (im) return Number(im[1]);
  const more = /^more_image(\d+)$/.exec(key);
  if (more) return 100 + Number(more[1]);
  return -1;
}

/** 브리지 행의 모든 사진 필드를 수집해 중복 제거한 절대 URL 목록 */
export function collectBridgeImageUrls(row: object): string[] {
  const r = row as Record<string, unknown>;
  const keys = Object.keys(r)
    .filter((k) => bridgeImageFieldRank(k) >= 0)
    .sort((a, b) => bridgeImageFieldRank(a) - bridgeImageFieldRank(b));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const raw = r[k];
    const s = typeof raw === "string" ? raw : null;
    const c = normalizeRowImageField(s);
    const u = (c ?? "").trim();
    if (!isUsableImageUrl(u) || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function galleryJsonFromUrls(urls: string[]): string {
  return JSON.stringify(urls);
}

export function parseAnimalImageGalleryJson(imageGallery: string, fallbackImageUrl: string): string[] {
  try {
    const parsed: unknown = JSON.parse(imageGallery);
    if (Array.isArray(parsed)) {
      const urls = parsed.filter((x): x is string => typeof x === "string" && isUsableImageUrl(x));
      if (urls.length > 0) {
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const u of urls) {
          if (seen.has(u)) continue;
          seen.add(u);
          deduped.push(u);
        }
        return deduped;
      }
    }
  } catch {
    /* noop */
  }
  return isUsableImageUrl(fallbackImageUrl) ? [fallbackImageUrl] : [];
}
