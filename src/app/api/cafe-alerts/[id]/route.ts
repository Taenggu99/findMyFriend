import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function clean(value?: string | null) {
  const t = value?.trim();
  return t ? t : null;
}

export async function DELETE(request: NextRequest, ctx: Params) {
  const { id } = await ctx.params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) {
    return NextResponse.json({ message: "잘못된 id" }, { status: 400 });
  }

  const subscriberKey = clean(request.nextUrl.searchParams.get("subscriberKey"));
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
