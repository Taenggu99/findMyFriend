"use client";

import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useState
} from "react";

import { SiteNav } from "@/components/site-nav";
import { CAFE_REGION_OPTIONS } from "@/data/cafe-regions";
import { formatKoreanDate } from "@/lib/date";
import { cafeMediaIsVideoUrl } from "@/lib/naver-cafe/media-url";
import { formatCafePostSnippetForCardBody, truncateCafeCardBody } from "@/lib/naver-cafe/cafe-listing-summary";
import { tradeSaleChipLabel, stripTradeTitleDuplicatePrefix } from "@/lib/naver-cafe/trade-status-badge";

const SUBSCRIBER_KEY_STORAGE = "findmyfriend_subscriber_key";

async function readJsonBody<T>(res: Response, fallback: T): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function readOrCreateSubscriberKey(): string {
  if (typeof window === "undefined") return "";
  try {
    let key = localStorage.getItem(SUBSCRIBER_KEY_STORAGE);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(SUBSCRIBER_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return "";
  }
}

type CafeAlertRow = {
  id: number;
  label: string | null;
  boardKeys: string[];
  listingKind: string;
  regions: string[];
  keywordPhrases: string[];
  createdAt: string;
};

type CafePostSearchRow = {
  id: number;
  title: string;
  url: string;
  boardLabel: string;
  boardKey: string;
  postKind: string;
  titleRegion: string | null;
  tradeStatus: string | null;
  contentSnippet: string | null;
  thumbnailUrl: string | null;
  postedAt: string | null;
};

function deriveListingKind(includeLoveShare: boolean, includeTrade: boolean): "any" | "sharing" | "trade" {
  if (includeTrade && !includeLoveShare) return "trade";
  if (includeLoveShare && !includeTrade) return "sharing";
  return "any";
}

function collectFilterPayload(
  shareMerged: boolean,
  tradeMerged: boolean,
  regions: Record<string, boolean>,
  keywordText: string
):
  | {
      keys: string[];
      reg: string[];
      phrases: string[];
      listingKind: "any" | "sharing" | "trade";
    }
  | { error: string } {
  const includeLoveShare = shareMerged;
  const keys: string[] = [];
  if (includeLoveShare) keys.push("love_share");
  if (tradeMerged) {
    keys.push("trade_cafe", "trade_naver");
  }
  if (keys.length === 0) {
    return { error: "게시판을 하나 이상 선택해 주세요." };
  }
  const reg = CAFE_REGION_OPTIONS.filter((r) => regions[r]);
  const phrases = keywordText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    keys,
    reg,
    phrases,
    listingKind: deriveListingKind(includeLoveShare, tradeMerged)
  };
}

