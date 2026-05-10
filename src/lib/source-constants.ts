/** DB·API에서 쓰는 출처 식별자 */
export const SOURCE_PAWINHAND = "pawinhand";
export const SOURCE_AWTIS = "awtis";
/** 포인핸드·AWTIS 등 2개 이상 플랫폼 링크가 붙은 레코드 */
export const SOURCE_MULTI = "multi";

export type SourceTypeId = typeof SOURCE_PAWINHAND | typeof SOURCE_AWTIS;

/** 목록·상세 배지용 */
export function sourceSiteLabel(site: string): string {
  if (site === SOURCE_PAWINHAND) return "포인핸드";
  if (site === SOURCE_AWTIS) return "국가동물보호시스템";
  if (site === SOURCE_MULTI) return "포인핸드·국가시스템";
  return site;
}

/** 플랫폼별 원본 링크 버튼 문구 */
export function sourceTypeLinkLabel(sourceType: string): string {
  if (sourceType === SOURCE_PAWINHAND) return "포인핸드에서 보기";
  if (sourceType === SOURCE_AWTIS) return "국가동물보호정보시스템에서 보기";
  return "원본 보기";
}
