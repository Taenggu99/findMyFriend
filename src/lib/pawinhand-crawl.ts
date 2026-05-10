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
  type BridgeQueryOptions,
  type PawinhandBridgeAnimalRow
} from "@/lib/pawinhand-bridge";
import { mapPawinhandRowToAppCategory } from "@/lib/pawinhand-row-category";
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

/** 시·도별로 브리지를 호출한다. `city=전체`는 빈 목록이 될 수 있어 목록을 쓴다. */
export const DEFAULT_BRIDGE_CITIES = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도"
] as const;

export const DEFAULT_BRIDGE_SPECIES = ["개", "고양이", "기타"] as const;

function parseIntEnv(key: string, defaultValue: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultValue;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

function parseEnvList(key: string, fallback: readonly string[]): string[] {
  const raw = process.env[key]?.trim();
  if (!raw) return [...fallback];
  return raw
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
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
    cities: string[];
    species: string[];
    country: string;
    breeds: string;
    limit: number;
    maxPagesPerQuery: number;
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

function getBridgeDateRange(): { start_date: string; end_date: string } {
  const lookbackMonths = parseIntEnv("PAWINHAND_BRIDGE_LOOKBACK_MONTHS", 3);
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - lookbackMonths);
  return {
    start_date: formatYmdCompact(start),
    end_date: formatYmdCompact(end)
  };
}

function getBridgeCommonFilters(): Omit<BridgeQueryOptions, "offset" | "city" | "species"> {
  const limit = Math.min(100, parseIntEnv("PAWINHAND_BRIDGE_LIMIT", 20));
  const { start_date, end_date } = getBridgeDateRange();

  return {
    country: process.env.PAWINHAND_BRIDGE_COUNTRY ?? "전체",
    breeds: process.env.PAWINHAND_BRIDGE_BREEDS ?? "전체",
    state: process.env.PAWINHAND_BRIDGE_STATE ?? "전체",
    sex: process.env.PAWINHAND_BRIDGE_SEX ?? "전체",
    neutral: process.env.PAWINHAND_BRIDGE_NEUTRAL ?? "전체",
    start_date,
    end_date,
    limit
  };
}

async function upsertBridgeRow(prisma: PrismaClient, row: PawinhandBridgeAnimalRow, errors: string[]) {
  const noticeNo = (row.notify_number ?? "").trim();
  if (!noticeNo) {
    errors.push("공고번호 없는 행 스킵");
    return;
  }

  const { category, breed } = mapPawinhandRowToAppCategory(row);

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
  } catch (e) {
    errors.push(`${noticeNo}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 전국 시·도 × 축종(개·고양이·기타)으로 브리지 API를 호출해 DB에 반영한다.
 */
export async function importPawinhandFromBridge(prisma: PrismaClient): Promise<PawinhandBridgeImportResult> {
  const errors: string[] = [];
  const common = getBridgeCommonFilters();
  const cities = parseEnvList("PAWINHAND_BRIDGE_CITIES", DEFAULT_BRIDGE_CITIES);
  const speciesList = parseEnvList("PAWINHAND_BRIDGE_SPECIES_LIST", DEFAULT_BRIDGE_SPECIES);
  const maxPagesPerQuery = parseIntEnv("PAWINHAND_BRIDGE_MAX_PAGES_PER_QUERY", 8);
  const delayMs = parseIntEnv("PAWINHAND_BRIDGE_REQUEST_DELAY_MS", 120);

  let upserted = 0;
  let itemCount = 0;
  let pages = 0;

  for (const city of cities) {
    for (const species of speciesList) {
      for (let pageIdx = 0; pageIdx < maxPagesPerQuery; pageIdx++) {
        const offset = pageIdx * common.limit;
        const opts: BridgeQueryOptions = {
          ...common,
          city,
          species,
          offset
        };

        let rows: PawinhandBridgeAnimalRow[];
        try {
          rows = await fetchBridgeConditionPage(opts);
        } catch (e) {
          errors.push(`${city}/${species} p${pageIdx}: ${e instanceof Error ? e.message : String(e)}`);
          break;
        }

        pages += 1;
        itemCount += rows.length;

        if (rows.length === 0) {
          break;
        }

        for (const row of rows) {
          const before = errors.length;
          await upsertBridgeRow(prisma, row, errors);
          if (errors.length === before) {
            upserted += 1;
          }
        }

        if (rows.length < common.limit) {
          break;
        }

        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  const { start_date, end_date } = getBridgeDateRange();

  return {
    ok: true,
    source: "bridge",
    itemCount,
    pages,
    upserted,
    errors,
    query: {
      start_date,
      end_date,
      cities,
      species: speciesList,
      country: common.country,
      breeds: common.breeds,
      limit: common.limit,
      maxPagesPerQuery
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

    const { category: rawCat, breed } = parseTitleCategoryBreed(item.title);
    const syntheticRow: PawinhandBridgeAnimalRow = {
      breeds: item.title,
      species: rawCat === "기타" ? "기타" : rawCat,
      s_breeds: breed
    };
    const { category, breed: mappedBreed } = mapPawinhandRowToAppCategory(syntheticRow);
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
          breed: mappedBreed,
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
          breed: mappedBreed,
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
