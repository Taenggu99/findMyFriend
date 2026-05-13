/** 장터/분양 글이 거래·판매 완료로 보이는지 (뱃지를 "완료"로 바꿀 때 사용) */
export function isTradeListingCompleted(post: {
  postKind: string;
  title: string;
  tradeStatus: string | null;
  contentSnippet?: string | null;
}): boolean {
  if (post.postKind !== "trade") return false;
  if (post.tradeStatus && /완료/.test(post.tradeStatus)) return true;
  const t = post.title;
  // "완료(안산)…", "완료 …" 등 대괄호 없이 제목이 완료로 시작
  if (/^\s*완료/.test(t)) return true;
  if (/\[[^\]]*완료[^\]]*\]/.test(t)) return true;
  if (/(거래\s*완료|판매\s*완료|분양\s*완료|나눔\s*완료|거래완료|판매완료)/i.test(t)) return true;
  const sn = post.contentSnippet ?? "";
  if (/(거래\s*완료|판매\s*완료|분양\s*완료)/i.test(sn)) return true;
  return false;
}

/** 상단 칩과 중복되는 제목 맨 앞의 "완료" / "판매"만 제거 (장터 글만) */
export function stripTradeTitleDuplicatePrefix(title: string, postKind: string): string {
  if (postKind !== "trade") return title;
  let s = title.replace(/^\uFEFF/, "").trimStart();
  const restAfter = (prefix: string) => {
    if (!s.startsWith(prefix)) return null;
    const next = s.slice(prefix.length).trimStart();
    return next.length > 0 ? next : null;
  };
  const afterComplete = restAfter("완료");
  if (afterComplete !== null) return afterComplete;
  const afterSale = restAfter("판매");
  if (afterSale !== null) return afterSale;
  return title;
}

/** 카드 앞쪽 강조 칩: 완료면 "완료", 아니면 기본 "판매" */
export function tradeSaleChipLabel(post: {
  postKind: string;
  title: string;
  tradeStatus: string | null;
  contentSnippet?: string | null;
}): "판매" | "완료" {
  return isTradeListingCompleted(post) ? "완료" : "판매";
}
