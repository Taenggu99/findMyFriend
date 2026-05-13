type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string };
};

export type DiscordWebhookBody = {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Discord 웹훅 `avatar_url`은 http(s)만 허용.
 * .env에 `...AVATAR_URL=https://...` 전체가 값으로 붙은 경우 등은 https:// 이후만 추출한다.
 */
export function normalizeWebhookAvatarUrl(raw: string | undefined): string | undefined {
  let s = raw?.trim();
  if (!s) return undefined;

  const lower = s.toLowerCase();
  const keyNoise = "discord_webhook_avatar_url=";
  if (lower.includes(keyNoise)) {
    const idx = lower.indexOf(keyNoise);
    s = s.slice(idx + keyNoise.length).trim();
  }

  const fromHttp = s.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  const candidate = fromHttp ?? s;

  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

/** Discord 웹훅 username은 최대 80자 */
export function normalizeWebhookUsername(raw: string | undefined): string | undefined {
  const s = raw?.trim().replace(/\s+/g, " ");
  if (!s) return undefined;
  return s.length > 80 ? s.slice(0, 80) : s;
}

export async function postDiscordWebhook(
  webhookUrl: string,
  body: DiscordWebhookBody
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, error: `HTTP ${response.status}: ${truncate(text, 180)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function buildMatchAlertDiscordBody(options: {
  displayLabel: string;
  matchLines: string[];
}): DiscordWebhookBody {
  const description =
    options.matchLines.length > 0
      ? truncate(options.matchLines.join("\n"), 3800)
      : "매칭된 공고가 없습니다.";

  return {
    embeds: [
      {
        title: "findMyFriend · 알림 매칭",
        description: `**${truncate(options.displayLabel, 80)}**\n\n${description}`,
        color: 0x5865f2
      }
    ]
  };
}

export type DiscordMatchAnimalLine = {
  noticeNo: string;
  breed: string;
  category: string;
  gender: string;
  neutered: string;
  foundDateLabel: string;
  foundRegion: string;
  imageUrl: string;
  detailLine: string;
};

function isHttpImageUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

/** 중성화 표기: O → o, X → x (Discord 미리보기용) */
function formatNeuteredLine(n: string): string {
  if (n === "O") return "o";
  if (n === "X") return "x";
  return n;
}

/** 헤더 1개 + 동물당 임베드(제목 없음·썸네일). Discord 최대 10개 임베드. */
export function buildMatchAlertDiscordEmbeds(options: {
  displayLabel: string;
  matches: DiscordMatchAnimalLine[];
}): DiscordWebhookBody {
  const header: DiscordEmbed = {
    title: "findMyFriend · 알림 매칭",
    description: truncate(
      `**${options.displayLabel}**\n70점 이상 **${options.matches.length}**건`,
      350
    ),
    color: 0x5865f2
  };

  const animalEmbeds: DiscordEmbed[] = options.matches.slice(0, 9).map((m) => {
    const photo = isHttpImageUrl(m.imageUrl) ? { url: m.imageUrl } : undefined;
    const desc = [
      `**[${m.category}] ${m.breed}**`,
      `성별 ${m.gender} / 중성화 ${formatNeuteredLine(m.neutered)}`,
      `발견날짜 · ${m.foundDateLabel}`,
      `발견지역 · ${m.foundRegion}`,
      `공고번호 ${m.noticeNo}`,
      m.detailLine ? `링크 · ${m.detailLine}` : ""
    ]
      .filter((line) => line !== "")
      .join("\n");

    return {
      description: truncate(desc, 1800),
      color: 0x57f287,
      thumbnail: photo
    };
  });

  return {
    embeds: [header, ...animalEmbeds]
  };
}

export function buildCafePostDiscordBody(
  post: {
    title: string;
    url: string;
    boardLabel: string;
    postKind: string;
    titleRegion: string | null;
    tradeStatus: string | null;
    contentSnippet: string | null;
  },
  alertLabel?: string | null
): DiscordWebhookBody {
  const kindLine =
    post.postKind === "sharing"
      ? "**유형** 나눔·책임분양 게시판 톤"
      : "**유형** 장터·분양 게시판 톤";

  const bits = [
    `**게시판** ${post.boardLabel}`,
    kindLine,
    post.titleRegion ? `**지역(제목)** ${post.titleRegion}` : null,
    post.tradeStatus ? `**상태·표기(제목)** ${post.tradeStatus}` : null,
    post.contentSnippet ? `\n**본문 일부**\n${truncate(post.contentSnippet, 480)}` : null
  ].filter(Boolean);

  return {
    username: "findMyFriend · 카페",
    embeds: [
      {
        title: truncate(post.title, 240),
        url: post.url,
        description: bits.join("\n"),
        color: 0xc17a3a,
        footer: alertLabel ? { text: truncate(`알림 조건: ${alertLabel}`, 200) } : undefined
      }
    ]
  };
}
