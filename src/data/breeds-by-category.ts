import type { AnimalCategory } from "@/types/animal";

/** UI·검색용 대표 품종 (전체 선택 시 breed 비움) */
export const breedsByCategory: Record<AnimalCategory, readonly string[]> = {
  개: [
    "믹스견",
    "말티즈",
    "비숑프리제",
    "푸들",
    "포메라니안",
    "치와와",
    "요크셔테리어",
    "진돗개",
    "웰시코기",
    "골든리트리버",
    "리트리버",
    "시바견",
    "불독",
    "슈나우저",
    "보더콜리",
    "기타"
  ],
  고양이: [
    "코리안숏헤어",
    "스코티시폴드",
    "터키시앙고라",
    "페르시안",
    "러시안블루",
    "벵갈",
    "메인쿤",
    "샴",
    "노르웨이숲",
    "기타"
  ],
  조류: ["앵무새", "닭", "오리", "비둘기", "거위", "칠면조", "문조", "기타"],
  설치류: ["햄스터", "기니피그", "토끼", "친칠라", "다람쥐", "페럿", "고슴도치", "기타"],
  파충류: ["뱀", "도마뱀", "거북", "이구아나", "게코", "기타"],
  기타: ["기타"]
};

export function breedsForCategory(category: string): string[] {
  const key = category as AnimalCategory;
  if (key && key in breedsByCategory) {
    return [...breedsByCategory[key]];
  }
  return [];
}
