import path from "node:path";

export function defaultNaverSessionPath(): string {
  const rel = process.env.NAVER_SESSION_PATH?.trim() || "storage/naver-session.json";
  return path.isAbsolute(rel) ? rel : path.join(/* turbopackIgnore: true */ process.cwd(), rel);
}

/** 게시판별 목록 URL 직접 지정 (메뉴 클릭이 실패할 때). JSON: Record<boardKey, url> */
export function boardUrlOverrides(): Record<string, string> {
  const raw = process.env.NAVER_CAFE_BOARD_URLS_JSON?.trim();
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    return v as Record<string, string>;
  } catch {
    return {};
  }
}
