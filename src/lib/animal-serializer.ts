import type { Animal, AnimalSource, Shelter } from "@prisma/client";

type AnimalRecord = Animal & {
  shelter: Shelter;
  sources?: AnimalSource[];
};

export function serializeAnimal(animal: AnimalRecord) {
  const { sources, ...rest } = animal;
  return {
    ...rest,
    foundDate: animal.foundDate.toISOString(),
    noticeStartAt: animal.noticeStartAt?.toISOString() ?? null,
    noticeEndAt: animal.noticeEndAt?.toISOString() ?? null,
    createdAt: animal.createdAt.toISOString(),
    updatedAt: animal.updatedAt.toISOString(),
    sources: (sources ?? []).map((s) => ({
      sourceType: s.sourceType,
      sourceUrl: s.sourceUrl,
      sourceNoticeNo: s.sourceNoticeNo,
      sourceDesertionNo: s.sourceDesertionNo
    }))
  };
}
