import type { PrismaClient } from "@prisma/client";

import {
  decodeHtmlEntities,
  fetchBridgeConditionPage,
  formatYmdCompact,
  mapBridgeNeutral,
  mapBridgeSex,
  mapBridgeStatus,
  normalizePawinhandDetailUrl,
  parseCompactDate,
  pickImageUrl,
  type BridgeQueryOptions
} from "@/lib/pawinhand-bridge";
import {
  inferFoundRegionFromNoticeNo,
  noticeNoFromDetailUrl,
  parsePawinhandAnimalsRss,
  parseTitleCategoryBreed,
  PAWINHAND_ANIMALS_RSS_URL
} from "@/lib/pawinhand-rss";

const SOURCE_SITE = "pawinhand";
const LIST_PAGE_URL = "https://pawinhand.kr/shelter/animal";
const PLACEHOLDER_IMAGE = "/placeholder.svg";

/** 브리지에서 `city=전체`·`species=전체`는 빈 목록이 되는 경우가 있어, 기본은 서울·개입니다. */
const DEFAULT_BRIDGE_CITY = "서울특별시";
const DEFAULT_BRIDGE_SPECIES = "개";

function parseIntEnv(key: string, defaultValue: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultValue;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

export type PawinhandBridgeImportResult = {
  ok: true;
  source: "bridge";
  itemCount: number;
  pages: number;
  upserted: number;
  errors: string[];
  query: {
    start_date: string;
    end_date: string;
    city: string;
    country: string;
    species: string;
    breeds: string;
    limit: number;
    maxPages: number;
  };
};

export type PawinhandRssImportResult = {
  ok: true;
  source: "rss";
  lastBuildDate: string | null;
  itemCount: number;
  upserted: number;
  errors: string[];
};

export type PawinhandImportResult = PawinhandBridgeImportResult | PawinhandRssImportResult;

function getBridgeQueryBase(): Omit<BridgeQueryOptions, "offset"> {
  const lookbackMonths = parseIntEnv("PAWINHAND_BRIDGE_LOOKBACK_MONTHS", 3);
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - lookbackMonths);

  const limit = Math.min(100, parseIntEnv("PAWINHAND_BRIDGE_LIMIT", 20));

  return {
    city: process.env.PAWINHAND_BRIDGE_CITY ?? DEFAULT_BRIDGE_CITY,
    country: process.env.PAWINHAND_BRIDGE_COUNTRY ?? "전체",
    species: process.env.PAWINHAND_BRIDGE_SPECIES ?? DEFAULT_BRIDGE_SPECIES,
    breeds: process.env.PAWINHAND_BRIDGE_BREEDS ?? "전체",
    state: process.env.PAWINHAND_BRIDGE_STATE ?? "전체",
    sex: process.env.PAWINHAND_BRIDGE_SEX ?? "전체",
    neutral: process.env.PAWINHAND_BRIDGE_NEUTRAL ?? "전체",
    start_date: formatYmdCompact(start),
    end_date: formatYmdCompact(end),
    limit
  };
}

/**
 * `pawinhand.net/bridge/animals/condition` JSON을 페이지 단위로 받아 DB에 반영한다.
 * @see https://pawinhand.net/bridge/animals/condition
 */
