export type CafeBoardDef = {
  key: string;
  /** 네이버 메뉴/링크 탐색용 (실제 카페 문구와 맞춤) */
  label: string;
  /** 검색·카드·DB 저장용 짧은 표기 */
  displayLabel: string;
  /** 나눔 게시판 vs 장터/분양 게시판 */
  listingTone: "sharing" | "trade";
};

/** 사랑나눔 게시판에서 목록/제목에 이런 표기가 있으면 수집·알림·검색에서 제외 */
export function isLoveShareCompletedTitle(title: string): boolean {
  return title.includes("[나눔완료]") || title.includes("[완료]");
}

/** 모바일 카페 FE 베이스 (구피사랑) */
export const NAVER_CAFE_MOBILE_HOME = "https://m.cafe.naver.com/ca-fe/gupilove";

/** 사용자 요청·캡처 기준 게시판 (라벨은 메뉴와 동일하게 유지) */
export const GUPPI_LOVE_BOARDS: CafeBoardDef[] = [
  { key: "love_share", label: "사랑 나눔", displayLabel: "사랑나눔", listingTone: "sharing" },
  { key: "trade_cafe", label: "생물/용품 분양(카페용)", displayLabel: "분양", listingTone: "trade" },
  { key: "trade_naver", label: "생물/용품 분양(네이버)", displayLabel: "분양", listingTone: "trade" }
];
