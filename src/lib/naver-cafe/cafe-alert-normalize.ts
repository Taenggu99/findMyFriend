import { GUPPI_LOVE_BOARDS } from "@/lib/naver-cafe/boards";

const BOARD_KEYS = new Set(GUPPI_LOVE_BOARDS.map((b) => b.key));

export function cleanSubscriberOrLabel(value?: string | null): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export type NormalizedCafeAlertWrite = {
  keysToSave: string[];
  listingKind: string;
  regions: string[];
  keywordPhrases: string[];
  label: string | null;
};

type BodySlice = {
  label?: string | null;
  boardKeys?: string[];
  listingKind?: string;
  regions?: string[];
  keywordPhrases?: string[];
};

export function normalizeCafeAlertWrite(
  body: BodySlice
): { ok: true; data: NormalizedCafeAlertWrite } | { ok: false; message: string } {
  const rawBoards = Array.isArray(body.boardKeys) ? body.boardKeys : [];
  const boardKeys = rawBoards.filter((k) => typeof k === "string" && BOARD_KEYS.has(k));
  const keysToSave = boardKeys.length > 0 ? boardKeys : GUPPI_LOVE_BOARDS.map((b) => b.key);

  const listingKindRaw = cleanSubscriberOrLabel(body.listingKind) ?? "any";
  const listingKind = ["any", "sharing", "trade"].includes(listingKindRaw) ? listingKindRaw : "any";

  const regions = Array.isArray(body.regions)
    ? body.regions.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    : [];

  const keywordPhrases = Array.isArray(body.keywordPhrases)
    ? body.keywordPhrases
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
        .map((k) => k.trim())
    : [];

  if (keywordPhrases.length === 0) {
    return { ok: false, message: "keywordPhrases가 비어 있습니다." };
  }

  return {
    ok: true,
    data: {
      keysToSave,
      listingKind,
      regions,
      keywordPhrases,
      label: cleanSubscriberOrLabel(body.label)
    }
  };
}
