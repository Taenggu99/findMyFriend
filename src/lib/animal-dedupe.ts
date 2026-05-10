import type { Animal, PrismaClient } from "@prisma/client";

import { parseAnimalImageGalleryJson } from "@/lib/animal-images";
import { SOURCE_PAWINHAND } from "@/lib/source-constants";

export type AwtisDedupeInput = {
  noticeNo: string;
  shelterName: string;
  breed: string;
  foundDate: Date;
  foundRegion: string;
  /** 목록 썸네일 또는 상세 첫 이미지 — URL 정규화 일치 시 포인핸드 행과 병합(3순위) */
  thumbnailUrl?: string | null;
};

function normalizeShelter(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** 이미지 URL을 파일 경로·쿼리 `f` 기준 키로 줄여 비교 (픽셀 유사도는 비용상 생략) */
export function normalizeAwtisImageKey(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url, "https://www.animal.go.kr");
    const f = u.searchParams.get("f");
    if (f) return f.replace(/^\/+/, "").toLowerCase();
    const last = u.pathname.split("/").pop() ?? "";
    if (/\.(jpe?g|png|gif|webp)$/i.test(last)) return decodeURIComponent(last).toLowerCase();
    return u.pathname.replace(/^\/+/, "").toLowerCase();
  } catch {
    return null;
  }
}

function imageKeysForStoredAnimal(a: { imageUrl: string; imageGallery: string }): string[] {
  const urls = parseAnimalImageGalleryJson(a.imageGallery, a.imageUrl);
  const keys = new Set<string>();
  for (const raw of urls) {
    const k = normalizeAwtisImageKey(raw);
    if (k) keys.add(k);
  }
  return [...keys];
}

/** AWTIS 수집 행과 기존 Animal 병합 후보 (우선순위: 공고번호 → 보호소+품종+일자+지역 → 대표 이미지 URL 일치) */
export async function findMergeTargetForAwtis(
  prisma: PrismaClient,
  input: AwtisDedupeInput
): Promise<Animal | null> {
  const n = input.noticeNo.trim();
  if (n) {
    const byNotice = await prisma.animal.findFirst({
      where: {
        OR: [
          { noticeNo: n },
          {
            sources: {
              some: {
                OR: [{ sourceNoticeNo: n }, { sourceNoticeNo: { contains: n } }]
              }
            }
          }
        ]
      }
    });
    if (byNotice) return byNotice;
  }

  const sn = normalizeShelter(input.shelterName);
  const dayBefore = new Date(input.foundDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(input.foundDate);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const breedNeedle = input.breed.trim().slice(0, 12) || input.breed.trim();
  const regionHint = input.foundRegion.trim().slice(0, 4);

  const candidates = await prisma.animal.findMany({
    where: {
      foundDate: { gte: dayBefore, lte: dayAfter },
      ...(breedNeedle ? { breed: { contains: breedNeedle } } : {}),
      ...(regionHint ? { foundRegion: { contains: regionHint } } : {}),
      OR: [
        { sources: { some: { sourceType: SOURCE_PAWINHAND } } },
        { sourceSite: SOURCE_PAWINHAND }
      ]
    },
    include: { shelter: true },
    take: 12
  });

  for (const a of candidates) {
    if (normalizeShelter(a.shelter.name) === sn) return a;
  }

  const imgKey = normalizeAwtisImageKey(input.thumbnailUrl);
  if (imgKey) {
    const loose = await prisma.animal.findMany({
      where: {
        foundDate: { gte: dayBefore, lte: dayAfter },
        ...(regionHint ? { foundRegion: { contains: regionHint } } : {}),
        OR: [
          { sources: { some: { sourceType: SOURCE_PAWINHAND } } },
          { sourceSite: SOURCE_PAWINHAND }
        ]
      },
      take: 80
    });
    for (const a of loose) {
      for (const k of imageKeysForStoredAnimal(a)) {
        if (k === imgKey || k.endsWith(imgKey) || imgKey.endsWith(k)) return a;
      }
    }
  }

  return null;
}

export function awtisDetailUrl(noticeNo: string, desertionNo: string | null, menuNo: string): string {
  const p = new URLSearchParams();
  p.set("menuNo", menuNo);
  p.set("noticeNo", noticeNo);
  if (desertionNo) p.set("desertionNo", desertionNo);
  return `https://www.animal.go.kr/front/awtis/public/publicDtl.do?${p.toString()}`;
}
