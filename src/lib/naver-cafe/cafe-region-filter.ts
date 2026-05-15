/**
 * 카페 글 지역 필터: CAFE_REGION_OPTIONS(서울·경기·…·기타)와 본문/제목의 지역 표기를 맞춘다.
 *
 * - **서울**: 제목 `[지역]`·`지역(시/구/동)` 한 줄(`tight`)에서만 판별한다. 25개 자치구 + 행정동(구+동) 목록.
 *   전체 본문(`wide`)에만 있는 “서울”·구명은 카페 UI 오염으로 서울로 치지 않는다.
 * - **그 외 광역**: `wide`(제목+본문+tight)에서 기존처럼 별칭·시군구 목록으로 매칭.
 * - **기타**: 위 광역 어느 것에도 해당하지 않을 때만 매칭(다른 시·도를 체크한 경우와 OR).
 */

import { SEOUL_GU_DONG_NEEDLES } from "@/data/seoul-gu-dong-needles";

function normalizeCompact(s: string): string {
  return s.replace(/\s+/g, "").normalize("NFC");
}

const NEEDS_METRO_CONTEXT = new Set([
  "중구",
  "동구",
  "서구",
  "남구",
  "북구",
  "강서구",
  "고성군"
]);

type MetroDef = {
  aliases: readonly string[];
  districts: readonly string[];
};

