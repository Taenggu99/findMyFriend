import { NextResponse } from "next/server";

import { importAwtisFromPublicList } from "@/lib/awtis-crawl";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  searchSDate?: string;
  searchEDate?: string;
  regionFilter?: string;
  category?: string;
  breed?: string;
  maxListPages?: number;
  maxDetails?: number;
};

/**
 * 국가동물보호정보시스템(animal.go.kr) HTML 크롤링 동기화.
 * 사이트 구조·차단에 따라 목록이 비면 `note`·`errors`를 확인하고 셀렉터·URL을 조정합니다.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const result = await importAwtisFromPublicList(prisma, {
      searchSDate: body.searchSDate,
      searchEDate: body.searchEDate,
      regionFilter: body.regionFilter ?? "",
      category: body.category ?? "",
      breed: body.breed ?? "",
      maxListPages: body.maxListPages,
      maxDetails: body.maxDetails
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
