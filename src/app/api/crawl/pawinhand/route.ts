import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { importPawinhandFromBridge } from "@/lib/pawinhand-crawl";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 포인핸드 브리지 API 동기화 (`pawinhand.net/bridge/animals/condition`).
 * 수동 또는 Cron에서 POST. 환경 변수로 시·군구·기간·페이지 상한을 조정합니다.
 */
export async function POST() {
  try {
    const result = await importPawinhandFromBridge(prisma);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
