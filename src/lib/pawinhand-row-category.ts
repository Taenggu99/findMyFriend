import type { PawinhandBridgeAnimalRow } from "@/lib/pawinhand-bridge";
import { parseTitleCategoryBreed } from "@/lib/pawinhand-rss";

const BIRD_KEYWORDS = [
  "앵무",
  "닭",
  "오리",
  "비둘기",
  "거위",
  "칠면조",
  "펭귄",
  "카나리아",
  "문조",
  "조류",
  "사육새",
  "새"
];

const RODENT_KEYWORDS = [
  "햄스터",
  "기니피그",
  "친칠라",
  "다람쥐",
  "페럿",
  "고슴도치",
  "토끼",
  "라쿤",
  "미어캣",
  "기니"
];

const REPTILE_KEYWORDS = [
  "뱀",
  "도마뱀",
  "이구아나",
  "게코",
  "크레스티드",
  "크레",
  "육지거북",
  "거북",
  "르뱅",
  "프렉",
  "파충"
];

function textIncludesAny(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/**
 * 브리지 행 → 앱 카테고리(개/고양이/조류/설치류/파충류/기타) 및 품종명.
 * [기타축종]은 품종 키워드로 조류·설치류·파충류를 나눈다.
 */
export function mapPawinhandRowToAppCategory(row: PawinhandBridgeAnimalRow): {
  category: string;
  breed: string;
} {
  const parsed = row.breeds ? parseTitleCategoryBreed(row.breeds) : null;
  const breedFromRow = (parsed?.breed ?? row.s_breeds ?? "").trim() || "미상";
  const speciesRaw = (row.species ?? "").trim();
  const bracketCat = parsed?.category;

  if (bracketCat === "개") {
    return { category: "개", breed: breedFromRow };
  }
  if (bracketCat === "고양이") {
    return { category: "고양이", breed: breedFromRow };
  }

  const blob = `${breedFromRow} ${row.breeds ?? ""} ${row.s_breeds ?? ""}`;

  if (bracketCat === "기타" || speciesRaw === "기타") {
    if (textIncludesAny(blob, BIRD_KEYWORDS)) {
      return { category: "조류", breed: breedFromRow };
    }
    if (textIncludesAny(blob, REPTILE_KEYWORDS)) {
      return { category: "파충류", breed: breedFromRow };
    }
    if (textIncludesAny(blob, RODENT_KEYWORDS)) {
      return { category: "설치류", breed: breedFromRow };
    }
    return { category: "기타", breed: breedFromRow };
  }

  if (textIncludesAny(blob, BIRD_KEYWORDS)) {
    return { category: "조류", breed: breedFromRow };
  }
  if (textIncludesAny(blob, REPTILE_KEYWORDS)) {
    return { category: "파충류", breed: breedFromRow };
  }
  if (textIncludesAny(blob, RODENT_KEYWORDS)) {
    return { category: "설치류", breed: breedFromRow };
  }

  if (speciesRaw === "개") return { category: "개", breed: breedFromRow };
  if (speciesRaw === "고양이") return { category: "고양이", breed: breedFromRow };

  return { category: bracketCat || "기타", breed: breedFromRow };
}
