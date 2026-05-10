/**
 * 알림 조건 저장·매칭 API. 매칭이 있으면 Discord Incoming Webhook으로 전송(썸네일 포함).
 */
import { NextRequest, NextResponse } from "next/server";

import { runAlertMatchAndDiscord } from "@/lib/alert-match-discord";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type AlertPayload = {
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

export async function GET(request: NextRequest) {
  const subscriberKey = request.nextUrl.searchParams.get("subscriberKey")?.trim();
  if (!subscriberKey) {
    return NextResponse.json({ alerts: [] });
  }

  const user = await prisma.user.findUnique({
    where: { subscriberKey },
    select: { id: true }
  });

  if (!user) {
    return NextResponse.json({ alerts: [] });
  }

  const alerts = await prisma.userAlert.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as AlertPayload;
  const subscriberKey = clean(payload.subscriberKey);

  if (!subscriberKey) {
    return NextResponse.json(
      { message: "구독 식별 정보가 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." },
      { status: 400 }
    );
  }

  const user = await prisma.user.upsert({
    where: { subscriberKey },
    update: {},
    create: {
      subscriberKey,
      password: null
    }
  });

  const alert = await prisma.userAlert.create({
    data: {
      userId: user.id,
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
    user.id,
    subscriberKey,
    alert
  );

  return NextResponse.json(
    {
      alert,
      matches,
      discord
    },
    { status: 201 }
  );
}
