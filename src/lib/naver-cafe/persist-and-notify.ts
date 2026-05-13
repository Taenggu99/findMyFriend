import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { buildCafePostDiscordBody, postDiscordWebhook } from "@/lib/discord-webhook";
import type { CrawledCafePostPayload } from "@/lib/naver-cafe/crawler";
import { naverCafeLog } from "@/lib/naver-cafe/debug-log";
import { cafeAlertMatchesPost } from "@/lib/naver-cafe/match-alert";

function cafeDiscordWebhookUrl(): string | undefined {
  return (
    process.env.DISCORD_CAFE_WEBHOOK_URL?.trim() || process.env.DISCORD_WEBHOOK_URL?.trim() || undefined
  );
}

function isListOnlyCafePayload(p: CrawledCafePostPayload): boolean {
  return p.thumbnailUrl == null && p.contentSnippet == null && p.postedAt == null;
}

export async function persistCafePostsAndNotify(
  prisma: PrismaClient,
  payloads: CrawledCafePostPayload[]
): Promise<{
  created: number;
  updated: number;
  discordSent: number;
  skippedExisting: number;
  errors: string[];
}> {
  const webhookUrl = cafeDiscordWebhookUrl();
  naverCafeLog("persist start", { payloads: payloads.length, hasWebhook: !!webhookUrl });
  let created = 0;
  let updated = 0;
  let discordSent = 0;
  let skippedExisting = 0;
  const errors: string[] = [];

  for (const p of payloads) {
    try {
      const existing = await prisma.cafeCrawledPost.findUnique({ where: { url: p.url } });
      if (existing) {
        if (isListOnlyCafePayload(p)) {
          skippedExisting++;
          continue;
        }
        const data: Prisma.CafeCrawledPostUpdateInput = {
          title: p.title,
          boardKey: p.boardKey,
          boardLabel: p.boardLabel,
          postKind: p.postKind,
          titleRegion: p.titleRegion,
          tradeStatus: p.tradeStatus
        };
        if (p.thumbnailUrl != null) data.thumbnailUrl = p.thumbnailUrl;
        if (p.contentSnippet != null) data.contentSnippet = p.contentSnippet;
        if (p.postedAt != null) data.postedAt = new Date(p.postedAt);
        await prisma.cafeCrawledPost.update({
          where: { id: existing.id },
          data
        });
        updated++;
        continue;
      }

      const post = await prisma.cafeCrawledPost.create({
        data: {
          url: p.url,
          title: p.title,
          boardKey: p.boardKey,
          boardLabel: p.boardLabel,
          postKind: p.postKind,
          titleRegion: p.titleRegion,
          tradeStatus: p.tradeStatus,
          thumbnailUrl: p.thumbnailUrl,
          contentSnippet: p.contentSnippet,
          postedAt: p.postedAt ? new Date(p.postedAt) : undefined
        }
      });
      created++;

      const alerts = await prisma.cafeUserAlert.findMany();

      for (const alert of alerts) {
        if (!cafeAlertMatchesPost(alert, post)) {
          continue;
        }

        const prior = await prisma.cafeAlertLog.findUnique({
          where: {
            userId_postId: {
              userId: alert.userId,
              postId: post.id
            }
          }
        });
        if (prior) {
          continue;
        }

        try {
          if (webhookUrl) {
            const body = buildCafePostDiscordBody(post, alert.label);
            const sent = await postDiscordWebhook(webhookUrl, body);
            if (!sent.ok) {
              errors.push(`Discord 전송 실패 (알림 ${alert.id}): ${sent.error}`);
              continue;
            }
            discordSent++;
          }

          await prisma.cafeAlertLog.create({
            data: {
              userId: alert.userId,
              alertId: alert.id,
              postId: post.id
            }
          });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            continue;
          }
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  naverCafeLog("persist done", {
    created,
    updated,
    discordSent,
    skippedExisting,
    errorCount: errors.length
  });
  if (errors.length > 0) {
    naverCafeLog("persist errors", errors);
  }

  return { created, updated, discordSent, skippedExisting, errors };
}
