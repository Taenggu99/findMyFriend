import { NextRequest, NextResponse } from "next/server";

import { runAlertMatchAndDiscord } from "@/lib/alert-match-discord";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Body = {
  subscriberKey?: string;
  alertLabel?: string;
  category?: string;
  breed?: string;
  region?: string;
  gender?: string;
  neutered?: string;
  featureKeywords?: string;
};

function clean(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function getUserId(subscriberKey: string | null): Promise<number | null> {
  if (!subscriberKey) return null;
  const user = await prisma.user.findUnique({
    where: { subscriberKey },
    select: { id: true }
  });
  return user?.id ?? null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await context.params;
  const alertId = Number(idParam);
  if (!Number.isFinite(alertId)) {
    return NextResponse.json({ message: "잘못된 알림 ID입니다." }, { status: 400 });
  }

  const payload = (await request.json()) as Body;
  const subscriberKey = clean(payload.subscriberKey);
  if (!subscriberKey) {
    return NextResponse.json({ message: "구독 식별 정보가 없습니다." }, { status: 400 });
  }

  const userId = await getUserId(subscriberKey);
  if (userId === null) {
    return NextResponse.json({ message: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  const existing = await prisma.userAlert.findFirst({
    where: { id: alertId, userId }
  });

  if (!existing) {
    return NextResponse.json({ message: "알림 조건을 찾을 수 없습니다." }, { status: 404 });
  }

  const alert = await prisma.userAlert.update({
    where: { id: alertId },
    data: {
      label: clean(payload.alertLabel),
      category: clean(payload.category),
      breed: clean(payload.breed),
      region: clean(payload.region),
      gender: clean(payload.gender),
      neutered: clean(payload.neutered),
      featureKeywords: clean(payload.featureKeywords) ?? ""
    }
  });

  const { matches, discord } = await runAlertMatchAndDiscord(
    prisma,
    userId,
    subscriberKey,
    alert
  );

  return NextResponse.json({ alert, matches, discord });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await context.params;
  const alertId = Number(idParam);
  if (!Number.isFinite(alertId)) {
    return NextResponse.json({ message: "잘못된 알림 ID입니다." }, { status: 400 });
  }

  let subscriberKey: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Body;
    subscriberKey = clean(body.subscriberKey);
  } else {
    subscriberKey = clean(request.nextUrl.searchParams.get("subscriberKey") ?? undefined);
  }

  if (!subscriberKey) {
    return NextResponse.json({ message: "구독 식별 정보가 없습니다." }, { status: 400 });
  }

  const userId = await getUserId(subscriberKey);
  if (userId === null) {
    return NextResponse.json({ message: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  const existing = await prisma.userAlert.findFirst({
    where: { id: alertId, userId }
  });

  if (!existing) {
    return NextResponse.json({ message: "알림 조건을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.userAlert.delete({
    where: { id: alertId }
  });

  return NextResponse.json({ ok: true });
}
