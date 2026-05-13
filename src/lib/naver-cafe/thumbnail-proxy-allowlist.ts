/** 카페 썸네일 프록시에서만 허용하는 이미지 CDN 호스트(오픈 프록시·SSRF 방지) */
export function isAllowedCafeThumbnailFetchHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return false;
  return (
    h.endsWith(".pstatic.net") ||
    h.endsWith(".naver.net") ||
    h.endsWith(".naver.com") ||
    h.endsWith(".daumcdn.net") ||
    h.endsWith(".daum.net") ||
    h.endsWith(".kakaocdn.net")
  );
}
