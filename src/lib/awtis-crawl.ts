import type { PrismaClient } from "@prisma/client";

import { galleryJsonFromUrls } from "@/lib/animal-images";
import { findMergeTargetForAwtis, awtisDetailUrl } from "@/lib/animal-dedupe";
import { upsertAnimalSource, ensurePawinhandAnimalSourceForMergeTarget } from "@/lib/animal-source-sync";
import { awtisPostForm, warmAwtisPublicListSession, type AwtisHttpContext } from "@/lib/awtis-http";
import {
  awtisMenuNo,
  mapBreedToKindCd,
  mapCategoryToUpKindCd,
  mapRegionToOrgCd,
  mapRegionToUprCd
} from "@/lib/awtis-params";
import {
  parseAwtisDetailHtml,
  parseAwtisListHtml,
  extractMenuNoFromListHtml,
  extractCsSignatureFromHtml,
  type AwtisListRow
} from "@/lib/awtis-parse";
import { SOURCE_AWTIS } from "@/lib/source-constants";

const AWTIS_SITE = "https://www.animal.go.kr";
const PLACEHOLDER_IMAGE = "/placeholder.svg";

export type AwtisImportOptions = {
  /** YYYY-MM-DD */
  searchSDate: string;
  searchEDate: string;
  /** 앱 검색과 동일: 시·도명 등 */
  regionFilter: string;
  category: string;
  breed: string;
  maxListPages: number;
  maxDetails: number;
};

export type AwtisImportResult = {
  ok: boolean;
  listUrl: string;
  listPagesFetched: number;
  listRowsSeen: number;
  detailsFetched: number;
  merged: number;
  created: number;
  errors: string[];
  note?: string;
};

function parseYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inferCategory(speciesLine: string, breedLine: string): string {
  const s = `${speciesLine} ${breedLine}`;
  if (s.includes("고양이") || s.includes("猫")) return "고양이";
  if (s.includes("개") || s.includes("견")) return "개";
  return "기타";
}

function inferRegionFromPlace(place: string, fallback: string): string {
  const t = place.trim();
  if (!t) return fallback;
  const parts = t.split(/\s+/);
  return parts[0] ?? fallback;
}

