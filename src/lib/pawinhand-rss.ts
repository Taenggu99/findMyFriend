/** 포인핸드 공식 유기동물 RSS (목록은 SPA가 아니라 여기서 안정적으로 가져올 수 있음) */
export const PAWINHAND_ANIMALS_RSS_URL = "https://pawinhand.kr/rss-animals.xml";

export type PawinhandRssItem = {
  title: string;
  link: string;
  shelterName: string;
  pubDate: Date;
};

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  return match?.[1]?.trim() ?? "";
}

function extractCdataDescription(block: string): string {
  const match = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i);
  return match?.[1]?.trim() ?? "";
}

function noticeNoFromDetailUrl(link: string): string {
  try {
    const path = new URL(link).pathname.replace(/\/+$/, "");
    const segment = path.split("/").filter(Boolean).at(-1);
    return segment ? decodeURIComponent(segment) : "";
  } catch {
    return "";
  }
}

/**
 * RSS 전체 텍스트에서 채널 메타와 item 목록을 파싱한다.
 */
export function parsePawinhandAnimalsRss(xml: string): {
  lastBuildDate: string | null;
  items: PawinhandRssItem[];
} {
  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i);
  const channel = channelMatch?.[1] ?? xml;
  const lastBuildDate = extractTag(channel, "lastBuildDate") || null;

  const items: PawinhandRssItem[] = [];
  const itemBlocks = channel.split("<item>").slice(1);

  for (const raw of itemBlocks) {
    const block = raw.split("</item>")[0] ?? raw;
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const shelterName = extractCdataDescription(block) || "이름 미상 보호시설";
    const pubStr = extractTag(block, "pubDate");

    if (!title || !link) continue;

    const pubDate = pubStr ? new Date(pubStr) : new Date();
    items.push({
      title,
      link,
      shelterName,
      pubDate: Number.isNaN(pubDate.getTime()) ? new Date() : pubDate
    });
  }

  return { lastBuildDate, items };
}

export function parseTitleCategoryBreed(title: string): { category: string; breed: string } {
  const match = title.match(/^\s*\[([^\]]+)\]\s*(.+?)\s*$/);
  if (!match) {
    return { category: "기타", breed: title.trim() || "미상" };
  }
  const rawCat = match[1].trim();
  const breed = match[2].trim() || "미상";
  const category = rawCat === "기타축종" ? "기타" : rawCat;
  return { category, breed };
}

/** 공고번호(경로 세그먼트) 앞부분으로 시·도 추정 */
export function inferFoundRegionFromNoticeNo(noticeNo: string): string {
  const first = noticeNo.split("-")[0]?.trim() ?? "";
  const map: Record<string, string> = {
    서울: "서울특별시",
    부산: "부산광역시",
    대구: "대구광역시",
    인천: "인천광역시",
    광주: "광주광역시",
    대전: "대전광역시",
    울산: "울산광역시",
    세종: "세종특별자치시",
    경기: "경기도",
    강원: "강원특별자치도",
    충북: "충청북도",
    충남: "충청남도",
    전북: "전북특별자치도",
    전남: "전라남도",
    경북: "경상북도",
    경남: "경상남도",
    제주: "제주특별자치도"
  };
  return map[first] ?? "미상";
}

export { noticeNoFromDetailUrl };
