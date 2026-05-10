import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { serializeAnimal } from "@/lib/animal-serializer";
import { prisma } from "@/lib/db";
import { monthsAgo } from "@/lib/date";
import { splitKeywords } from "@/lib/similarity";

export const dynamic = "force-dynamic";

function getSearchValue(request: NextRequest, key: string) {
  return request.nextUrl.searchParams.get(key)?.trim() ?? "";
}

function parseDate(value: string, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(request: NextRequest) {
  const now = new Date();
  const from = parseDate(getSearchValue(request, "from"), monthsAgo(3));
  const to = parseDate(getSearchValue(request, "to"), now);
  const region = getSearchValue(request, "region");
  const category = getSearchValue(request, "category");
  const breed = getSearchValue(request, "breed");
  const gender = getSearchValue(request, "gender");
  const neutered = getSearchValue(request, "neutered");
  const keywords = splitKeywords(getSearchValue(request, "keywords"));
  const page = Math.max(Number(getSearchValue(request, "page")) || 1, 1);
  const limit = Math.min(Math.max(Number(getSearchValue(request, "limit")) || 12, 1), 50);

  const where: Prisma.AnimalWhereInput = {
    foundDate: {
      gte: from,
      lte: to
    },
    ...(region ? { foundRegion: { contains: region } } : {}),
    ...(category ? { category } : {}),
    ...(breed ? { breed: { contains: breed } } : {}),
    ...(gender ? { gender } : {}),
    ...(neutered ? { neutered } : {}),
    ...(keywords.length > 0
      ? {
          AND: keywords.map((keyword) => ({
            features: {
              contains: keyword
            }
          }))
        }
      : {})
  };

  const [animals, total] = await prisma.$transaction([
    prisma.animal.findMany({
      where,
      include: {
        shelter: true
      },
      orderBy: {
        foundDate: "desc"
      },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.animal.count({ where })
  ]);

  return NextResponse.json({
    animals: animals.map(serializeAnimal),
    page,
    limit,
    total,
    hasMore: page * limit < total
  });
}
