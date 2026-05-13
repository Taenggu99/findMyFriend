import type { CafeCrawledPost, CafeUserAlert } from "@prisma/client";

import { isLoveShareCompletedTitle } from "@/lib/naver-cafe/boards";

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeRegion(s: string): string {
  return s.replace(/\s+/g, "");
}

/** 사용자가 고른 지역이 제목의 [지역]과 맞는지 (부분 일치 허용) */
export function regionMatches(selected: string, titleRegion: string | null): boolean {
  if (!selected.trim()) return true;
  if (!titleRegion) return false;
  const a = normalizeRegion(selected);
  const b = normalizeRegion(titleRegion);
  return b.includes(a) || a.includes(b);
}

/** 한 줄(문구) 안에서는 띄어쓰기로 나눈 토큰이 모두 포함되어야 함(AND). 줄 여러 개는 OR. */
export function textMatchesPhrases(haystack: string, phrases: string[]): boolean {
  if (phrases.length === 0) return true;
  const lower = haystack.toLowerCase();
  return phrases.some((phrase) => {
    const tokens = phrase
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase());
    if (tokens.length === 0) return false;
    return tokens.every((t) => lower.includes(t));
  });
}

export function cafeAlertMatchesPost(
  alert: Pick<CafeUserAlert, "boardKeysJson" | "listingKind" | "regionsJson" | "keywordPhrasesJson">,
  post: Pick<
    CafeCrawledPost,
    "boardKey" | "postKind" | "titleRegion" | "tradeStatus" | "title" | "contentSnippet"
  >
): boolean {
  if (post.boardKey === "love_share" && isLoveShareCompletedTitle(post.title)) {
    return false;
  }

  const boards = parseJsonArray(alert.boardKeysJson);
  if (boards.length > 0 && !boards.includes(post.boardKey)) {
    return false;
  }

  const kind = alert.listingKind.trim().toLowerCase();
  if (kind === "sharing" && post.postKind !== "sharing") {
    return false;
  }
  if (kind === "trade" && post.postKind !== "trade") {
    return false;
  }

  const regions = parseJsonArray(alert.regionsJson);
  if (regions.length > 0) {
    const ok = regions.some((r) => regionMatches(r, post.titleRegion));
    if (!ok) return false;
  }

  const phrases = parseJsonArray(alert.keywordPhrasesJson);
  const blob = [post.title, post.contentSnippet ?? "", post.tradeStatus ?? ""].join("\n");
  if (!textMatchesPhrases(blob, phrases)) {
    return false;
  }

  return true;
}
