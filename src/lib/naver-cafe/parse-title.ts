import type { CafeBoardDef } from "@/lib/naver-cafe/boards";

export type ParsedTitle = {
  titleRegion: string | null;
  tradeStatus: string | null;
};

const TRADE_STATUS_HINTS = ["판매", "예약", "완료", "거래", "나눔", "구함", "교환", "분양"];

function firstBracket(text: string): { inner: string; rest: string } | null {
  const m = text.match(/^\s*\[([^\]]+)\]\s*/);
  if (!m) return null;
  return { inner: m[1].trim(), rest: text.slice(m[0].length).trim() };
}

/** 제목 앞 대괄호를 게시판 성격에 맞게 지역 vs 거래 상태로 해석 */
export function parseCafeTitle(board: CafeBoardDef, title: string): ParsedTitle {
  const first = firstBracket(title);
  if (!first) {
    return { titleRegion: null, tradeStatus: null };
  }

  if (board.listingTone === "sharing") {
    return { titleRegion: first.inner, tradeStatus: null };
  }

  const looksLikeStatus = TRADE_STATUS_HINTS.some((h) => first.inner.includes(h));
  if (looksLikeStatus) {
    return { titleRegion: null, tradeStatus: first.inner };
  }

  return { titleRegion: first.inner, tradeStatus: null };
}
