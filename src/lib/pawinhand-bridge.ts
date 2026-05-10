/**
 * 포인핸드 앱이 쓰는 브리지 JSON API.
 * 예: https://pawinhand.net/bridge/animals/condition?city=...&offset=0&limit=20
 */
export const PAWINHAND_BRIDGE_BASE_DEFAULT = "https://pawinhand.net";

export type PawinhandBridgeAnimalRow = {
  notify_number?: string;
  notify_sdt?: string;
  notify_edt?: string;
  sex?: string;
  breeds?: string;
  species?: string;
  s_breeds?: string;
  neutral?: string;
  feature?: string;
  color?: string;
  state?: string;
  registration_date?: string;
  find_location?: string;
  shelter_name?: string;
  shelter_address?: string;
  shelter_tel?: string;
  city?: string;
  country?: string;
  image?: string | null;
  detail_url?: string | null;
};

export type BridgeQueryOptions = {
  city: string;
  country: string;
  species: string;
  breeds: string;
  state: string;
  sex: string;
  neutral: string;
  start_date: string;
  end_date: string;
  offset: number;
  limit: number;
};

function bridgeBaseUrl() {
  return (process.env.PAWINHAND_BRIDGE_BASE_URL ?? PAWINHAND_BRIDGE_BASE_DEFAULT).replace(/\/+$/, "");
}

export function buildBridgeConditionUrl(opts: BridgeQueryOptions): string {
  const params = new URLSearchParams({
    city: opts.city,
    country: opts.country,
    species: opts.species,
    breeds: opts.breeds,
    state: opts.state,
    sex: opts.sex,
    neutral: opts.neutral,
    start_date: opts.start_date,
    end_date: opts.end_date,
    offset: String(opts.offset),
    limit: String(opts.limit)
  });
  return `${bridgeBaseUrl()}/bridge/animals/condition?${params.toString()}`;
}

export function formatYmdCompact(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function parseCompactDate(yyyymmdd: string | undefined | null): Date | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const date = new Date(y, m, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

export function mapBridgeSex(code: string | undefined): string {
  if (code === "F") return "암컷";
  if (code === "M") return "수컷";
  return "미상";
}

export function mapBridgeNeutral(code: string | undefined): string {
  if (code === "Y") return "O";
  if (code === "N") return "X";
  return "미상";
}

export function mapBridgeStatus(state: string | undefined): string {
  if (!state) return "공고중";
  if (state.includes("보호중")) return "공고중";
  return "완료";
}

export function normalizePawinhandDetailUrl(notifyNumber: string, raw: string | null | undefined): string {
  const u = (raw ?? "").trim();
  if (u.startsWith("http://") || u.startsWith("https://")) {
    return u;
  }
  return `https://pawinhand.kr/shelter/animal/detail/${encodeURIComponent(notifyNumber)}`;
}

export function pickImageUrl(image: string | null | undefined, placeholder: string): string {
  const img = (image ?? "").trim();
  if (img.startsWith("http://") || img.startsWith("https://")) {
    return img;
  }
  return placeholder;
}

export async function fetchBridgeConditionPage(opts: BridgeQueryOptions): Promise<PawinhandBridgeAnimalRow[]> {
  const url = buildBridgeConditionUrl(opts);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "findMyFriend/1.0 (+MVP; pawinhand bridge sync)"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`브리지 API 실패: ${response.status} ${response.statusText} (${url})`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("브리지 API 응답이 배열이 아닙니다.");
  }

  return data as PawinhandBridgeAnimalRow[];
}