const METRO: Record<string, MetroDef> = {
  서울: {
    aliases: ["서울", "서울시", "서울특별시", "ㅅㅓ울", "ㅅㅕ울"],
    districts: [
      "종로구",
      "중구",
      "용산구",
      "성동구",
      "광진구",
      "동대문구",
      "중랑구",
      "성북구",
      "강북구",
      "도봉구",
      "노원구",
      "은평구",
      "서대문구",
      "마포구",
      "양천구",
      "강서구",
      "구로구",
      "금천구",
      "영등포구",
      "동작구",
      "관악구",
      "서초구",
      "강남구",
      "송파구",
      "강동구"
    ]
  },
  부산: {
    aliases: ["부산", "부산시", "부산광역시", "ㅂㅜ산", "ㅂㅜㅅㅏㄴ"],
    districts: [
      "중구",
      "서구",
      "동구",
      "영도구",
      "부산진구",
      "동래구",
      "남구",
      "북구",
      "해운대구",
      "사하구",
      "금정구",
      "강서구",
      "연제구",
      "수영구",
      "사상구",
      "기장군"
    ]
  },
  대구: {
    aliases: ["대구", "대구시", "대구광역시", "ㄷㅐㄱㅜ", "ㄷㅐ구"],
    districts: ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군"]
  },
  인천: {
    aliases: ["인천", "인천시", "인천광역시", "ㅇㅣㄴㅊㅓㄴ", "ㅇㅣㄴ천"],
    districts: ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"]
  },
  광주: {
    aliases: ["광주", "광주광역시", "ㄱㅘㅇㅈㅜ", "광주광역"],
    districts: ["동구", "서구", "남구", "북구", "광산구"]
  },
  대전: {
    aliases: ["대전", "대전시", "대전광역시", "ㄷㅐㅈㅓㄴ", "ㅇㅐㅈㅓㄴ"],
    districts: ["동구", "중구", "서구", "유성구", "대덕구"]
  },
  울산: {
    aliases: ["울산", "울산시", "울산광역시", "ㅇㅜㄹㅅㅏㄴ", "ㅇㅜ산"],
    districts: ["중구", "남구", "동구", "북구", "울주군"]
  },
  세종: {
    aliases: ["세종", "세종시", "세종특별자치시", "ㅅㅔ종", "ㅅㅔㅈㅗㅇ"],
    districts: ["세종특별자치시", "조치원읍"]
  },
  경기: {
    aliases: ["경기", "경기도", "ㄱㅕㅇㄱㅣ", "ㅇㅕㅇㄱㅣ", "수도권"],
    districts: [
      "수원시",
      "성남시",
      "고양시",
      "용인시",
      "부천시",
      "안산시",
      "안양시",
      "남양주시",
      "화성시",
      "평택시",
      "의정부시",
      "시흥시",
      "파주시",
      "김포시",
      "광명시",
      "군포시",
      "하남시",
      "오산시",
      "이천시",
      "안성시",
      "의왕시",
      "양주시",
      "구리시",
      "포천시",
      "여주시",
      "동두천시",
      "과천시",
      "가평군",
      "양평군",
      "연천군",
      "광주시"
    ]
  },
  강원: {
    aliases: ["강원", "강원도", "강원특별자치도", "ㄱㅏㅇㅇㅓㄴ", "ㅇㅏㅇ원"],
    districts: [
      "춘천시",
      "원주시",
      "강릉시",
      "동해시",
      "태백시",
      "속초시",
      "삼척시",
      "홍천군",
      "횡성군",
      "영월군",
      "평창군",
      "정선군",
      "철원군",
      "화천군",
      "화천읍",
      "양구군",
      "인제군",
      "고성군",
      "양양군"
    ]
  },
  충북: {
    aliases: ["충북", "충청북도", "ㅊㅜㅇㅂㅜㄱ", "충북도"],
    districts: [
      "청주시",
      "충주시",
      "제천시",
      "보은군",
      "옥천군",
      "영동군",
      "증평군",
      "진천군",
      "괴산군",
      "음성군",
      "단양군"
    ]
  },
  충남: {
    aliases: ["충남", "충청남도", "ㅊㅜㅇㄴㅏㅁ", "충남도"],
    districts: [
      "천안시",
      "공주시",
      "보령시",
      "아산시",
      "서산시",
      "논산시",
      "계룡시",
      "당진시",
      "금산군",
      "부여군",
      "서천군",
      "청양군",
      "홍성군",
      "예산군",
      "태안군"
    ]
  },
  전북: {
    aliases: ["전북", "전라북도", "전북특별자치도", "ㅈㅓㄴㅂㅜㄱ", "ㅇㅓㄴ북", "전북도", "전주", "익산"],
    districts: [
      "전주시",
      "군산시",
      "익산시",
      "정읍시",
      "남원시",
      "김제시",
      "완주군",
      "진안군",
      "무주군",
      "장수군",
      "임실군",
      "순창군",
      "고창군",
      "부안군"
    ]
  },
  전남: {
    aliases: ["전남", "전라남도", "ㅈㅓㄴㄴㅏㅁ", "ㅇㅓㄴ남", "전남도"],
    districts: [
      "목포시",
      "여수시",
      "순천시",
      "나주시",
      "광양시",
      "담양군",
      "곡성군",
      "구례군",
      "고흥군",
      "보성군",
      "화순군",
      "장흥군",
      "강진군",
      "해남군",
      "영암군",
      "무안군",
      "함평군",
      "영광군",
      "장성군",
      "완도군",
      "진도군",
      "신안군"
    ]
  },
  경북: {
    aliases: ["경북", "경상북도", "ㄱㅕㅇㅂㅜㄱ", "ㅇㅕㅇ북", "경북도"],
    districts: [
      "포항시",
      "경주시",
      "김천시",
      "안동시",
      "구미시",
      "영주시",
      "영천시",
      "상주시",
      "문경시",
      "경산시",
      "의성군",
      "청송군",
      "영양군",
      "영덕군",
      "청도군",
      "고령군",
      "성주군",
      "칠곡군",
      "예천군",
      "봉화군",
      "울진군",
      "울릉군",
      "군위군"
    ]
  },
  경남: {
    aliases: ["경남", "경상남도", "ㄱㅕㅇㄴㅏㅁ", "ㅇㅕㅇ남", "경남도"],
    districts: [
      "창원시",
      "진주시",
      "통영시",
      "사천시",
      "김해시",
      "밀양시",
      "거제시",
      "양산시",
      "의령군",
      "함안군",
      "창녕군",
      "고성군",
      "남해군",
      "하동군",
      "산청군",
      "함양군",
      "거창군",
      "합천군"
    ]
  },
  제주: {
    aliases: ["제주", "제주도", "제주특별자치도", "ㅈㅔㅈㅜ", "ㅈㅔ주"],
    districts: ["제주시", "서귀포시"]
  }
};

