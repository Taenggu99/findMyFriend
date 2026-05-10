import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { AWTIS_DETAIL_LABEL_HINTS, AWTIS_LIST_ROW_SELECTORS } from "@/lib/awtis-selectors";

export type AwtisListRow = {
  noticeNo: string;
  desertionNo: string | null;
  thumbnailUrl: string | null;
  status: string;
  breedLine: string;
  foundPlace: string;
  periodLine: string;
  shelterName: string;
};

export type AwtisDetailParsed = {
  noticeNo: string;
  desertionNo: string | null;
  species: string;
  breed: string;
  color: string;
  gender: string;
  neutered: string;
  feature: string;
  foundDate: Date | null;
  foundPlace: string;
  noticePeriod: string;
  shelterName: string;
  shelterAddress: string;
  shelterPhone: string;
  imageUrls: string[];
};

function absUrl(base: string, href: string | undefined): string | null {
  if (!href?.trim()) return null;
  const h = href.trim();
  if (h.startsWith("http://") || h.startsWith("https://")) return h;
  if (h.startsWith("//")) return `https:${h}`;
  try {
    return new URL(h, base).toString();
  } catch {
    return null;
  }
}

function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** 목록 검색 폼의 CSRF 토큰 (POST 필수) */
export function extractCsSignatureFromHtml(html: string): string | null {
  const m = html.match(/name="csSignature"\s+value="([^"]*)"/);
  const v = (m?.[1] ?? "").trim();
  return v || null;
}

/** 2025~ 국가동물보호정보시스템 보호동물 목록: 카드형 `ul.animals-list` */
function parseAwtisAnimalsListUl($: cheerio.CheerioAPI, listPageUrl: string): AwtisListRow[] {
  const rows: AwtisListRow[] = [];
  $("ul.animals-list > li").each((_, li) => {
    const a = $(li).find("a").first();
    if (!a.length) return;
    const on = a.attr("onclick") ?? "";
    const dm = /moveUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(on);
    const desertionNo = dm?.[1]?.trim() || null;
    const title = (a.attr("title") ?? "").trim();
    const titleNotice = /^(.+?)\s*자세히/.exec(title);
    let noticeNo = (titleNotice?.[1] ?? "").trim();
    if (!noticeNo) {
      a.find(".info-item").each((__, item) => {
        const lab = normalizeSpace($(item).find(".label").text());
        if (lab.includes("공고번호")) {
          noticeNo = normalizeSpace($(item).find(".value").text());
        }
      });
    }
    if (!noticeNo) return;

    const img = a.find("img").first().attr("src");
    const thumb = absUrl(listPageUrl, img);
    const breedLine = normalizeSpace(a.find("li.subject").first().text()) || "미상";
    let foundPlace = "";
    a.find(".info-item").each((__, item) => {
      const lab = normalizeSpace($(item).find(".label").text());
      const val = normalizeSpace($(item).find(".value").text());
      if (lab.includes("발견")) foundPlace = val;
    });
    const ym = normalizeSpace(a.find(".date span").first().text());
    const day = normalizeSpace(a.find(".date em").first().text());
    const periodLine = ym && day ? `${ym}-${day.padStart(2, "0")}` : "";

    rows.push({
      noticeNo,
      desertionNo,
      thumbnailUrl: thumb,
      status: "공고중",
      breedLine,
      foundPlace,
      periodLine,
      shelterName: ""
    });
  });
  return rows;
}

function parseAwtisListTableLegacy($: cheerio.CheerioAPI, listPageUrl: string): AwtisListRow[] {
  const rows: AwtisListRow[] = [];
  let trs: cheerio.Cheerio<AnyNode> | null = null;
  for (const sel of AWTIS_LIST_ROW_SELECTORS) {
    const found = $(sel);
    if (found.length > 0) {
      trs = found;
      break;
    }
  }
  if (!trs || trs.length === 0) {
    return rows;
  }

  trs.each((_, el) => {
    const tr = $(el);
    if (tr.find("th").length) return;
    const tds = tr.find("td");
    if (tds.length < 3) return;

    const img = tds.find("img").first();
    const thumb = absUrl(listPageUrl, img.attr("src") ?? undefined);

    const texts = tds
      .toArray()
      .map((td) => normalizeSpace($(td).text()))
      .filter(Boolean);

    const link = tr.find("a[href*='publicDtl']").first().attr("href");
    let noticeNo = "";
    let desertionNo: string | null = null;
    if (link) {
      try {
        const u = new URL(link, listPageUrl);
        noticeNo = u.searchParams.get("noticeNo") ?? u.searchParams.get("notice_no") ?? "";
        desertionNo = u.searchParams.get("desertionNo") ?? u.searchParams.get("desertion_no");
      } catch {
        /* noop */
      }
    }

    if (!noticeNo && texts[0]) {
      noticeNo = texts[0].replace(/[^\w가-힣\-]/g, "").slice(0, 64) || texts[0];
    }

    if (!noticeNo) return;

    rows.push({
      noticeNo: noticeNo.trim(),
      desertionNo,
      thumbnailUrl: thumb,
      status: texts[1] ?? "",
      breedLine: texts[2] ?? texts[1] ?? "",
      foundPlace: texts[3] ?? "",
      periodLine: texts[4] ?? "",
      shelterName: texts[texts.length - 1] ?? ""
    });
  });

  return rows;
}

