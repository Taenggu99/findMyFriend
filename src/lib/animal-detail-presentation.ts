import type { Animal, Shelter } from "@prisma/client";

/** 이미지 좌측 상단 등: 공고중 · 귀가 · 완료 */
export function detailStatusHeadline(status: string): string {
  const s = (status ?? "").trim();
  if (/귀가|반환|인도/.test(s)) return "귀가";
  if (/완료|입양|종료/.test(s)) return "완료";
  return "공고중";
}

export function neuteredPhraseForSummary(neutered: string): string {
  const n = (neutered ?? "").trim();
  if (n === "O") return "완료";
  if (n === "X") return "미중성";
  return "미확인";
}

/** `색: 갈색` 형태 */
export function extractColorHintFromFeatures(features: string): string | null {
  const m = (features ?? "").match(/색:\s*([^·\n]+)/);
  const v = m?.[1]?.trim();
  return v || null;
}

const KOR_COLOR_WORD =
  /(갈색|흰색|검은색|검정색|크림색|삼색|고동색|노란색|회색|적색|주황색|불견|레몬색|검정|크림|탄색|은색|파란색|청색|흑백|갈색흰색)/;

/** 요약 줄용: 축종 없이 색만 (예: 갈색) */
export function extractColorPlain(features: string): string | null {
  const tagged = extractColorHintFromFeatures(features);
  if (tagged) return tagged.replace(/\s+/g, " ").trim();
  const m = (features ?? "").match(KOR_COLOR_WORD);
  return m?.[1]?.trim() ?? null;
}

/** 특이사항 본문에서 요약에 쓴 색·몸무게 문구 제거 */
export function featuresTextForDetailList(features: string): string {
  let s = (features ?? "").trim();
  if (!s) return "-";
  s = s.replace(/\s*·\s*색:\s*[^·]+/gi, "");
  s = s.replace(/색:\s*[^·]+(\s*·\s*)?/gi, "");
  s = s.replace(/\s*·\s*몸무게\s*[:：]?\s*[\d.]+\s*kg/gi, "");
  s = s.replace(/몸무게\s*[:：]?\s*[\d.]+\s*kg\s*·?\s*/gi, "");
  s = s.replace(/\s*·\s*체중\s*[:：]?\s*[\d.]+(?:\s*kg)?/gi, "");
  s = s.replace(/^\s*·\s*/, "").replace(/\s*·\s*$/g, "").trim();
  return s || "-";
}

/** 특이사항 등에서 몸무게 숫자(kg) 추출 */
export function extractWeightKgFromFeatures(features: string): number | null {
  const s = features ?? "";
  const ordered = [
    /몸무게\s*[:：]?\s*(\d+(?:\.\d+)?)\s*kg/i,
    /체중\s*[:：]?\s*(\d+(?:\.\d+)?)\s*kg?/i,
    /추정\s*몸무게\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*\(Kg\)/i
  ];
  for (const re of ordered) {
    const m = s.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (!Number.isNaN(n) && n > 0 && n < 250) return n;
    }
  }
  const loose = s.match(/(?:^|[·,\s])(\d+(?:\.\d+)?)\s*kg\b/i);
  if (loose?.[1]) {
    const n = Number(loose[1]);
    if (!Number.isNaN(n) && n > 0 && n < 250) return n;
  }
  return null;
}

export function formatNoticePeriodCompact(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): string {
  const ymd = (v: Date | string | null | undefined) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${mo}${day}`;
  };
  const a = ymd(start);
  const b = ymd(end);
  if (a && b) return `${a} ~ ${b}`;
  if (a) return `${a} ~`;
  if (b) return `~ ${b}`;
  return "-";
}

export function buildPawinhandStyleSummaryLine(animal: Pick<Animal, "gender" | "neutered" | "features" | "foundDate">): string {
  const neut = neuteredPhraseForSummary(animal.neutered);
  const colorPart = extractColorPlain(animal.features) ?? "-";
  let yearPart = "-";
  if (animal.foundDate) {
    const y = new Date(animal.foundDate).getFullYear();
    if (!Number.isNaN(y)) yearPart = `${y}(년생 추정)`;
  }
  const w = extractWeightKgFromFeatures(animal.features);
  const weightPart = w != null && !Number.isNaN(w) ? String(w) : "미상";
  return `${animal.gender}(${neut}) / ${colorPart} / ${yearPart} / ${weightPart}(Kg)`;
}

export function shelterLineWithPhone(shelter: Pick<Shelter, "name" | "phone">): string {
  const name = (shelter.name ?? "").trim() || "-";
  const tel = (shelter.phone ?? "").trim();
  if (!tel || tel === "-") return name;
  return `${name} (tel : ${tel})`;
}

export function displayOrDash(value: string | null | undefined): string {
  const t = (value ?? "").trim();
  return t || "-";
}