function CafeAdoptFilterFields({
  shareMerged,
  setShareMerged,
  tradeMerged,
  setTradeMerged,
  regions,
  setRegions,
  keywordText,
  setKeywordText
}: {
  shareMerged: boolean;
  setShareMerged: Dispatch<SetStateAction<boolean>>;
  tradeMerged: boolean;
  setTradeMerged: Dispatch<SetStateAction<boolean>>;
  regions: Record<string, boolean>;
  setRegions: Dispatch<SetStateAction<Record<string, boolean>>>;
  keywordText: string;
  setKeywordText: Dispatch<SetStateAction<string>>;
}) {
  return (
    <>
      <div className="search-form-row cols-1">
        <span className="field-label-static">게시판 (복수 선택)</span>
        <div className="cafe-board-kind-rows">
          <div className="cafe-board-kind-group" aria-label="나눔 게시판">
            <label className="cafe-board-check cafe-board-check--parallel">
              <input
                type="checkbox"
                checked={shareMerged}
                onChange={(e) => setShareMerged(e.target.checked)}
              />
              <span className="cafe-board-inline-label">사랑나눔 · 나눔책임분양</span>
            </label>
          </div>
          <div className="cafe-board-kind-group cafe-board-kind-group--trade" aria-label="분양 게시판">
            <label className="cafe-board-check cafe-board-check--parallel">
              <input
                type="checkbox"
                checked={tradeMerged}
                onChange={(e) => setTradeMerged(e.target.checked)}
              />
              <span className="cafe-board-inline-label">
                분양
                <small className="cafe-board-tone cafe-board-tone--inline">카페용 · 네이버</small>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="search-form-row cols-1">
        <span className="field-label-static">지역 (비우면 전국 · 제목의 [지역]과 비교)</span>
        <div className="cafe-region-grid cafe-region-grid--compact">
          {CAFE_REGION_OPTIONS.map((r) => (
            <label key={r} className="cafe-region-check">
              <span className="cafe-region-name">{r}</span>
              <input
                type="checkbox"
                checked={!!regions[r]}
                onChange={(e) => setRegions((prev) => ({ ...prev, [r]: e.target.checked }))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="search-form-row cols-1">
        <label className="wide">
          특징 · 키워드
          <textarea
            className="cafe-keywords-area"
            placeholder={
              "한 줄에 하나의 조건(줄마다 OR). 줄 안 띄어쓰기는 모두 포함(AND).\n검색만 할 때는 비워 두면 키워드 조건 없이 조회합니다.\n예: 안시 알풀\n디스커스"
            }
            rows={5}
            value={keywordText}
            onChange={(e) => setKeywordText(e.target.value)}
          />
        </label>
      </div>
    </>
  );
}

export function AdoptExperience() {
  const [subscriberKey, setSubscriberKey] = useState("");
  const [alerts, setAlerts] = useState<CafeAlertRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [crawlBusy, setCrawlBusy] = useState(false);
  const [crawlInfo, setCrawlInfo] = useState<string | null>(null);

  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [editingAlertId, setEditingAlertId] = useState<number | null>(null);
  const [showAddAlertForm, setShowAddAlertForm] = useState(false);
  const [label, setLabel] = useState("");
  const [shareMerged, setShareMerged] = useState(true);
  const [tradeMerged, setTradeMerged] = useState(true);
  const [regions, setRegions] = useState<Record<string, boolean>>({});
  const [keywordText, setKeywordText] = useState("");

  const [searchBusy, setSearchBusy] = useState(false);
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<CafePostSearchRow[]>([]);

  useEffect(() => {
    setSubscriberKey(readOrCreateSubscriberKey());
  }, []);

  const fetchAlerts = useCallback(async () => {
    const key = subscriberKey || readOrCreateSubscriberKey();
    if (!key) return;
    const res = await fetch(`/api/cafe-alerts?subscriberKey=${encodeURIComponent(key)}`);
    const data = await readJsonBody<{ alerts?: CafeAlertRow[]; error?: string }>(res, { alerts: [] });
    setAlerts(data.alerts ?? []);
    if (!res.ok) {
      if (data.error) {
        setMessage(`알림 목록: ${data.error}`);
      } else {
        setMessage(`알림 목록을 불러오지 못했습니다 (HTTP ${res.status}).`);
      }
    }
  }, [subscriberKey]);

  useEffect(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  function resetCafeAlertEditingState() {
    setEditingAlertId(null);
    setLabel("");
    setShowAddAlertForm(false);
  }

  function resetNewCafeAlertForm() {
    resetCafeAlertEditingState();
    setShareMerged(true);
    setTradeMerged(true);
    setRegions({});
    setKeywordText("");
  }

  function openAddCafeAlertForm() {
    setAlertMessage("");
    resetNewCafeAlertForm();
    setShowAddAlertForm(true);
  }

  function beginCafeEdit(a: CafeAlertRow) {
    setShowAddAlertForm(false);
    setEditingAlertId(a.id);
    setLabel(a.label ?? "");
    setShareMerged(a.boardKeys.includes("love_share"));
    setTradeMerged(a.boardKeys.some((k) => k === "trade_cafe" || k === "trade_naver"));
    const reg: Record<string, boolean> = {};
    for (const r of CAFE_REGION_OPTIONS) {
      reg[r] = a.regions.includes(r);
    }
    setRegions(reg);
    setKeywordText(a.keywordPhrases.join("\n"));
  }

  function openAlertModal() {
    resetCafeAlertEditingState();
    setAlertModalOpen(true);
    setAlertMessage("");
    void fetchAlerts();
  }

  function openAlertModalForEdit(a: CafeAlertRow) {
    beginCafeEdit(a);
    setAlertModalOpen(true);
    setAlertMessage("");
    void fetchAlerts();
  }

  function closeAlertModal() {
    setAlertModalOpen(false);
    setAlertMessage("");
    resetCafeAlertEditingState();
  }

  useEffect(() => {
    if (!alertModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevHtmlOs = document.documentElement.style.overscrollBehavior;
    const prevBodyOs = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOs;
      document.body.style.overscrollBehavior = prevBodyOs;
    };
  }, [alertModalOpen]);

  useEffect(() => {
    if (!alertModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeAlertModal();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertModalOpen]);

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const payload = collectFilterPayload(shareMerged, tradeMerged, regions, keywordText);
    if ("error" in payload) {
      setMessage(payload.error);
      return;
    }
    setSearchBusy(true);
    try {
      const res = await fetch("/api/cafe-posts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardKeys: payload.keys,
          listingKind: payload.listingKind,
          regions: payload.reg,
          keywordPhrases: payload.phrases
        })
      });
      const data = await readJsonBody<{ posts?: CafePostSearchRow[]; total?: number; message?: string }>(
        res,
        { posts: [], total: 0 }
      );
      if (!res.ok) {
        setMessage(data.message ?? "검색에 실패했습니다.");
        setSearchResults([]);
        setSearchTotal(null);
        return;
      }
      setSearchResults(data.posts ?? []);
      setSearchTotal(data.total ?? 0);
    } catch {
      setMessage("검색 요청 중 오류가 발생했습니다.");
      setSearchResults([]);
      setSearchTotal(null);
    } finally {
      setSearchBusy(false);
    }
  }

  async function persistCafeAlert(): Promise<boolean> {
    const key = subscriberKey || readOrCreateSubscriberKey();
    if (!key) {
      setAlertMessage("브라우저 저장소를 사용할 수 없습니다.");
      return false;
    }

    const payload = collectFilterPayload(shareMerged, tradeMerged, regions, keywordText);
    if ("error" in payload) {
      setAlertMessage(payload.error);
      return false;
    }
    if (payload.phrases.length === 0) {
      setAlertMessage("알림 저장 시에는 특징(키워드)를 한 줄 이상 입력해 주세요.");
      return false;
    }

    setAlertMessage("알림 조건을 저장하는 중입니다.");

    const id = editingAlertId;
    const url = id ? `/api/cafe-alerts/${id}` : "/api/cafe-alerts";
    const method = id ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriberKey: key,
          label: label.trim() || null,
          boardKeys: payload.keys,
          listingKind: payload.listingKind,
          regions: payload.reg,
          keywordPhrases: payload.phrases
        })
      });

      const data = await readJsonBody<{ message?: string; matchCount?: number }>(res, {});
      if (!res.ok) {
        setAlertMessage(data.message ?? "저장에 실패했습니다.");
        return false;
      }

      const matchCount = data.matchCount ?? 0;
      setAlertMessage(
        `${id ? "알림 조건을 수정했습니다." : "알림 조건을 추가했습니다."} 현재 DB에 저장된 최근 글 기준으로 약 ${matchCount}건이 조건과 일치합니다. (최대 500건까지 집계) 새 글은 크롤 후 Discord로 전송됩니다.`
      );
      if (id === null) {
        setShowAddAlertForm(false);
      }
      resetCafeAlertEditingState();
      await fetchAlerts();
      return true;
    } catch {
      setAlertMessage("저장 요청 중 오류가 발생했습니다.");
      return false;
    }
  }

  async function removeAlert(id: number) {
    if (!window.confirm("이 알림 조건을 삭제할까요?")) {
      return;
    }
    const key = subscriberKey || readOrCreateSubscriberKey();
    if (!key) {
      if (alertModalOpen) {
        setAlertMessage("구독 식별 정보를 확인할 수 없습니다.");
      } else {
        setMessage("구독 식별 정보를 확인할 수 없습니다.");
      }
      return;
    }
    try {
      const res = await fetch(
        `/api/cafe-alerts/${id}?subscriberKey=${encodeURIComponent(key)}`,
        { method: "DELETE" }
      );
      const data = await readJsonBody<{ message?: string }>(res, {});
      if (!res.ok) {
        const msg = data.message ?? "삭제에 실패했습니다.";
        if (alertModalOpen) {
          setAlertMessage(msg);
        } else {
          setMessage(msg);
        }
        return;
      }
      if (editingAlertId === id) {
        resetCafeAlertEditingState();
      }
      if (alertModalOpen) {
        setAlertMessage("알림 조건을 삭제했습니다.");
      } else {
        setMessage("알림 조건을 삭제했습니다.");
      }
      await fetchAlerts();
    } catch {
      if (alertModalOpen) {
        setAlertMessage("삭제 요청 중 오류가 발생했습니다.");
      } else {
        setMessage("삭제 요청 중 오류가 발생했습니다.");
      }
    }
  }

  async function runCrawl() {
    setCrawlBusy(true);
    setCrawlInfo(null);
    try {
      const res = await fetch("/api/crawl/naver-cafe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const data = await readJsonBody<{
        ok?: boolean;
        error?: string;
        crawl?: { posts?: unknown[]; boardErrors?: { boardKey: string; message: string }[]; note?: string };
        persist?: {
          created?: number;
          updated?: number;
          discordSent?: number;
          skippedExisting?: number;
          errors?: string[];
        };
      }>(res, {});
      if (res.status === 401) {
        setCrawlInfo("서버에 CRON_SECRET이 설정되어 있어, 브라우저 버튼으로는 호출할 수 없습니다. curl 등으로 Bearer 토큰을 넣어 POST 하세요.");
        return;
      }
      if (!res.ok || data.error) {
        setCrawlInfo(
          data.error ??
            (!res.ok
              ? `HTTP ${res.status}: 서버 응답이 비어 있거나 JSON이 아닐 수 있습니다.`
              : "크롤 요청이 실패했습니다.")
        );
        return;
      }
      const be = data.crawl?.boardErrors?.length ?? 0;
      const p = data.persist;
      setCrawlInfo(
        `신규 저장 ${p?.created ?? 0}건 · 기존 글 갱신 ${p?.updated ?? 0}건 · Discord 전송 ${p?.discordSent ?? 0}건 · 목록만·스킵 ${p?.skippedExisting ?? 0}건` +
          (be > 0 ? ` · 게시판 경고 ${be}건` : "") +
          (data.crawl?.note ? ` · ${data.crawl.note}` : "")
      );
      if (p?.errors?.length) {
        setCrawlInfo((prev) => `${prev}\n${p.errors!.slice(0, 3).join("\n")}`);
      }
    } catch {
      setCrawlInfo("크롤 요청 중 오류가 발생했습니다.");
    } finally {
      setCrawlBusy(false);
    }
  }

  return (
    <main>
      <SiteNav current="adopt" />

      <section className="hero">
        <p className="eyebrow">통합 분양 동물 탐색</p>
        <h1>네이버 카페(구피사랑) 나눔·분양 글을 조건에 맞게 Discord로 알림받습니다.</h1>
        <p>
          대상 카페:{" "}
          <a href="https://m.cafe.naver.com/ca-fe/gupilove" rel="noreferrer" target="_blank">
            m.cafe.naver.com/ca-fe/gupilove
          </a>
          . 로그인이 필요하므로 로컬에서 <code>npm run naver-cafe:login</code>으로 세션을 만든 뒤, 주기적으로{" "}
          <code>POST /api/crawl/naver-cafe</code>를 호출하세요. 아래에서 DB에 쌓인 글을 검색할 수 있습니다.
        </p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Session</p>
            <h2>네이버 로그인 세션</h2>
          </div>
        </div>
        <p className="notice">
          터미널에서 프로젝트 루트로 이동한 뒤 <code>npm run naver-cafe:login</code>을 실행합니다. 브라우저가 열리면 네이버
          로그인 후 구피사랑 카페까지 들어가 본 다음, 터미널에서 Enter로 <code>storage/naver-session.json</code>에
          저장하세요. 이 파일은 Git에 올리지 마세요.
        </p>
        <ul className="notice cafe-login-checklist">
          <li>
            <strong>필요한 것</strong>: 본인 네이버 <strong>아이디·비밀번호</strong>(또는 네이버 앱 인증 등 로그인에 쓰는
            수단). 코드나 .env에 비밀번호를 넣지 마세요. 뜨는 Chromium 창에 직접 입력합니다.
          </li>
          <li>
            <strong>2단계 인증</strong>이 켜져 있으면 로그인 시 휴대폰 승인·OTP 등이 그대로 필요합니다.
          </li>
          <li>
            <strong>카페 권한</strong>: 구피사랑이 회원 전용·가입 필요면, 그 계정으로 카페 가입이 되어 있어야 글이 보입니다.
          </li>
          <li>
            <strong>한 번만</strong>: 최초에 세션 파일을 만들고 나면, 이후 크롤은 같은 PC에서 그 파일을 읽어 자동으로
            쿠키를 씁니다. 세션 만료·로그아웃이면 스크립트를 다시 실행하세요.
          </li>
          <li>
            <strong>Playwright 브라우저</strong>: 처음이라면 <code>npx playwright install chromium</code> 을 한 번 실행하세요.
          </li>
        </ul>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Crawl</p>
            <h2>지금 한 번 수집하기</h2>
          </div>
          <button
            className="crawl-button"
            disabled={crawlBusy}
            type="button"
            onClick={() => void runCrawl()}
          >
            {crawlBusy ? "수집 중…" : "구피사랑 크롤 실행"}
          </button>
        </div>
        <p className="notice">
          서버에서 Playwright가 돌아가므로 Vercel 같은 서버리스 환경보다는 로컬·자체 호스팅에 맞습니다.{" "}
          <code>CRON_SECRET</code>을 켜 두면 이 버튼 대신{" "}
          <code>Authorization: Bearer …</code> 헤더로 같은 URL을 호출해야 합니다.
        </p>
        {crawlInfo ? <p className="notice">{crawlInfo}</p> : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Saved</p>
            <h2>저장된 카페 알림</h2>
          </div>
          <button className="alert-open-btn" type="button" onClick={openAlertModal}>
            내 알림 조건 설정하기
          </button>
        </div>
        {alerts.length === 0 ? (
          <p className="notice">아직 저장된 조건이 없습니다. 오른쪽 버튼에서 추가할 수 있습니다.</p>
        ) : (
          <ul className="cafe-alert-list">
            {alerts.map((a) => (
              <li className="cafe-alert-item" key={a.id}>
                <div>
                  <strong>{a.label ?? `알림 #${a.id}`}</strong>
                  <p className="notice">
                    유형: {a.listingKind} · 게시판: {a.boardKeys.join(", ")} · 지역:{" "}
                    {a.regions.length ? a.regions.join(", ") : "전국"} · {formatKoreanDate(new Date(a.createdAt))}
                  </p>
                  <p className="notice">키워드 줄: {a.keywordPhrases.join(" | ")}</p>
                </div>
                <div className="saved-alert-actions">
                  <button className="alert-row-btn" type="button" onClick={() => openAlertModalForEdit(a)}>
                    수정
                  </button>
                  <button className="alert-row-btn danger" type="button" onClick={() => void removeAlert(a.id)}>
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel search-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Search</p>
            <h2>카페 글 검색</h2>
          </div>
          <div className="section-heading-actions">
            <span className="total-pill">{searchTotal === null ? "—" : `${searchTotal}건`}</span>
            <button className="alert-open-btn" type="button" onClick={openAlertModal}>
              내 알림 조건 설정하기
            </button>
          </div>
        </div>

        <form className="search-form search-form-stacked" onSubmit={runSearch}>
          <CafeAdoptFilterFields
            shareMerged={shareMerged}
            setShareMerged={setShareMerged}
            tradeMerged={tradeMerged}
            setTradeMerged={setTradeMerged}
            regions={regions}
            setRegions={setRegions}
            keywordText={keywordText}
            setKeywordText={setKeywordText}
          />
          <button type="submit">{searchBusy ? "검색 중…" : "검색"}</button>
        </form>
        <p className="notice">
          결과는 로컬 DB에 크롤로 저장된 글만 대상입니다. 키워드를 비우면 게시판·지역 조건만 적용합니다.
        </p>
      </section>

      {message ? <p className="notice">{message}</p> : null}

      <section className="grid cafe-post-grid" aria-label="카페 검색 결과">
        {searchResults.map((post) => {
          const saleChip =
            post.postKind === "trade"
              ? tradeSaleChipLabel({
                  postKind: post.postKind,
                  title: post.title,
                  tradeStatus: post.tradeStatus,
                  contentSnippet: post.contentSnippet
                })
              : null;
          const saleDone = saleChip === "완료";
          const displayTitle = stripTradeTitleDuplicatePrefix(post.title, post.postKind);
          const bodyText = formatCafePostSnippetForCardBody(post.contentSnippet);
          const bodyShown = truncateCafeCardBody(bodyText, 2000);
          return (
            <article className="animal-card cafe-post-card" key={post.id}>
              <div className="cafe-post-card-top">
                <div className="badges cafe-post-badges">
                  {post.postKind === "trade" ? (
                    <>
                      <span
                        className={`cafe-trade-sale-chip${saleDone ? " cafe-trade-sale-chip--done" : ""}`}
                      >
                        {saleChip}
                      </span>
                      <span className="cafe-post-kind-pill">장터.분양</span>
                    </>
                  ) : (
                    <span className="cafe-post-kind-pill">나눔.책임분양</span>
                  )}
                  {post.titleRegion ? (
                    <span className="cafe-post-region-pill">[{post.titleRegion}]</span>
                  ) : null}
                </div>
                <p className="cafe-post-uploaded-inline">
                  {post.postedAt ? (
                    <>업로드 {formatKoreanDate(new Date(post.postedAt))}</>
                  ) : (
                    <>업로드 —</>
                  )}
                </p>
              </div>
              <div className="card-body cafe-post-card-body">
                <h3 className="cafe-post-title">{displayTitle}</h3>
                {post.thumbnailUrl ? (
                  <a
                    className={`cafe-post-thumb-link${cafeMediaIsVideoUrl(post.thumbnailUrl) ? " cafe-post-thumb-link--video-fallback" : ""}`}
                    href={post.url}
                    rel="noreferrer"
                    target="_blank"
                    aria-label={`${post.title} 미디어 미리보기 — 원문으로 이동`}
                  >
                    {cafeMediaIsVideoUrl(post.thumbnailUrl) ? (
                      <div className="cafe-video-thumb-placeholder" aria-hidden>
                        <span className="cafe-video-thumb-placeholder-icon" />
                        <span className="cafe-video-thumb-placeholder-label">동영상</span>
                      </div>
                    ) : (
                      <img
                        className="cafe-post-thumb-img"
                        src={`/api/cafe-thumb?u=${encodeURIComponent(post.thumbnailUrl)}`}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                  </a>
                ) : null}
                {bodyShown.trim() ? (
                  <p className="cafe-post-snippet">{bodyShown}</p>
                ) : (
                  <p className="cafe-post-snippet cafe-post-snippet--empty">본문 요약이 없습니다.</p>
                )}
                <a className="primary-link cafe-post-link" href={post.url} rel="noreferrer" target="_blank">
                  원문 보기
                </a>
              </div>
            </article>
          );
        })}
      </section>

      {searchTotal !== null && searchTotal === 0 && !searchBusy ? (
        <p className="notice cafe-results-empty">
          조건에 맞는 글이 없습니다. 크롤을 먼저 실행했는지, 조건을 넓혀 보세요.
        </p>
      ) : null}

      {alertModalOpen ? (
        <div className="alert-modal-backdrop" role="presentation" onClick={() => closeAlertModal()}>
          <div
            className="alert-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cafe-alert-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="alert-modal-header">
              <div className="alert-modal-header-text">
                <p className="eyebrow">Alert</p>
                <h2 id="cafe-alert-modal-title">카페 알림 조건 설정</h2>
              </div>
              <button type="button" className="alert-modal-close" aria-label="알림 설정 닫기" onClick={closeAlertModal}>
                ×
              </button>
            </header>
            <div className="alert-modal-body">
              <div className="alert-panel alert-panel--modal">
                {showAddAlertForm ? (
                  <p className="alert-hint">
                    <strong>새 카페 알림</strong>만 입력합니다. 저장하면 목록으로 돌아가고, 취소하면 목록만 다시
                    보입니다. 필드는 페이지의 <strong>카페 글 검색</strong>과 같은 상태를 공유합니다. 키워드는 한 줄
                    이상 필요합니다.
                  </p>
                ) : (
                  <p className="alert-hint">
                    조건을 여러 개 저장할 수 있습니다. 각 규칙마다 <strong>알림 이름</strong>을 붙이면 목록에서 구분하기
                    쉽습니다. 아래 필드는 페이지의 <strong>카페 글 검색</strong>과 같은 상태를 공유합니다. 저장 시
                    키워드는 한 줄 이상 필요하며, 조건에 맞는 <strong>새 글</strong>이 크롤로 들어오면 Discord로 알려
                    줍니다.
                  </p>
                )}

                {!showAddAlertForm && alerts.length > 0 ? (
                  <ul className="saved-alerts-list" aria-label="저장된 카페 알림 목록">
                    {alerts.map((a) => (
                      <li
                        className={`saved-alert-item${editingAlertId === a.id ? " is-editing" : ""}`}
                        key={a.id}
                      >
                        <div
                          className={`saved-alert-top${editingAlertId === a.id ? "" : " saved-alert-top--clickable"}`}
                          role={editingAlertId === a.id ? undefined : "button"}
                          tabIndex={editingAlertId === a.id ? undefined : 0}
                          onClick={() => {
                            if (editingAlertId !== a.id) beginCafeEdit(a);
                          }}
                          onKeyDown={(e) => {
                            if (editingAlertId === a.id) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              beginCafeEdit(a);
                            }
                          }}
                        >
                          <div className="saved-alert-body">
                            <strong>{a.label?.trim() || `알림 #${a.id}`}</strong>
                            <span className="saved-alerts-meta">
                              {a.listingKind} · {a.boardKeys.join(", ")} ·{" "}
                              {a.regions.length ? a.regions.join(", ") : "전국"} ·{" "}
                              {formatKoreanDate(new Date(a.createdAt))}
                            </span>
                          </div>
                        </div>

                        {editingAlertId === a.id ? (
                          <form
                            className="search-form alert-form saved-alert-inline-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void persistCafeAlert();
                            }}
                          >
                            <div className="search-form-row cols-1">
                              <label className="wide">
                                알림 이름 <span className="optional">(선택)</span>
                                <input
                                  placeholder="예: 안시 알풀만"
                                  type="text"
                                  value={label}
                                  onChange={(e) => setLabel(e.target.value)}
                                />
                              </label>
                            </div>
                            <CafeAdoptFilterFields
                              shareMerged={shareMerged}
                              setShareMerged={setShareMerged}
                              tradeMerged={tradeMerged}
                              setTradeMerged={setTradeMerged}
                              regions={regions}
                              setRegions={setRegions}
                              keywordText={keywordText}
                              setKeywordText={setKeywordText}
                            />
                            <div className="saved-alert-inline-actions">
                              <button type="submit">저장</button>
                              <button type="button" className="alert-row-btn" onClick={() => resetCafeAlertEditingState()}>
                                취소
                              </button>
                              <button
                                type="button"
                                className="alert-row-btn danger"
                                onClick={() => void removeAlert(a.id)}
                              >
                                삭제
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="saved-alert-actions">
                            <button
                              className="alert-row-btn"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                beginCafeEdit(a);
                              }}
                            >
                              수정
                            </button>
                            <button
                              className="alert-row-btn danger"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeAlert(a.id);
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {showAddAlertForm ? (
                  <form
                    className="search-form alert-form alert-add-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void persistCafeAlert();
                    }}
                  >
                    <p className="alert-add-form-title">새 카페 알림 조건</p>
                    <div className="search-form-row cols-1">
                      <label className="wide">
                        알림 이름 <span className="optional">(선택)</span>
                        <input
                          placeholder="예: 안시 알풀만"
                          type="text"
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                        />
                      </label>
                    </div>
                    <CafeAdoptFilterFields
                      shareMerged={shareMerged}
                      setShareMerged={setShareMerged}
                      tradeMerged={tradeMerged}
                      setTradeMerged={setTradeMerged}
                      regions={regions}
                      setRegions={setRegions}
                      keywordText={keywordText}
                      setKeywordText={setKeywordText}
                    />
                    <div className="alert-add-form-actions alert-form-actions">
                      <button type="submit">저장</button>
                      <button
                        type="button"
                        className="alert-row-btn"
                        onClick={() => {
                          setShowAddAlertForm(false);
                          resetCafeAlertEditingState();
                        }}
                      >
                        취소
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="alert-add-toolbar">
                    <button
                      type="button"
                      className="alert-add-circle"
                      aria-label="카페 알림 조건 추가"
                      onClick={openAddCafeAlertForm}
                    >
                      +
                    </button>
                  </div>
                )}

                {alertMessage ? <p className="notice">{alertMessage}</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