export async function importPawinhandFromBridge(prisma: PrismaClient): Promise<PawinhandBridgeImportResult> {
  const errors: string[] = [];
  const queryBase = getBridgeQueryBase();
  const maxPages = parseIntEnv("PAWINHAND_BRIDGE_MAX_PAGES", 100);

  let upserted = 0;
  let itemCount = 0;
  let pages = 0;

  for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
    const offset = pageIdx * queryBase.limit;
    const opts: BridgeQueryOptions = { ...queryBase, offset };

    const rows = await fetchBridgeConditionPage(opts);

    pages += 1;
    itemCount += rows.length;

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const noticeNo = (row.notify_number ?? "").trim();
      if (!noticeNo) {
        errors.push("공고번호 없는 행 스킵");
        continue;
      }

      const parsed = row.breeds ? parseTitleCategoryBreed(row.breeds) : null;
      const category = parsed?.category ?? row.species ?? "기타";
      const breed = parsed?.breed ?? row.s_breeds ?? "미상";

      const foundRegion = (row.city ?? "").trim() || inferFoundRegionFromNoticeNo(noticeNo);

      const foundDate =
        parseCompactDate(row.registration_date) ?? parseCompactDate(row.notify_sdt) ?? new Date();

      const noticeStartAt = parseCompactDate(row.notify_sdt);
      const noticeEndAt = parseCompactDate(row.notify_edt);

      const shelterName = (row.shelter_name ?? "").trim() || "이름 미상 보호시설";
      const phone = (row.shelter_tel ?? "").trim() || "-";
      const address = (row.shelter_address ?? "").trim() || "-";

      let shelter = await prisma.shelter.findFirst({
        where: { name: shelterName }
      });

      if (!shelter) {
        shelter = await prisma.shelter.create({
          data: {
            name: shelterName,
            phone,
            address,
            website: LIST_PAGE_URL
          }
        });
      }

      const findLoc = (row.find_location ?? "").trim();
      const locSuffix = [row.city, row.country].filter(Boolean).join(" ").trim();
      const foundLocation = findLoc || locSuffix || "위치 미상";

      const featureParts = [
        row.feature && decodeHtmlEntities(row.feature.trim()),
        row.color && `색: ${decodeHtmlEntities(row.color.trim())}`
      ].filter(Boolean);
      const features = featureParts.length > 0 ? featureParts.join(" · ") : "-";

      const detailUrl = normalizePawinhandDetailUrl(noticeNo, row.detail_url);
      const imageUrl = pickImageUrl(row.image, PLACEHOLDER_IMAGE);

      try {
        await prisma.animal.upsert({
          where: {
            sourceSite_noticeNo: {
              sourceSite: SOURCE_SITE,
              noticeNo
            }
          },
          create: {
            sourceSite: SOURCE_SITE,
            noticeNo,
            status: mapBridgeStatus(row.state),
            category,
            breed,
            gender: mapBridgeSex(row.sex),
            neutered: mapBridgeNeutral(row.neutral),
            foundLocation,
            foundRegion,
            foundDate,
            noticeStartAt,
            noticeEndAt,
            features,
            imageUrl,
            detailUrl,
            shelterId: shelter.id
          },
          update: {
            status: mapBridgeStatus(row.state),
            category,
            breed,
            gender: mapBridgeSex(row.sex),
            neutered: mapBridgeNeutral(row.neutral),
            foundLocation,
            foundRegion,
            foundDate,
            noticeStartAt,
            noticeEndAt,
            features,
            imageUrl,
            detailUrl,
            shelterId: shelter.id
          }
        });
        upserted += 1;
      } catch (e) {
        errors.push(`${noticeNo}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (rows.length < queryBase.limit) {
      break;
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    ok: true,
    source: "bridge",
    itemCount,
    pages,
    upserted,
    errors,
    query: {
      start_date: queryBase.start_date,
      end_date: queryBase.end_date,
      city: queryBase.city,
      country: queryBase.country,
      species: queryBase.species,
      breeds: queryBase.breeds,
      limit: queryBase.limit,
      maxPages
    }
  };
}

/**
 * 포인핸드 유기동물 RSS를 받아 DB에 반영한다. (브리지가 막힐 때 보조용)
 */
export async function importPawinhandFromRss(prisma: PrismaClient): Promise<PawinhandRssImportResult> {
  const errors: string[] = [];

  const response = await fetch(PAWINHAND_ANIMALS_RSS_URL, {
    headers: {
      "User-Agent": "findMyFriend/1.0 (+local MVP; RSS sync)"
    }
  });

  if (!response.ok) {
    throw new Error(`RSS 요청 실패: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const { lastBuildDate, items } = parsePawinhandAnimalsRss(xml);

  let upserted = 0;

  for (const item of items) {
    const noticeNo = noticeNoFromDetailUrl(item.link);
    if (!noticeNo) {
      errors.push(`공고번호 추출 실패: ${item.link}`);
      continue;
    }

    const { category, breed } = parseTitleCategoryBreed(item.title);
    const foundRegion = inferFoundRegionFromNoticeNo(noticeNo);

    let shelter = await prisma.shelter.findFirst({
      where: { name: item.shelterName }
    });

    if (!shelter) {
      shelter = await prisma.shelter.create({
        data: {
          name: item.shelterName,
          phone: "-",
          address: "-",
          website: LIST_PAGE_URL
        }
      });
    }

    try {
      await prisma.animal.upsert({
        where: {
          sourceSite_noticeNo: {
            sourceSite: SOURCE_SITE,
            noticeNo
          }
        },
        create: {
          sourceSite: SOURCE_SITE,
          noticeNo,
          status: "공고중",
          category,
          breed,
          gender: "미상",
          neutered: "미상",
          foundLocation: `${item.shelterName} (포인핸드 RSS)`,
          foundRegion,
          foundDate: item.pubDate,
          noticeStartAt: null,
          noticeEndAt: null,
          features: `${item.title} · ${item.shelterName}`,
          imageUrl: PLACEHOLDER_IMAGE,
          detailUrl: item.link,
          shelterId: shelter.id
        },
        update: {
          status: "공고중",
          category,
          breed,
          foundLocation: `${item.shelterName} (포인핸드 RSS)`,
          foundRegion,
          foundDate: item.pubDate,
          features: `${item.title} · ${item.shelterName}`,
          detailUrl: item.link,
          shelterId: shelter.id
        }
      });
      upserted += 1;
    } catch (e) {
      errors.push(`${noticeNo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    ok: true,
    source: "rss",
    lastBuildDate,
    itemCount: items.length,
    upserted,
    errors
  };
}
