import type { PrismaClient, UserAlert } from "@prisma/client";

import { serializeAnimal } from "@/lib/animal-serializer";
import { calculateMatchScore } from "@/lib/similarity";
import { formatKoreanDate } from "@/lib/date";
import {
  buildMatchAlertDiscordEmbeds,
  normalizeWebhookAvatarUrl,
  normalizeWebhookUsername,
  postDiscordWebhook
} from "@/lib/discord-webhook";

export type AlertDiscordResult = {
  sent: boolean;
  skippedReason?: string;
  error?: string;
};

export async function runAlertMatchAndDiscord(
  prisma: PrismaClient,
  userId: number,
  subscriberKey: string,
  alert: Pick<
    UserAlert,
    | "id"
    | "label"
    | "category"
    | "breed"
    | "region"
    | "gender"
    | "neutered"
    | "featureKeywords"
  >
): Promise<{
  matches: { animal: ReturnType<typeof serializeAnimal>; score: number }[];
  discord: AlertDiscordResult;
}> {
  const animals = await prisma.animal.findMany({
    include: { shelter: true, sources: true },
    orderBy: { foundDate: "desc" }
  });

  const matches = animals
    .map((animal) => ({
      animal,
      score: calculateMatchScore(
        {
          category: alert.category,
          breed: alert.breed,
          region: alert.region,
          gender: alert.gender,
          featureKeywords: alert.featureKeywords
        },
        animal
      )
    }))
    .filter((match) => match.score >= 70)
    .sort((left, right) => right.score - left.score);

  await Promise.all(
    matches.map((match) =>
      prisma.alertLog.upsert({
        where: {
          userId_animalId: {
            userId,
            animalId: match.animal.id
          }
        },
        update: { matchedScore: match.score },
        create: {
          userId,
          animalId: match.animal.id,
          matchedScore: match.score
        }
      })
    )
  );

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  const displayLabel =
    alert.label?.trim() || `알림 #${alert.id} (${subscriberKey.slice(0, 8)}…)`;

  let discord: AlertDiscordResult = { sent: false };

  if (!webhookUrl) {
    discord = { sent: false, skippedReason: "DISCORD_WEBHOOK_URL 미설정" };
  } else if (matches.length === 0) {
    discord = { sent: false, skippedReason: "70점 이상 매칭 없음" };
  } else {
    const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";

    const lines = matches.slice(0, 9).map((m) => {
      const detailLine = appBase
        ? `${appBase}/animal/${m.animal.id}`
        : m.animal.detailUrl;
      return {
        noticeNo: m.animal.noticeNo,
        breed: m.animal.breed,
        category: m.animal.category,
        gender: m.animal.gender,
        neutered: m.animal.neutered,
        foundDateLabel: formatKoreanDate(m.animal.foundDate),
        foundRegion: m.animal.foundRegion,
        imageUrl: m.animal.imageUrl,
        detailLine
      };
    });

    const body = buildMatchAlertDiscordEmbeds({ displayLabel, matches: lines });
    const username = normalizeWebhookUsername(process.env.DISCORD_WEBHOOK_USERNAME);
    const avatarUrl = normalizeWebhookAvatarUrl(process.env.DISCORD_WEBHOOK_AVATAR_URL);

    const posted = await postDiscordWebhook(webhookUrl, {
      ...body,
      username,
      avatar_url: avatarUrl
    });

    discord = posted.ok ? { sent: true } : { sent: false, error: posted.error };
  }

  return {
    matches: matches.map((match) => ({
      animal: serializeAnimal(match.animal),
      score: match.score
    })),
    discord
  };
}
