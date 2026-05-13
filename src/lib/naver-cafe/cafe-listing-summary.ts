export type CafeListingSummaryRow = { label: string; value: string };

export type CafeListingStructuredSummary = {
  rows: CafeListingSummaryRow[];
  /** 폼·공지 제외 후 남은 본문 일부 */
  extraPreview: string | null;
};

/** 스니펫이 한 줄로만 올 때도 경찰·사기 안내·★공지 등을 걷어 낸다 */
export function stripCafeSnippetNoise(blob: string): string {
  let t = blob.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  t = t.replace(/https?:\/\/[^\s\u200b]+/gi, " ");

  for (let i = 0; i < 24; i++) {
    const next = t.replace(/★[^★\n]{0,1200}★/g, " ");
    if (next === t) break;
    t = next;
  }
  t = t.replace(/★[^\n]{0,1200}(?=\n|$)/g, " ");
  t = t.replace(/◎[^◎\n]{0,800}◎?/g, " ");
  t = t.replace(/♣[^♣\n]{0,800}♣?/g, " ");

  t = t.replace(
    /경찰청[\s\S]*?(?=지역\s*\(시\/구\/동\)|-\s*지역\s*\(시|-\s*닉네임|◎\s*분양|분양자\s*필독|♣|$)/gi,
    " "
  );
  t = t.replace(
    /중고나라[\s\S]*?(?=지역\s*\(시\/구\/동\)|-\s*지역\s*\(시|-\s*닉네임|◎\s*분양|분양자\s*필독|♣|$)/gi,
    " "
  );
  t = t.replace(/인터넷\s*사기\s*의심[\s\S]{0,400}?(?=★|◎|♣|-\s*닉네임|지역\s*\(시|$)/gi, " ");
  t = t.replace(/계좌번호\s*조회[\s\S]{0,200}/gi, " ");
  t = t.replace(/분양자\s*필독[\s\S]{0,400}?(?=♣|-\s*닉네임|지역\s*\(시|$)/gi, " ");
  t = t.replace(/분양글\s*삭제[\s\S]{0,400}?(?=♣|-\s*닉네임|지역\s*\(시|$)/gi, " ");

  return t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function isBoilerplateLine(trimmed: string): boolean {
  if (!trimmed) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/police\.go|joongna\.com\/fraud|cyber04|경찰청|중고나라|사기\s*의심|계좌번호\s*조회/i.test(trimmed)) {
    return true;
  }
  if (/^★|^☆|^♣|^◎|^♦/.test(trimmed)) return true;
  if (/인터넷\s*사기|계좌번호\s*조회|중고나라에서\s*사기|경찰청/i.test(trimmed)) return true;
  if (/분양자\s*필독|분양글\s*삭제|재가입불가|강퇴/i.test(trimmed)) return true;
  return false;
}

/** `- 지역` 처럼 앞줄에 붙어 있어도 지역부터 자른다 */
function sliceFromFormStart(text: string): string {
  const cleaned = stripCafeSnippetNoise(text);
  let idx = cleaned.search(/-\s*지역\s*\(시\/구\/동\)\s*[:\uFF1A]/im);
  if (idx < 0) {
    idx = cleaned.search(/(?:^|[\n\s])([-_＿–—]\s*)?지역\s*\(시\/구\/동\)\s*[:\uFF1A]/im);
  }
  if (idx >= 0) {
    return cleaned.slice(idx).trim();
  }
  const lines = cleaned.split("\n");
  const startIdx = lines.findIndex((line) => {
    const t = line.trim();
    if (isBoilerplateLine(t)) return false;
    return /지역\s*\(시\/구\/동\)\s*[:\uFF1A]/i.test(t) || /^[-_＿–—]\s*지역\s*\(시\/구\/동\)/i.test(t);
  });
  if (startIdx === -1) {
    return lines.filter((l) => !isBoilerplateLine(l.trim())).join("\n").trim();
  }
  return lines.slice(startIdx).join("\n").trim();
}

const FIELD_RES: { label: string; re: RegExp }[] = [
  {
    label: "지역",
    re: /(?:^|\n)\s*[-_＿–—]\s*지역\s*\(시\/구\/동\)\s*[:\uFF1A]\s*([^\n]+)/im
  },
  {
    label: "분양 대상",
    re: /(?:^|\n)\s*[-_＿–—]\s*분양\s*대상\s*\(풀네임\)\s*[:\uFF1A]\s*([^\n]+)/im
  },
  {
    label: "물생활 이력",
    re: /(?:^|\n)\s*[-_＿–—]\s*물생활\s*이력\s*[:\uFF1A]?\s*([^\n]+)/im
  },
  {
    label: "희망분양가",
    re: /(?:^|\n)\s*[-_＿–—]\s*희망\s*분양가\s*[:\uFF1A]?\s*([^\n]+)/im
  },
  {
    label: "사육·파손보장",
    re: /(?:^|\n)\s*[-_＿–—]\s*(?:사착|사육)\s*및\s*파손보장\s*유무\s*[:\uFF1A]?\s*([^\n]+)/im
  },
  {
    label: "거래방법",
    re: /(?:^|\n)\s*[-_＿–—]\s*거래\s*방법\s*(?:\([^)]+\))?\s*[:\uFF1A]\s*([^\n]+)/im
  }
];

/** `닉네임 : …- 나이` 처럼 한 줄에 붙은 `- 항목` 앞에 줄바꿈 삽입 */
function splitCafeDashInlineFormLabels(text: string): string {
  return text.replace(
    /(?<=[^\n])\s*-\s*(?=(?:닉네임|나이\s*\(|연락처\s*\(|연락처|지역\s*\(|분양\s*대상|물생활|희망\s*분양가|사착|사육|거래\s*방법|사진\s*\())/gi,
    "\n- "
  );
}

/** 카드에 표시할 폼 줄(물생활·닉네임 등 제외) — 라벨은 카페 문구와 동일하게 */
const CAFE_CARD_FORM_ROWS: { displayPrefix: string; re: RegExp }[] = [
  {
    displayPrefix: "지역(시/구/동) :",
    re: /(?:^|\n)\s*[-_＿–—]?\s*지역\s*\(시\/구\/동\)\s*[:\uFF1A]\s*([^\n]+)/im
  },
  {
    displayPrefix: "분양 대상(풀네임) :",
    re: /(?:^|\n)\s*[-_＿–—]?\s*분양\s*대상\s*\(풀네임\)\s*[:\uFF1A]\s*([^\n]+)/im
  },
  {
    displayPrefix: "희망분양가 :",
    re: /(?:^|\n)\s*[-_＿–—]?\s*희망\s*분양가\s*[:\uFF1A]?\s*([^\n]+)/im
  },
  {
    displayPrefix: "사착 및 파손보장 유무 :",
    re: /(?:^|\n)\s*[-_＿–—]?\s*(?:사착|사육)\s*및\s*파손보장\s*유무\s*[:\uFF1A]?\s*([^\n]+)/im
  },
  {
    displayPrefix: "거래방법(직거래/택배/고택) :",
    re: /(?:^|\n)\s*[-_＿–—]?\s*거래\s*방법\s*(?:\([^)]+\))?\s*[:\uFF1A]\s*([^\n]+)/im
  }
];

function normalizeValue(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** innerText 등에서 줄바꿈은 유지하고, 가로 공백만 정리 */
export function normalizeCafeArticleWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 닉네임·연락처 등 폼 잡항목 줄 제거(본문 줄 단위) */
export function shouldDropCafeNoiseLine(trimmed: string): boolean {
  if (!trimmed) return true;
  if (/^[-_＿–—]\s*닉네임\b/i.test(trimmed)) return true;
  if (/^[-_＿–—]\s*나이\b/i.test(trimmed)) return true;
  if (/^[-_＿–—]\s*연락처\b/i.test(trimmed)) return true;
  if (/^[-_＿–—]\s*물생활\b/i.test(trimmed)) return true;
  if (/^[-_＿–—]?\s*사진\b/i.test(trimmed) && !/^[-_＿–—]?\s*사진\s*\([^)]*\)\s*\S/i.test(trimmed)) return true;
  if (/^닉네임\s*(\([^)]*\))?\s*[:\uFF1A]/i.test(trimmed)) return true;
  if (/^연락처\s*[:\uFF1A]/i.test(trimmed)) return true;
  if (/^나이\s*[:\uFF1A]/i.test(trimmed)) return true;
  return false;
}

/** `- 사진(…등록) 본문` → 설명만 남김 */
function unwrapPhotoRequirementLine(line: string): string {
  const t = line.trim();
  const m = t.match(/^[-_＿–—]?\s*사진\s*\([^)]*\)\s*(.+)$/i);
  return m?.[1]?.trim() ? m[1].trim() : line;
}

export function filterCafeSnippetNoiseLines(text: string): string {
  return text
    .split("\n")
    .map((l) => unwrapPhotoRequirementLine(l))
    .map((l) => l.trimEnd())
    .filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (shouldDropCafeNoiseLine(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 폼 필드 줄·공지를 뺀 뒤 남는 본문(줄바꿈 유지) */
function extractMultilineExtraAfterFormFields(formSlice: string): string {
  let work = formSlice;
  for (const def of CAFE_CARD_FORM_ROWS) {
    work = work.replace(def.re, "\n");
  }
  work = work.replace(FIELD_RES[2]!.re, "\n");
  const lines = work
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (isBoilerplateLine(t)) return false;
      if (shouldDropCafeNoiseLine(t)) return false;
      if (
        /^[-_＿–—]?\s*(지역|분양\s*대상|물생활|희망|(?:사착|사육)|거래\s*방법|닉네임|나이|연락처|사진)\b/i.test(
          t
        )
      ) {
        return false;
      }
      return true;
    });
  return lines.join("\n").trim();
}

/** 사진 아래 블록에 다시 나오는 폼 항목 줄 제거(머리말과 중복 방지) */
function stripDuplicateFormFieldLinesInTail(tail: string): string {
  return tail
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^[-_＿–—]?\s*지역\s*\(시\/구\/동\)/i.test(t)) return false;
      if (/^지역\s*\(시\/구\/동\)\s*:/i.test(t)) return false;
      if (/^[-_＿–—]?\s*분양\s*대상/i.test(t)) return false;
      if (/^분양\s*대상\s*\(풀네임\)\s*:/i.test(t)) return false;
      if (/^[-_＿–—]?\s*희망\s*분양가/i.test(t)) return false;
      if (/^희망분양가\s*:/i.test(t)) return false;
      if (/^[-_＿–—]?\s*거래\s*방법/i.test(t)) return false;
      if (/^거래방법\s*\(/i.test(t)) return false;
      if (/^[-_＿–—]?\s*물생활/i.test(t)) return false;
      if (/^[-_＿–—]?\s*(?:사착|사육)\s*및\s*파손보장/i.test(t)) return false;
      if (/^사착\s*및\s*파손보장/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

export function composeCafeCardDisplaySnippet(
  fullBody: string | null,
  afterImageBody: string | null
): string | null {
  const full = normalizeCafeArticleWhitespace(splitCafeDashInlineFormLabels(fullBody ?? ""));
  const after = normalizeCafeArticleWhitespace(splitCafeDashInlineFormLabels(afterImageBody ?? ""));
  if (!full && !after) return null;

  const fullStripped = full ? stripCafeSnippetNoise(full) : "";
  const formSlice = fullStripped ? sliceFromFormStart(fullStripped) : "";

  const headLines: string[] = [];
  for (const { displayPrefix, re } of CAFE_CARD_FORM_ROWS) {
    const m = formSlice.match(re);
    const v = m?.[1] ? normalizeValue(m[1]) : "";
    if (v) headLines.push(`${displayPrefix} ${v}`.replace(/\s+/g, " ").trim());
  }

  let tail = "";
  if (after) {
    tail = filterCafeSnippetNoiseLines(stripCafeSnippetNoise(after));
    tail = stripDuplicateFormFieldLinesInTail(tail);
  } else if (formSlice) {
    tail = filterCafeSnippetNoiseLines(extractMultilineExtraAfterFormFields(formSlice));
  }

  const head = headLines.join("\n");
  if (!head && !tail) {
    const fromFull = fullStripped ? filterCafeSnippetNoiseLines(fullStripped) : "";
    const fromAfter = after ? filterCafeSnippetNoiseLines(stripCafeSnippetNoise(after)) : "";
    const fb = (fromFull || fromAfter).trim();
    return fb || null;
  }
  if (!head) return tail || null;
  if (!tail) return head;
  return `${head}\n\n${tail}`;
}

/** 이미 저장된 스니펫을 카드에 보여 줄 때(한 줄 폼 분해·닉네임 제거·항목별 줄바꿈) */
export function formatCafePostSnippetForCardBody(snippet: string | null): string {
  if (!snippet?.trim()) return "";
  const normalized = normalizeCafeArticleWhitespace(snippet);
  const recomposed = composeCafeCardDisplaySnippet(normalized, null);
  if (recomposed?.trim()) return recomposed.replace(/\n{3,}/g, "\n\n").trim();
  let t = normalizeCafeArticleWhitespace(stripCafeSnippetNoise(normalized));
  t = filterCafeSnippetNoiseLines(t);
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function finalizeCafeStoredSnippet(s: string): string {
  return stripCafeSnippetNoise(s).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** 카드 본문이 너무 길 때 줄 단위로 잘라 말줄임 */
export function truncateCafeCardBody(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const nl = slice.lastIndexOf("\n");
  const head = nl >= maxChars * 0.55 ? slice.slice(0, nl) : slice;
  return `${head.trimEnd()}…`;
}

/** 추출한 필드 줄·공지 줄을 제거한 뒤 남는 본문을 짧게 */
function buildExtraPreview(formSlice: string): string | null {
  let work = formSlice;
  for (const def of FIELD_RES) {
    work = work.replace(def.re, "\n");
  }
  work = work
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (isBoilerplateLine(l)) return false;
      if (/^[-_＿–—]\s*(닉네임|나이|연락처|사진)/.test(l)) return false;
      if (/^[-_＿–—]\s*지역|^[-_＿–—]\s*분양\s*대상|^[-_＿–—]\s*물생활|^[-_＿–—]\s*희망|^[-_＿–—]\s*(?:사착|사육)|^[-_＿–—]\s*거래\s*방법/.test(l)) {
        return false;
      }
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  work = stripCafeSnippetNoise(work);
  work = work.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  if (/경찰|joongna|police|사기\s*의심/i.test(work)) {
    work = work.replace(/경찰청[\s\S]*/gi, "").replace(/중고나라[\s\S]*/gi, "").replace(/\s+/g, " ").trim();
  }
  if (work.length < 12) return null;
  return work.length > 200 ? `${work.slice(0, 200)}…` : work;
}

export function plainSnippetAfterBoilerplate(snippet: string | null, maxLen = 220): string | null {
  if (!snippet?.trim()) return null;
  const sliced = sliceFromFormStart(snippet);
  const lines = sliced
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !isBoilerplateLine(l));
  let t = lines.join(" ").replace(/\s+/g, " ").trim();
  t = stripCafeSnippetNoise(t);
  if (/경찰|joongna|police|사기\s*의심|계좌번호\s*조회/i.test(t)) {
    t = t.replace(/경찰청[\s\S]*/gi, "").replace(/중고나라[\s\S]*/gi, "").replace(/\s+/g, " ").trim();
  }
  if (!t) return null;
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

/** 폼을 못 찾을 때 카드에 쓸 마지막 요약(경찰·URL 제거) */
export function aggressiveSnippetOnly(snippet: string, maxLen = 220): string | null {
  let s = stripCafeSnippetNoise(snippet).replace(/\s+/g, " ").trim();
  s = s.replace(/경찰청[\s\S]*/gi, "").replace(/중고나라[\s\S]*/gi, "").replace(/\s+/g, " ").trim();
  if (s.length < 8) return null;
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

/** 크롤 본문 스니펫에서 공지·경찰 링크 등을 빼고, 분양 폼 핵심 항목 + 나머지 일부를 만든다. */
export function parseCafeListingStructuredSummary(snippet: string | null): CafeListingStructuredSummary {
  if (!snippet?.trim()) {
    return { rows: [], extraPreview: null };
  }

  const raw = stripCafeSnippetNoise(snippet.replace(/\r\n/g, "\n").trim());
  const formSlice = sliceFromFormStart(raw);

  const rows: CafeListingSummaryRow[] = [];
  for (const { label, re } of FIELD_RES) {
    const m = formSlice.match(re);
    const v = m?.[1] ? normalizeValue(m[1]) : "";
    if (v) rows.push({ label, value: v });
  }

  const extraPreview = buildExtraPreview(formSlice);

  return { rows, extraPreview };
}