/**
 * 목록 HTML에서 행 추출. 카드형 목록 → (구) 테이블 순.
 * 사이트 마크업 변경 시 `awtis-selectors.ts` / `parseAwtisAnimalsListUl` 만 조정하면 됩니다.
 */
export function parseAwtisListHtml(html: string, listPageUrl: string): AwtisListRow[] {
  const $ = cheerio.load(html);
  const fromUl = parseAwtisAnimalsListUl($, listPageUrl);
  if (fromUl.length > 0) return fromUl;
  return parseAwtisListTableLegacy($, listPageUrl);
}

/** 목록/검색 폼의 hidden `menuNo` (없으면 null) */
export function extractMenuNoFromListHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const v =
    $('input[name="menuNo"]').attr("value")?.trim() ||
    $('input[name="MENU_NO"]').attr("value")?.trim();
  return v || null;
}

function matchDetailField(label: string, hints: string[]): boolean {
  const l = label.replace(/\s/g, "");
  return hints.some((h) => l.includes(h.replace(/\s/g, "")));
}

function mapNeutered(raw: string): string {
  const s = raw.trim();
  if (/예|Y|y|중성화\s*완/.test(s)) return "O";
  if (/아니|부|N|n|미중성/.test(s)) return "X";
  return "미상";
}

function mapGender(raw: string): string {
  const s = raw.trim();
  if (s.includes("암")) return "암컷";
  if (s.includes("수")) return "수컷";
  return "미상";
}

/** 상세 HTML 파싱 (th/td 표 기준 + 이미지 수집) */
export function parseAwtisDetailHtml(html: string, pageUrl: string): Partial<AwtisDetailParsed> {
  const $ = cheerio.load(html);
  const kv: Record<string, string> = {};

  $("table").each((_, table) => {
    $(table)
      .find("tr")
      .each((__, tr) => {
        const th = $(tr).find("th").first().text();
        const td = $(tr).find("td").first().text();
        if (th && td) {
          const key = normalizeSpace(th);
          kv[key] = normalizeSpace(td);
        }
      });
  });

  const getByHints = (id: keyof typeof AWTIS_DETAIL_LABEL_HINTS): string => {
    const hints = AWTIS_DETAIL_LABEL_HINTS[id];
    for (const [k, v] of Object.entries(kv)) {
      if (matchDetailField(k, hints)) return v;
    }
    return "";
  };

  const imgs: string[] = [];
  $("img").each((_, img) => {
    const src = $(img).attr("src");
    const u = absUrl(pageUrl, src);
    if (!u) return;
    if (u.includes("fileMng") || u.includes("imageView") || u.includes("/files/shelter/")) {
      imgs.push(u);
    }
  });

  const genderRaw = getByHints("gender");
  const neutRaw = getByHints("neutered");

  let foundDate: Date | null = null;
  const fd = getByHints("foundDate");
  const m = fd.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) {
    foundDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(foundDate.getTime())) foundDate = null;
  }

  return {
    species: getByHints("species"),
    breed: getByHints("breed"),
    color: getByHints("color"),
    gender: genderRaw ? mapGender(genderRaw) : "미상",
    neutered: neutRaw ? mapNeutered(neutRaw) : "미상",
    feature: getByHints("feature"),
    foundDate,
    foundPlace: getByHints("foundPlace"),
    noticePeriod: getByHints("noticePeriod"),
    shelterName: getByHints("shelterName"),
    shelterAddress: getByHints("shelterAddr"),
    shelterPhone: getByHints("shelterTel"),
    imageUrls: [...new Set(imgs)]
  };
}
