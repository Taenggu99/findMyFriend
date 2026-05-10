import type { PrismaClient } from "@prisma/client";

import { pawinhandKrDetailUrl } from "@/lib/pawinhand-bridge";
import { SOURCE_AWTIS, SOURCE_MULTI, SOURCE_PAWINHAND } from "@/lib/source-constants";

type UpsertSourceInput = {
  animalId: number;
  sourceType: string;
  sourceUrl: string;
  sourceNoticeNo: string | null;
  sourceDesertionNo: string | null;
};

export async function upsertAnimalSource(prisma: PrismaClient, input: UpsertSourceInput) {
  await prisma.animalSource.upsert({
    where: {
      animalId_sourceType: {
        animalId: input.animalId,
        sourceType: input.sourceType
      }
    },
    create: {
      animalId: input.animalId,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      sourceNoticeNo: input.sourceNoticeNo,
      sourceDesertionNo: input.sourceDesertionNo
    },
    update: {
      sourceUrl: input.sourceUrl,
      sourceNoticeNo: input.sourceNoticeNo,
      sourceDesertionNo: input.sourceDesertionNo
    }
  });
  await refreshAnimalSourceSiteLabel(prisma, input.animalId);
}

/**
 * AWTIS를 포인핸드 행에 병합하기 직전에 호출.
 * `animal_sources`에 포인핸드 행이 없으면 `multi` 라벨·이중 링크가 나오지 않고,
 * 출처만 awtis로 덮이는 문제가 생긴다.
 */
export async function ensurePawinhandAnimalSourceForMergeTarget(
  prisma: PrismaClient,
  animal: { id: number; noticeNo: string; detailUrl: string }
) {
  const existing = await prisma.animalSource.findFirst({
    where: { animalId: animal.id, sourceType: SOURCE_PAWINHAND }
  });
  if (existing) return;

  const d = (animal.detailUrl ?? "").trim();
  const url =
    d.includes("pawinhand.kr") || d.includes("pawinhand.net") ? d : pawinhandKrDetailUrl(animal.noticeNo);

  await prisma.animalSource.create({
    data: {
      animalId: animal.id,
      sourceType: SOURCE_PAWINHAND,
      sourceUrl: url,
      sourceNoticeNo: animal.noticeNo,
      sourceDesertionNo: null
    }
  });
}

/** sources 개수에 따라 animals.source_site 라벨 갱신 (검색·배지용) */
export async function refreshAnimalSourceSiteLabel(prisma: PrismaClient, animalId: number) {
  const rows = await prisma.animalSource.findMany({
    where: { animalId },
    select: { sourceType: true }
  });
  const types = new Set(rows.map((r) => r.sourceType));
  let sourceSite: string;
  if (types.has(SOURCE_PAWINHAND) && types.has(SOURCE_AWTIS)) {
    sourceSite = SOURCE_MULTI;
  } else if (types.has(SOURCE_PAWINHAND)) {
    sourceSite = SOURCE_PAWINHAND;
  } else if (types.has(SOURCE_AWTIS)) {
    sourceSite = SOURCE_AWTIS;
  } else {
    return;
  }
  await prisma.animal.update({
    where: { id: animalId },
    data: { sourceSite }
  });
}

/** 기존 DB(소스 테이블 도입 전) 행에 출처 한 줄 백필 + 병합만 되고 포인핸드 소스가 빠진 행 복구 */
export async function backfillPawinhandSources(prisma: PrismaClient) {
  const animals = await prisma.animal.findMany({
    include: { _count: { select: { sources: true } } }
  });
  for (const a of animals) {
    if (a._count.sources > 0) continue;
    const st =
      a.sourceSite === SOURCE_AWTIS ? SOURCE_AWTIS : SOURCE_PAWINHAND;
    await prisma.animalSource.create({
      data: {
        animalId: a.id,
        sourceType: st,
        sourceUrl: a.detailUrl,
        sourceNoticeNo: a.noticeNo,
        sourceDesertionNo: null
      }
    });
  }

  const mergedMissingPawinhand = await prisma.animal.findMany({
    where: {
      AND: [
        { sources: { some: { sourceType: SOURCE_AWTIS } } },
        { NOT: { sources: { some: { sourceType: SOURCE_PAWINHAND } } } },
        {
          OR: [
            { detailUrl: { contains: "pawinhand.kr" } },
            { detailUrl: { contains: "pawinhand.net" } },
            { sourceSite: SOURCE_PAWINHAND },
            { sourceSite: SOURCE_MULTI }
          ]
        }
      ]
    },
    select: { id: true, noticeNo: true, detailUrl: true }
  });
  for (const a of mergedMissingPawinhand) {
    await ensurePawinhandAnimalSourceForMergeTarget(prisma, a);
  }

  const ids = await prisma.animalSource.findMany({
    distinct: ["animalId"],
    select: { animalId: true }
  });
  for (const { animalId } of ids) {
    await refreshAnimalSourceSiteLabel(prisma, animalId);
  }
}