function haystackHasNeedle(haystackNorm: string, needle: string): boolean {
  const n = normalizeCompact(needle);
  if (!n) return false;
  return haystackNorm.includes(n);
}

function metroNameAppearsInHaystack(metroKey: string, haystackNorm: string): boolean {
  const def = METRO[metroKey];
  if (!def) return false;
  return def.aliases.some((a) => haystackHasNeedle(haystackNorm, a));
}

function needleMatchesMetro(metroKey: string, needle: string, haystackNorm: string): boolean {
  if (!haystackHasNeedle(haystackNorm, needle)) return false;
  if (NEEDS_METRO_CONTEXT.has(needle)) {
    return metroNameAppearsInHaystack(metroKey, haystackNorm);
  }
  return true;
}

function metroMatchesNonSeoul(metroKey: string, wideNorm: string): boolean {
  const def = METRO[metroKey];
  if (!def) return false;
  if (def.aliases.some((a) => haystackHasNeedle(wideNorm, a))) return true;
  for (const d of def.districts) {
    if (needleMatchesMetro(metroKey, d, wideNorm)) return true;
  }
  return false;
}

function metroMatchesSeoul(tightNorm: string): boolean {
  const def = METRO.서울;
  if (!tightNorm) return false;
  if (def.aliases.some((a) => haystackHasNeedle(tightNorm, a))) return true;
  for (const d of def.districts) {
    if (needleMatchesMetro("서울", d, tightNorm)) return true;
  }
  for (const n of SEOUL_GU_DONG_NEEDLES) {
    if (haystackHasNeedle(tightNorm, n)) return true;
  }
  return false;
}

/** 서울·부산·…·제주 중 하나라도 wide/tight 규칙에 맞으면 true (기타 제외) */
function matchesAnyDefinedMetroExcept기타(tightNorm: string, wideNorm: string): boolean {
  for (const key of Object.keys(METRO)) {
    if (key === "서울") {
      if (metroMatchesSeoul(tightNorm)) return true;
    } else if (metroMatchesNonSeoul(key, wideNorm)) {
      return true;
    }
  }
  return false;
}

/**
 * @param regionHaystackTight 제목 `[지역]` + `지역(시/구/동)` 한 줄만 (공백 제거 전 원문)
 * @param regionHaystackWide 제목 전체 + 본문 스니펫 + tight
 * @param selectedMetros CAFE_REGION_OPTIONS 에서 고른 값(기타 포함). OR 매칭.
 */
export function cafeHaystackMatchesRegionMetros(
  regionHaystackTight: string,
  regionHaystackWide: string,
  selectedMetros: readonly string[]
): boolean {
  if (selectedMetros.length === 0) return true;
  const tight = normalizeCompact(regionHaystackTight);
  const wide = normalizeCompact(regionHaystackWide);

  const keys = [...new Set(selectedMetros.map((k) => k.trim()).filter(Boolean))];
  const wants기타 = keys.includes("기타");
  const metroKeys = keys.filter((k) => k !== "기타");

  for (const key of metroKeys) {
    if (key === "서울") {
      if (metroMatchesSeoul(tight)) return true;
      continue;
    }
    if (METRO[key]) {
      if (metroMatchesNonSeoul(key, wide)) return true;
      continue;
    }
    if (wide.includes(normalizeCompact(key))) return true;
  }

  if (wants기타) {
    return !matchesAnyDefinedMetroExcept기타(tight, wide);
  }
  return false;
}