function parsePeriod(periodLine: string): { start: Date | null; end: Date | null } {
  const m = periodLine.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
  if (!m || m.length === 0) return { start: null, end: null };
  const parseOne = (raw: string) => {
    const p = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (!p) return null;
    const d = new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const start = parseOne(m[0]);
  const end = m[1] ? parseOne(m[1]) : null;
  return { start, end };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureShelter(
  prisma: PrismaClient,
  name: string,
  phone: string,
  address: string
) {
  const n = name.trim() || "이름 미상 보호시설";
  let s = await prisma.shelter.findFirst({ where: { name: n } });
  if (!s) {
    s = await prisma.shelter.create({
      data: {
        name: n,
        phone: (phone ?? "").trim() || "",
        address: (address ?? "").trim() || "",
        website: AWTIS_SITE
      }
    });
  }
  return s;
}

async function ingestOneRow(
  prisma: PrismaClient,
  row: AwtisListRow,
  menuNo: string,
  regionFallback: string,
  delayMs: number,
  ctx: AwtisHttpContext
): Promise<{ merged: boolean; created: boolean }> {
  const detailLink = awtisDetailUrl(row.noticeNo, row.desertionNo, menuNo);
  await sleep(delayMs);
  const detailBody = new URLSearchParams();
  detailBody.set("menuNo", menuNo);
  detailBody.set("noticeNo", row.noticeNo);
  if (row.desertionNo) detailBody.set("desertionNo", row.desertionNo);

  const dRes = await awtisPostForm(ctx, `${AWTIS_SITE}/front/awtis/public/publicDtl.do`, detailBody);
  const dHtml = await dRes.text();
  const detail = parseAwtisDetailHtml(dHtml, detailLink);

  const category = inferCategory(detail.species ?? "", detail.breed ?? row.breedLine);
  const breed = (detail.breed || row.breedLine || "").trim() || "미상";
  const foundPlace = (detail.foundPlace || row.foundPlace || "").trim();
  const foundRegion = inferRegionFromPlace(foundPlace, regionFallback);
  const foundDate = detail.foundDate ?? new Date();
  const shelterName = (detail.shelterName || row.shelterName || "").trim() || "이름 미상 보호시설";
  const shelter = await ensureShelter(
    prisma,
    shelterName,
    detail.shelterPhone ?? "",
    detail.shelterAddress ?? ""
  );

  const period = parsePeriod(detail.noticePeriod || row.periodLine);
  const featuresParts = [detail.color && `색: ${detail.color}`, detail.feature].filter(Boolean);
  const features = featuresParts.length ? featuresParts.join(" · ") : "";

  const imgs = detail.imageUrls?.length
    ? detail.imageUrls
    : row.thumbnailUrl
      ? [row.thumbnailUrl]
      : [];
  const imageUrl = imgs[0] ?? PLACEHOLDER_IMAGE;
  const imageGallery = galleryJsonFromUrls(imgs.length ? imgs : [imageUrl]);

  const mergeTarget = await findMergeTargetForAwtis(prisma, {
    noticeNo: row.noticeNo,
    shelterName,
    breed,
    foundDate,
    foundRegion,
    thumbnailUrl: imgs[0] ?? row.thumbnailUrl ?? null
  });

  if (mergeTarget) {
    await ensurePawinhandAnimalSourceForMergeTarget(prisma, {
      id: mergeTarget.id,
      noticeNo: mergeTarget.noticeNo,
      detailUrl: mergeTarget.detailUrl
    });
    await upsertAnimalSource(prisma, {
      animalId: mergeTarget.id,
      sourceType: SOURCE_AWTIS,
      sourceUrl: detailLink,
      sourceNoticeNo: row.noticeNo,
      sourceDesertionNo: row.desertionNo
    });
    return { merged: true, created: false };
  }

  const existed = await prisma.animal.findUnique({
    where: {
      sourceSite_noticeNo: {
        sourceSite: SOURCE_AWTIS,
        noticeNo: row.noticeNo
      }
    }
  });

  await prisma.animal.upsert({
    where: {
      sourceSite_noticeNo: {
        sourceSite: SOURCE_AWTIS,
        noticeNo: row.noticeNo
      }
    },
    create: {
      sourceSite: SOURCE_AWTIS,
      noticeNo: row.noticeNo,
      status: row.status?.includes("종료") ? "완료" : "공고중",
      category,
      breed,
      gender: detail.gender ?? "미상",
      neutered: detail.neutered ?? "미상",
      foundLocation: foundPlace,
      foundRegion,
      foundDate,
      noticeStartAt: period.start,
      noticeEndAt: period.end,
      features,
      imageUrl,
      imageGallery,
      detailUrl: detailLink,
      shelterId: shelter.id
    },
    update: {
      status: row.status?.includes("종료") ? "완료" : "공고중",
      category,
      breed,
      gender: detail.gender ?? "미상",
      neutered: detail.neutered ?? "미상",
      foundLocation: foundPlace,
      foundRegion,
      foundDate,
      noticeStartAt: period.start ?? undefined,
      noticeEndAt: period.end ?? undefined,
      features,
      imageUrl,
      imageGallery,
      detailUrl: detailLink,
      shelterId: shelter.id
    }
  });

  const saved = await prisma.animal.findUniqueOrThrow({
    where: { sourceSite_noticeNo: { sourceSite: SOURCE_AWTIS, noticeNo: row.noticeNo } }
  });

  await upsertAnimalSource(prisma, {
    animalId: saved.id,
    sourceType: SOURCE_AWTIS,
    sourceUrl: detailLink,
    sourceNoticeNo: row.noticeNo,
    sourceDesertionNo: row.desertionNo
  });

  return { merged: false, created: !existed };
}

function buildListSearchBody(params: {
  csSignature: string;
  menuNo: string;
  searchSDate: string;
  searchEDate: string;
  page: number;
  upr: string;
  org: string;
  upKind: string;
  kind: string;
}): URLSearchParams {
  const b = new URLSearchParams();
  b.set("csSignature", params.csSignature);
  b.set("boardId", "");
  b.set("page", String(params.page));
  b.set("pageSize", "10");
  b.set("menuNo", params.menuNo);
  b.set("searchSDate", params.searchSDate);
  b.set("searchEDate", params.searchEDate);
  b.set("searchUprCd", params.upr);
  b.set("searchOrgCd", params.org);
  b.set("searchCareRegNo", "");
  b.set("searchUpKindCd", params.upKind);
  b.set("searchKindCd", params.kind);
  b.set("searchSexCd", "");
  b.set("searchRfid", "");
  b.set("desertionNo", "");
  return b;
}

/**
 * 국가동물보호정보시스템 보호동물 목록 POST → 상세 POST 파싱 후 DB 반영.
 * 세션 쿠키·csSignature·카드형 목록(ul.animals-list) 구조에 맞춰져 있습니다.
 */
export async function importAwtisFromPublicList(
  prisma: PrismaClient,
  opts: Partial<AwtisImportOptions> = {}
): Promise<AwtisImportResult> {
  const errors: string[] = [];
  const now = new Date();
  const threeMo = new Date(now);
  threeMo.setMonth(threeMo.getMonth() - 3);

  const searchSDate = opts.searchSDate ?? parseYmd(threeMo);
  const searchEDate = opts.searchEDate ?? parseYmd(now);
  const regionFilter = opts.regionFilter ?? "";
  const category = opts.category ?? "";
  const breed = opts.breed ?? "";
  const maxListPages = opts.maxListPages ?? Math.max(1, Number(process.env.AWTIS_MAX_LIST_PAGES) || 3);
  const maxDetails = opts.maxDetails ?? Math.max(1, Number(process.env.AWTIS_MAX_DETAILS_PER_RUN) || 40);

  const listUrl = process.env.AWTIS_LIST_URL ?? `${AWTIS_SITE}/front/awtis/public/publicList.do`;
  const envMenuLocked = Boolean(process.env.AWTIS_MENU_NO?.trim());
  const menuInit = awtisMenuNo();
  const delayMs = Math.max(0, Number(process.env.AWTIS_CRAWL_DELAY_MS) || 450);

  const upr = mapRegionToUprCd(regionFilter);
  const org = mapRegionToOrgCd(regionFilter);
  const upKind = mapCategoryToUpKindCd(category);
  const kind = mapBreedToKindCd(breed);

  let listPagesFetched = 0;
  let listRowsSeen = 0;
  let detailsFetched = 0;
  let merged = 0;
  let created = 0;
  let note: string | undefined;

  const regionFallback = regionFilter.split(/\s+/)[0] || "";

  let ctx: AwtisHttpContext;
  let lastHtml: string;
  let menuNo = menuInit;

  try {
    const warm = await warmAwtisPublicListSession(menuInit);
    ctx = warm.ctx;
    lastHtml = warm.listHtml;
    if (!envMenuLocked) {
      menuNo = extractMenuNoFromListHtml(lastHtml) ?? menuInit;
    }
    ctx.listReferer = `${AWTIS_SITE}/front/awtis/public/publicList.do?menuNo=${encodeURIComponent(menuNo)}`;
  } catch (e) {
    errors.push(`세션 초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    return {
      ok: false,
      listUrl,
      listPagesFetched: 0,
      listRowsSeen: 0,
      detailsFetched: 0,
      merged: 0,
      created: 0,
      errors,
      note: "메인(index.do) 접속 후 목록 GET 이 필요합니다. 방화벽·차단 여부를 확인하세요."
    };
  }

  for (let page = 1; page <= maxListPages; page++) {
    const cs = extractCsSignatureFromHtml(lastHtml);
    if (!cs) {
      errors.push(`목록 p${page}: csSignature 없음(HTML 만료·차단 가능)`);
      break;
    }

    const body = buildListSearchBody({
      csSignature: cs,
      menuNo,
      searchSDate,
      searchEDate,
      page,
      upr,
      org,
      upKind,
      kind
    });

    let res: Response;
    try {
      res = await awtisPostForm(ctx, listUrl, body);
    } catch (e) {
      errors.push(`목록 요청 실패 p${page}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }

    if (!res.ok) {
      errors.push(`목록 HTTP ${res.status} (p${page})`);
      break;
    }

    lastHtml = await res.text();
    listPagesFetched += 1;
    if (!envMenuLocked) {
      const extracted = extractMenuNoFromListHtml(lastHtml);
      if (extracted) menuNo = extracted;
      ctx.listReferer = `${AWTIS_SITE}/front/awtis/public/publicList.do?menuNo=${encodeURIComponent(menuNo)}`;
    }

    const rows = parseAwtisListHtml(lastHtml, listUrl);
    if (rows.length === 0) {
      if (lastHtml.includes("페이지를 찾을 수 없습니다") || res.status === 404) {
        note =
          "목록 응답이 404이거나 세션이 끊겼을 수 있습니다. animal.go.kr 정책·차단 여부를 확인하세요.";
      } else {
        note =
          "목록 HTML에서 동물 카드를 찾지 못했습니다. 사이트 마크업 변경 시 awtis-parse.ts 의 parseAwtisAnimalsListUl 을 수정하세요.";
      }
      break;
    }

    listRowsSeen += rows.length;

    for (const row of rows) {
      if (detailsFetched >= maxDetails) break;
      try {
        const r = await ingestOneRow(prisma, row, menuNo, regionFallback, delayMs, ctx);
        detailsFetched += 1;
        if (r.merged) merged += 1;
        if (r.created) created += 1;
      } catch (e) {
        errors.push(`${row.noticeNo}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (detailsFetched >= maxDetails) break;
    await sleep(delayMs);
  }

  return {
    ok: listRowsSeen > 0 || errors.length === 0,
    listUrl,
    listPagesFetched,
    listRowsSeen,
    detailsFetched,
    merged,
    created,
    errors,
    note
  };
}
