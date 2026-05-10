/**
 * 검색 파라미터 매핑 (일부만 코드 확보 — 나머지는 환경·추가 맵으로 확장)
 * @see https://www.animal.go.kr
 */

/** 품종(대) 코드: 개 / 고양이 */
export const AWTIS_UP_KIND: Record<string, string> = {
  개: "417000",
  고양이: "422400"
};

/** 시·도 코드 예시 (필요 시 env JSON으로 덮어씀) */
export const AWTIS_SIDO_DEFAULT: Record<string, string> = {
  서울: "6110000",
  서울특별시: "6110000",
  부산: "6260000",
  부산광역시: "6260000",
  대구: "6270000",
  대구광역시: "6270000",
  인천: "6280000",
  인천광역시: "6280000",
  광주: "6290000",
  광주광역시: "6290000",
  대전: "6300000",
  대전광역시: "6300000",
  울산: "6310000",
  울산광역시: "6310000",
  세종: "5690000",
  세종특별자치시: "5690000",
  경기: "6410000",
  경기도: "6410000",
  강원: "6420000",
  강원특별자치도: "6420000",
  충북: "6430000",
  충청북도: "6430000",
  충남: "6440000",
  충청남도: "6440000",
  전북: "6450000",
  전북특별자치도: "6450000",
  전남: "6460000",
  전라남도: "6460000",
  경북: "6470000",
  경상북도: "6470000",
  경남: "6480000",
  경상남도: "6480000",
  제주: "6500000",
  제주특별자치도: "6500000"
};

/** 세부 품종 코드 일부 (매칭 실패 시 빈 값으로 목록만 조회) */
export const AWTIS_KIND_CD: Record<string, string> = {
  푸들: "000128",
  "한국 고양이": "000054",
  코리안숏헤어: "000054"
};

/**
 * 시군구(searchOrgCd) 일부 — 문서 예시 등. 전체 테이블은 크므로 `AWTIS_ORG_MAP_JSON`으로 확장.
 * 동일 키가 env JSON에 있으면 env 값이 우선합니다.
 */
export const AWTIS_ORG_DEFAULT: Record<string, string> = {
  "경남 거창": "5470000",
  "경상남도 거창": "5470000",
  "경상남도 거창군": "5470000"
};

const MENU_NO_DEFAULT = "1000000055";

export function awtisMenuNo(): string {
  return process.env.AWTIS_MENU_NO?.trim() || MENU_NO_DEFAULT;
}

/** "서울 강남" → 시도 코드 (첫 토큰) */
export function mapRegionToUprCd(regionInput: string): string {
  const t = regionInput.trim();
  if (!t) return "";
  const parts = t.split(/\s+/);
  const first = parts[0] ?? "";
  return AWTIS_SIDO_DEFAULT[first] ?? AWTIS_SIDO_DEFAULT[t] ?? "";
}

/** 시군구 코드: env JSON 우선, 없으면 내장 소수 예시 */
export function mapRegionToOrgCd(regionInput: string): string {
  const key = regionInput.trim();
  if (!key) return "";
  const raw = process.env.AWTIS_ORG_MAP_JSON?.trim();
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      if (map[key]) return map[key]!;
    } catch {
      /* fall through */
    }
  }
  return AWTIS_ORG_DEFAULT[key] ?? "";
}

export function mapCategoryToUpKindCd(category: string): string {
  const c = category.trim();
  return AWTIS_UP_KIND[c] ?? "";
}

export function mapBreedToKindCd(breed: string): string {
  const b = breed.trim();
  return AWTIS_KIND_CD[b] ?? "";
}
