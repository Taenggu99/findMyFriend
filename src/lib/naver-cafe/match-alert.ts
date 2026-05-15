import type { CafeCrawledPost, CafeUserAlert } from "@prisma/client";

import { isLoveShareCompletedTitle } from "@/lib/naver-cafe/boards";
import { cafeHaystackMatchesRegionMetros } from "@/lib/naver-cafe/cafe-region-filter";

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** 본문·스니펫에서 `지역(시/구/동) : …` 한 줄 값만 뽑는다(카드 요약과 동일 패턴). */
export function extractCafeFormRegionSiGuDong(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const m = text.match(
    /(?:^|\n)\s*[-_＿–—]?\s*지역\s*\(시\/구\/동\)\s*[:\uFF1A]\s*([^\n]+)/im
  );
  const v = m?.[1]?.trim();
  return v ? v : null;
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
    const formRegion =
      extractCafeFormRegionSiGuDong(post.contentSnippet) ?? extractCafeFormRegionSiGuDong(post.title);
    const regionHaystackTight = [post.titleRegion, formRegion].filter(Boolean).join("\n");
    const regionHaystackWide = [post.title, post.contentSnippet ?? "", regionHaystackTight].filter(Boolean).join("\n");
    if (!cafeHaystackMatchesRegionMetros(regionHaystackTight, regionHaystackWide, regions)) {
      return false;
    }
  }

  const phrases = parseJsonArray(alert.keywordPhrasesJson);
  const blob = [post.title, post.contentSnippet ?? "", post.tradeStatus ?? ""].join("\n");
  if (!textMatchesPhrases(blob, phrases)) {
    return false;
  }

  return true;
}
