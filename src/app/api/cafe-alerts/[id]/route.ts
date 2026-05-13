import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { cleanSubscriberOrLabel, normalizeCafeAlertWrite } from "@/lib/naver-cafe/cafe-alert-normalize";
import { countCafeMatchesForAlert } from "@/lib/naver-cafe/count-cafe-alert-matches";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type CafeUserAlertRow = {
  id: number;
  label: string | null;
  boardKeysJson: string;
  listingKind: string;
  regionsJson: string;
  keywordPhrasesJson: string;
  createdAt: Date;
};

function serialize(a: CafeUserAlertRow) {
  let boardKeys: string[] = [];
  let regions: string[] = [];
  let keywordPhrases: string[] = [];
  try {
    boardKeys = JSON.parse(a.boardKeysJson) as string[];
  } catch {
    boardKeys = [];
  }
  try {
    regions = JSON.parse(a.regionsJson) as string[];
  } catch {
    regions = [];
  }
  try {
    keywordPhrases = JSON.parse(a.keywordPhrasesJson) as string[];
  } catch {
    keywordPhrases = [];
  }
  return {
    id: a.id,
    label: a.label,
    boardKeys,
    listingKind: a.listingKind,
    regions,
    keywordPhrases,
    createdAt: a.createdAt.toISOString()
  };
}

type PatchBody = {
  subscriberKey?: string;
  label?: string | null;
  boardKeys?: string[];
  listingKind?: string;
  regions?: string[];
  keywordPhrases?: string[];
};

export async function PATCH(request: NextRequest, ctx: Params) {
  const { id } = await ctx.params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) {
    return NextResponse.json({ message: "잘못된 id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ message: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const subscriberKey = cleanSubscriberOrLabel(body.subscriberKey);
  if (!subscriberKey) {
    return NextResponse.json({ message: "구독 식별 정보가 없습니다." }, { status: 400 });
  }

  const norm = normalizeCafeAlertWrite(body);
  if (!norm.ok) {
    return NextResponse.json({ message: norm.message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { subscriberKey },
    select: { id: true }
  });
  if (!user) {
    return NextResponse.json({ message: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  const existing = await prisma.cafeUserAlert.findFirst({
    where: { id: alertId, userId: user.id }
  });
  if (!existing) {
    return NextResponse.json({ message: "알림을 찾을 수 없습니다." }, { status: 404 });
  }

  const { keysToSave, listingKind, regions, keywordPhrases, label } = norm.data;

  const alert = await prisma.cafeUserAlert.update({
    where: { id: alertId },
    data: {
      label,
      boardKeysJson: JSON.stringify(keysToSave),
      listingKind,
      regionsJson: JSON.stringify(regions),
      keywordPhrasesJson: JSON.stringify(keywordPhrases)
    }
  });

  const matchCount = await countCafeMatchesForAlert(prisma, alert);
  return NextResponse.json({ alert: serialize(alert), matchCount });
}

export async function DELETE(request: NextRequest, ctx: Params) {
  const { id } = await ctx.params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) {
    return NextResponse.json({ message: "잘못된 id" }, { status: 400 });
  }

  const subscriberKey = cleanSubscriberOrLabel(request.nextUrl.searchParams.get("subscriberKey"));
  if (!subscriberKey) {
    return NextResponse.json({ message: "subscriberKey가 필요합니다." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { subscriberKey },
    select: { id: true }
  });
  if (!user) {
    return NextResponse.json({ message: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  const existing = await prisma.cafeUserAlert.findFirst({
    where: { id: alertId, userId: user.id }
  });
  if (!existing) {
    return NextResponse.json({ message: "알림을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.cafeUserAlert.delete({ where: { id: alertId } });
  return NextResponse.json({ ok: true });
}
