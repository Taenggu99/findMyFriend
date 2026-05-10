/**
 * 국가동물보호정보시스템(animal.go.kr) HTML 구조가 바뀌면 이 파일만 조정합니다.
 * 목록/상세 공통 클래스·태그 후보를 나열해 두고 파서에서 순서대로 시도합니다.
 */

export const AWTIS_LIST_ROW_SELECTORS = [
  "table.board_list tbody tr",
  "table.tbl_list tbody tr",
  ".board_list tbody tr",
  "div.board_list table tbody tr"
];

export const AWTIS_DETAIL_TABLE_SELECTORS = ["table.view_table", "table.tbl_view", ".view_table table"];

/** 상세에서 th/td 짝으로 읽을 때 제목 정규화용 키워드 */
export const AWTIS_DETAIL_LABEL_HINTS: Record<string, string[]> = {
  species: ["동물종류", "축종"],
  breed: ["품종"],
  color: ["털색", "색상"],
  gender: ["성별"],
  neutered: ["중성화"],
  feature: ["특징"],
  foundDate: ["구조일", "접수일"],
  foundPlace: ["구조장소", "발견장소"],
  noticePeriod: ["공고기간"],
  shelterName: ["보호센터", "보호소", "관할기관"],
  shelterAddr: ["주소", "소재지"],
  shelterTel: ["연락처", "전화"]
};
