import type { Animal, Shelter } from "@prisma/client";

type AnimalRecord = Animal & {
  shelter: Shelter;
};

export function serializeAnimal(animal: AnimalRecord) {
  return {
    ...animal,
    foundDate: animal.foundDate.toISOString(),
    noticeStartAt: animal.noticeStartAt?.toISOString() ?? null,
    noticeEndAt: animal.noticeEndAt?.toISOString() ?? null,
    createdAt: animal.createdAt.toISOString(),
    updatedAt: animal.updatedAt.toISOString()
  };
}
