"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { breedsForCategory } from "@/data/breeds-by-category";
import { formatKoreanDate, monthsAgo, toDateInputValue } from "@/lib/date";
import { SOURCE_AWTIS, SOURCE_PAWINHAND, sourceSiteLabel } from "@/lib/source-constants";
import {
  animalCategories,
  animalGenders,
  AnimalWithShelter,
  neuteredOptions
} from "@/types/animal";

type SearchState = {
  useDefaultPeriod: boolean;
  from: string;
  to: string;
  region: string;
  category: string;
  breed: string;
  gender: string;
  neutered: string;
  keywords: string;
  /** 비우면 전체; API 쿼리는 `source`로 전달 */
  dataSource: "" | typeof SOURCE_PAWINHAND | typeof SOURCE_AWTIS;
};

type SavedAlertRow = {
  id: number;
  label: string | null;
  category: string | null;
  breed: string | null;
  region: string | null;
  gender: string | null;
  neutered: string | null;
  featureKeywords: string;
  createdAt: string;
};

type AnimalResponse = {
  animals: AnimalWithShelter[];
  total: number;
  hasMore: boolean;
};

const regions = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도"
];
const limit = 9;
const SUBSCRIBER_KEY_STORAGE = "findmyfriend_subscriber_key";

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

function buildQuery(search: SearchState, page: number) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  params.set("from", search.from);
  params.set("to", search.to);
  if (search.dataSource) {
    params.set("source", search.dataSource);
  }

  Object.entries(search).forEach(([key, value]) => {
    if (
      key === "useDefaultPeriod" ||
      key === "from" ||
      key === "to" ||
      key === "dataSource"
    ) {
      return;
    }
    if (value) {
      params.set(key, String(value));
    }
  });

  return params.toString();
}

type AlertConditionFieldsProps = {
  alertLabel: string;
  setAlertLabel: (v: string) => void;
  alertCategory: string;
  setAlertCategory: (v: string) => void;
  alertBreed: string;
  setAlertBreed: (v: string) => void;
  alertRegion: string;
  setAlertRegion: (v: string) => void;
  alertGender: string;
  setAlertGender: (v: string) => void;
  alertNeutered: string;
  setAlertNeutered: (v: string) => void;
  alertKeywords: string;
  setAlertKeywords: (v: string) => void;
};

function AlertConditionFields({
  alertLabel,
  setAlertLabel,
  alertCategory,
  setAlertCategory,
  alertBreed,
  setAlertBreed,
  alertRegion,
  setAlertRegion,
  alertGender,
  setAlertGender,
  alertNeutered,
  setAlertNeutered,
  alertKeywords,
  setAlertKeywords
}: AlertConditionFieldsProps) {
  return (
    <>
      <label className="wide">
        알림 이름 <span className="optional">(이 규칙 구분용)</span>
        <input
          placeholder="예: 우리 집 말티즈"
          type="text"
          value={alertLabel}
          onChange={(e) => setAlertLabel(e.target.value)}
        />
      </label>
      <label>
        품종
        <select
          value={alertCategory}
          onChange={(event) => {
            setAlertCategory(event.target.value);
            setAlertBreed("");
          }}
        >
          <option value="">전체</option>
          {animalCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        세부 품종
        <select
          disabled={!alertCategory}
          value={alertBreed}
          onChange={(event) => setAlertBreed(event.target.value)}
        >
          <option value="">전체</option>
          {breedsForCategory(alertCategory).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label>
        지역
        <select value={alertRegion} onChange={(e) => setAlertRegion(e.target.value)}>
          <option value="">전체</option>
          {regions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </label>
      <label>
        성별
        <select value={alertGender} onChange={(e) => setAlertGender(e.target.value)}>
          <option value="">전체</option>
          {animalGenders.map((gender) => (
            <option key={gender} value={gender}>
              {gender}
            </option>
          ))}
        </select>
      </label>
      <label>
        중성화
        <select value={alertNeutered} onChange={(e) => setAlertNeutered(e.target.value)}>
          <option value="">전체</option>
          {neuteredOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="wide">
        특징
        <input
          placeholder="예: 갈색 빨간목줄"
          value={alertKeywords}
          onChange={(e) => setAlertKeywords(e.target.value)}
        />
      </label>
    </>
  );
}

export function SearchExperience() {
  const defaultSearch = useMemo(
    () => ({
      useDefaultPeriod: true,
      from: toDateInputValue(monthsAgo(3)),
      to: toDateInputValue(new Date()),
      region: "",
      category: "",
      breed: "",
      gender: "",
      neutered: "",
      keywords: "",
      dataSource: "" as const
    }),
    []
  );

  const [search, setSearch] = useState<SearchState>(defaultSearch);
  const [animals, setAnimals] = useState<AnimalWithShelter[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [crawlBusy, setCrawlBusy] = useState<null | "pawinhand" | "awtis">(null);
  const [crawlInfo, setCrawlInfo] = useState("");
  const [savedAlerts, setSavedAlerts] = useState<SavedAlertRow[]>([]);
  const [alertListTick, setAlertListTick] = useState(0);
  const [alertCategory, setAlertCategory] = useState("");
  const [alertBreed, setAlertBreed] = useState("");
  const [alertLabel, setAlertLabel] = useState("");
  const [alertRegion, setAlertRegion] = useState("");
  const [alertGender, setAlertGender] = useState("");
  const [alertNeutered, setAlertNeutered] = useState("");
  const [alertKeywords, setAlertKeywords] = useState("");
  const [editingAlertId, setEditingAlertId] = useState<number | null>(null);
  const [showAddAlertForm, setShowAddAlertForm] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const fetchAnimals = useCallback(
    async (nextPage: number, nextSearch = search) => {
      setIsLoading(true);
      setMessage("");

      try {
        const response = await fetch(`/api/animals?${buildQuery(nextSearch, nextPage)}`);
        if (!response.ok) {
          throw new Error("검색에 실패했습니다.");
        }

        const data = (await response.json()) as AnimalResponse;
        setAnimals((current) => (nextPage === 1 ? data.animals : [...current, ...data.animals]));
        setTotal(data.total);
        setHasMore(data.hasMore);
        setPage(nextPage);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "검색 중 문제가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [search]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = localStorage.getItem(SUBSCRIBER_KEY_STORAGE);
    let cancelled = false;
    if (!key) {
      queueMicrotask(() => {
        if (!cancelled) setSavedAlerts([]);
      });
      return () => {
        cancelled = true;
      };
    }
    void fetch(`/api/alerts?subscriberKey=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((d: { alerts?: SavedAlertRow[] }) => {
        if (!cancelled) setSavedAlerts(d.alerts ?? []);
      })
      .catch(() => {
        if (!cancelled) setSavedAlerts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [alertListTick]);

  useEffect(() => {
    // 최초 진입 시 서버 검색 API와 화면 상태를 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAnimals(1, defaultSearch);
  }, [defaultSearch, fetchAnimals]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || isLoading) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        void fetchAnimals(page + 1);
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchAnimals, hasMore, isLoading, page]);

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

  function resetAlertForm() {
    setEditingAlertId(null);
    setAlertLabel("");
    setAlertCategory("");
    setAlertBreed("");
    setAlertRegion("");
    setAlertGender("");
    setAlertNeutered("");
    setAlertKeywords("");
  }

  function openAddAlertForm() {
    resetAlertForm();
    setShowAddAlertForm(true);
  }

  function closeAlertModal() {
    setAlertModalOpen(false);
    setShowAddAlertForm(false);
    resetAlertForm();
  }

  function beginEdit(a: SavedAlertRow) {
    setShowAddAlertForm(false);
    setEditingAlertId(a.id);
    setAlertLabel(a.label ?? "");
    setAlertCategory(a.category ?? "");
    setAlertBreed(a.breed ?? "");
    setAlertRegion(a.region ?? "");
    setAlertGender(a.gender ?? "");
    setAlertNeutered(a.neutered ?? "");
    setAlertKeywords(a.featureKeywords ?? "");
  }

  useEffect(() => {
    if (!alertModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAlertModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closeAlertModal는 모달이 열린 동안 동일 동작만 수행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertModalOpen]);

  async function deleteAlert(id: number) {
    if (!window.confirm("이 알림 조건을 삭제할까요?")) {
      return;
    }
    const subscriberKey = readOrCreateSubscriberKey();
    if (!subscriberKey) {
      setAlertMessage("구독 ID를 확인할 수 없습니다.");
      return;
    }
    try {
      const response = await fetch(`/api/alerts/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberKey })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setAlertMessage(data.message ?? "삭제에 실패했습니다.");
        return;
      }
      if (editingAlertId === id) {
        resetAlertForm();
      }
      setAlertMessage("알림 조건을 삭제했습니다.");
      setAlertListTick((t) => t + 1);
    } catch {
      setAlertMessage("삭제 요청 중 오류가 발생했습니다.");
    }
  }

  function updateSearch(key: keyof SearchState, value: string | boolean) {
    setSearch((current) => {
      const next = { ...current, [key]: value };
      if (key === "useDefaultPeriod" && value === true) {
        next.from = toDateInputValue(monthsAgo(3));
        next.to = toDateInputValue(new Date());
      }
      if (key === "category") {
        next.breed = "";
      }
      return next;
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void fetchAnimals(1);
  }

  async function persistAlert(): Promise<boolean> {
    const subscriberKey = readOrCreateSubscriberKey();

    if (!subscriberKey) {
      setAlertMessage("이 브라우저에서 구독 ID를 만들 수 없습니다. 쿠키/저장소를 허용했는지 확인해 주세요.");
      return false;
    }

    setAlertMessage("알림 조건을 저장하는 중입니다.");

    const body = {
      subscriberKey,
      alertLabel: alertLabel.trim() || undefined,
      category: alertCategory || undefined,
      breed: alertBreed || undefined,
      region: alertRegion || undefined,
      gender: alertGender || undefined,
      neutered: alertNeutered || undefined,
      featureKeywords: alertKeywords.trim() || undefined
    };

    const id = editingAlertId;
    const url = id ? `/api/alerts/${id}` : "/api/alerts";
    const method = id ? "PATCH" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const data = (await response.json()) as {
        message?: string;
        matches?: unknown[];
        discord?: { sent: boolean; skippedReason?: string; error?: string };
      };

      if (!response.ok) {
        setAlertMessage(data.message ?? "알림 조건 저장에 실패했습니다.");
        return false;
      }

      const matchCount = data.matches?.length ?? 0;
      const discord = data.discord;

      let extra = "";
      if (discord?.sent) {
        extra = ` Discord 채널로 매칭 ${matchCount}건 요약을 보냈습니다.`;
      } else if (discord?.skippedReason === "DISCORD_WEBHOOK_URL 미설정") {
        extra = " (서버에 DISCORD_WEBHOOK_URL이 없어 Discord로는 보내지 않았습니다.)";
      } else if (discord?.skippedReason === "70점 이상 매칭 없음") {
        extra = " (70점 이상 매칭이 없어 Discord 메시지는 생략했습니다.)";
      } else if (discord?.error) {
        extra = ` Discord 전송 실패: ${discord.error}`;
      }

      setAlertMessage(
        `${id ? "알림 조건을 수정했습니다." : "알림 조건을 추가했습니다."} 현재 ${matchCount}건이 70점 이상으로 매칭되었습니다.${extra}`
      );
      if (id === null) {
        setShowAddAlertForm(false);
      }
      resetAlertForm();
      setAlertListTick((t) => t + 1);
      return true;
    } catch {
      setAlertMessage("알림 조건 저장 중 오류가 발생했습니다.");
      return false;
    }
  }

  async function runPawinhandCrawl() {
    setCrawlBusy("pawinhand");
    setCrawlInfo("");
    setMessage("");
    try {
      const response = await fetch("/api/crawl/pawinhand", { method: "POST" });
      const data = (await response.json()) as {
        ok?: boolean;
        source?: string;
        error?: string;
        upserted?: number;
        itemCount?: number;
        pages?: number;
        lastBuildDate?: string | null;
        errors?: string[];
        query?: {
          start_date: string;
          end_date: string;
          cities?: string[];
          species?: string[];
          limit: number;
          maxPagesPerQuery?: number;
        };
      };

      if (!response.ok || data.error) {
        setCrawlInfo("");
        setMessage(data.error ?? "포인핸드 동기화에 실패했습니다.");
        return;
      }

      const warn =
        data.errors && data.errors.length > 0 ? ` (일부 오류 ${data.errors.length}건)` : "";

      if (data.source === "bridge" && data.query) {
        const citiesN = data.query.cities?.length ?? 0;
        const speciesStr = (data.query.species ?? []).join(", ");
        setCrawlInfo(
          `브리지 동기화: ${data.upserted ?? 0}건 DB 반영 / 수집 ${data.itemCount ?? 0}건 (${data.pages ?? 0}요청) · 시도 ${citiesN}곳 · 축종 ${speciesStr} · ${data.query.start_date}–${data.query.end_date}${warn}`
        );
      } else {
        setCrawlInfo(
          `동기화 완료: ${data.upserted ?? 0}건 반영 / ${data.itemCount ?? 0}건 · lastBuild ${data.lastBuildDate ?? "-"}${warn}`
        );
      }
      await fetchAnimals(1);
    } catch {
      setMessage("포인핸드 동기화 요청 중 오류가 발생했습니다.");
    } finally {
      setCrawlBusy(null);
    }
  }

  async function runAwtisCrawl() {
    setCrawlBusy("awtis");
    setCrawlInfo("");
    setMessage("");
    try {
      const response = await fetch("/api/crawl/awtis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchSDate: search.from,
          searchEDate: search.to,
          regionFilter: search.region || "",
          category: search.category || "",
          breed: search.breed || ""
        })
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        listPagesFetched?: number;
        listRowsSeen?: number;
        detailsFetched?: number;
        merged?: number;
        created?: number;
        errors?: string[];
        note?: string;
      };

      if (!response.ok || data.error) {
        setCrawlInfo("");
        setMessage(data.error ?? "국가동물보호정보시스템 동기화에 실패했습니다.");
        return;
      }

      const errN = data.errors?.length ?? 0;
      const firstErr = errN > 0 ? data.errors?.[0] : "";
      const warn = errN > 0 ? ` (오류 ${errN}건${firstErr ? `: ${firstErr}` : ""})` : "";
      const note = data.note ? ` · ${data.note}` : "";
      setCrawlInfo(
        `AWTIS: 목록 ${data.listPagesFetched ?? 0}페이지 · 행 ${data.listRowsSeen ?? 0} · 상세 ${data.detailsFetched ?? 0} · 신규 ${data.created ?? 0} · 병합 ${data.merged ?? 0}${warn}${note}`
      );
      await fetchAnimals(1);
    } catch {
      setMessage("국가동물보호정보시스템 동기화 요청 중 오류가 발생했습니다.");
    } finally {
      setCrawlBusy(null);
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">통합 보호 동물 탐색</p>
        <h1>잃어버린 반려동물과 닮은 공고를 한 번에 찾아보세요.</h1>
        <p>
          검색은 <strong>로컬 DB</strong>만 조회합니다. 포인핸드는 <code>pawinhand.net</code> 브리지 JSON으로, 국가동물보호정보시스템(
          <code>animal.go.kr</code>)은 서버에서 HTML을 파싱해 DB에 반영합니다. 수집 범위는 환경 변수로 조정할 수 있고, 앱에는{" "}
          <strong>자동 주기 스케줄은 없습니다</strong> (Cron 등으로 동일 API를 주기 호출하면 됩니다).
        </p>
      </section>

      <section className="panel crawl-panel" aria-label="외부 공고 동기화">
        <p>
          <strong>포인핸드</strong> 브리지는 기본으로 17개 시·도와 축종 개·고양이·기타를 순회합니다.{" "}
          <strong>국가동물보호정보시스템</strong>은 아래 검색 폼의 기간·지역·품종 조건을 그대로 넘겨 목록·상세를 수집합니다(사이트 구조 변경 시{" "}
          <code>awtis-selectors.ts</code> 조정 필요).
        </p>
        <div className="crawl-actions crawl-actions--split">
          <button
            className="crawl-button"
            disabled={crawlBusy !== null}
            type="button"
            onClick={() => void runPawinhandCrawl()}
          >
            {crawlBusy === "pawinhand" ? "가져오는 중…" : "포인핸드 브리지 동기화"}
          </button>
          <button
            className="crawl-button crawl-button--secondary"
            disabled={crawlBusy !== null}
            type="button"
            onClick={() => void runAwtisCrawl()}
          >
            {crawlBusy === "awtis" ? "가져오는 중…" : "국가동물보호시스템 동기화"}
          </button>
        </div>
      </section>

      {crawlInfo ? <p className="notice">{crawlInfo}</p> : null}

      <section className="panel search-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Search</p>
            <h2>보호 동물 검색</h2>
          </div>
          <div className="section-heading-actions">
            <span className="total-pill">{total}건</span>
            <button
              className="alert-open-btn"
              type="button"
              onClick={() => setAlertModalOpen(true)}
            >
              내 알림 조건 설정하기
            </button>
          </div>
        </div>

        <form className="search-form search-form-stacked" onSubmit={onSubmit}>
          <div className="search-form-row">
            <label>
              시작일
              <input
                disabled={search.useDefaultPeriod}
                type="date"
                value={search.from}
                onChange={(event) => updateSearch("from", event.target.value)}
              />
            </label>
            <label>
              종료일
              <input
                disabled={search.useDefaultPeriod}
                type="date"
                value={search.to}
                onChange={(event) => updateSearch("to", event.target.value)}
              />
            </label>
            <label className="checkbox-label">
              <input
                checked={search.useDefaultPeriod}
                type="checkbox"
                onChange={(event) => updateSearch("useDefaultPeriod", event.target.checked)}
              />
              최근 3개월 기본 검색
            </label>
          </div>

          <div className="search-form-row cols-1">
            <label className="wide">
              발견 지역
              <select value={search.region} onChange={(event) => updateSearch("region", event.target.value)}>
                <option value="">전체</option>
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="search-form-row cols-2">
            <label>
              품종
              <select value={search.category} onChange={(event) => updateSearch("category", event.target.value)}>
                <option value="">전체</option>
                {animalCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              세부 품종
              <select
                disabled={!search.category}
                value={search.breed}
                onChange={(event) => updateSearch("breed", event.target.value)}
              >
                <option value="">전체</option>
                {breedsForCategory(search.category).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="search-form-row cols-2">
            <label>
              성별
              <select value={search.gender} onChange={(event) => updateSearch("gender", event.target.value)}>
                <option value="">전체</option>
                {animalGenders.map((gender) => (
                  <option key={gender} value={gender}>
                    {gender}
                  </option>
                ))}
              </select>
            </label>
            <label>
              중성화
              <select value={search.neutered} onChange={(event) => updateSearch("neutered", event.target.value)}>
                <option value="">전체</option>
                {neuteredOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="search-form-row cols-1">
            <label className="wide">
              데이터 출처
              <select
                value={search.dataSource}
                onChange={(event) =>
                  updateSearch("dataSource", event.target.value as SearchState["dataSource"])
                }
              >
                <option value="">전체</option>
                <option value={SOURCE_PAWINHAND}>포인핸드</option>
                <option value={SOURCE_AWTIS}>국가동물보호정보시스템</option>
              </select>
            </label>
          </div>

          <button type="submit">{isLoading ? "검색 중" : "검색"}</button>
        </form>
      </section>

      {message ? <p className="notice">{message}</p> : null}

      <section className="grid" aria-label="검색 결과">
        {animals.map((animal) => (
          <article className="animal-card" key={animal.id}>
            <div className="badges">
              <span>{animal.status}</span>
              <span>{animal.gender}</span>
              <span className="badge-source">{sourceSiteLabel(animal.sourceSite)}</span>
            </div>
            <Link className="image-link" href={`/animal/${animal.id}`}>
              <Image alt={`${animal.breed} 사진`} src={animal.imageUrl} width={600} height={420} unoptimized />
            </Link>
            <div className="card-body">
              <h3>
                [{animal.category}] {animal.breed} <small>(중성화 {animal.neutered})</small>
              </h3>
              <dl>
                <div>
                  <dt>공고번호</dt>
                  <dd>{animal.noticeNo}</dd>
                </div>
                <div>
                  <dt>등록날짜</dt>
                  <dd>{formatKoreanDate(animal.foundDate)}</dd>
                </div>
                <div>
                  <dt>구조장소</dt>
                  <dd>{animal.foundLocation}</dd>
                </div>
              </dl>
            </div>
          </article>
        ))}
      </section>

      <div ref={loadMoreRef} className="load-more">
        {isLoading ? "불러오는 중..." : hasMore ? "스크롤하면 더 불러옵니다." : "마지막 결과입니다."}
      </div>

      {alertModalOpen ? (
        <div className="alert-modal-backdrop" role="presentation" onClick={() => closeAlertModal()}>
          <div
            className="alert-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="alert-modal-header">
              <div className="alert-modal-header-text">
                <p className="eyebrow">Alert</p>
                <h2 id="alert-modal-title">실시간 알림 조건 설정</h2>
              </div>
              <button type="button" className="alert-modal-close" aria-label="알림 설정 닫기" onClick={closeAlertModal}>
                ×
              </button>
            </header>
            <div className="alert-modal-body">
              <div className="alert-panel alert-panel--modal">
                <p className="alert-hint">
                  조건을 여러 개 저장할 수 있습니다. 각 규칙마다 <strong>알림 이름</strong>을 붙이면 Discord에서 구분하기
                  쉽습니다. 70점 이상 매칭이 있을 때만 웹훅으로 보내며, 동물마다 <strong>사진 썸네일</strong>이 붙습니다.
                </p>

                {savedAlerts.length > 0 ? (
                  <ul className="saved-alerts-list" aria-label="저장된 알림 목록">
                    {savedAlerts.map((a) => (
                      <li
                        className={`saved-alert-item${editingAlertId === a.id ? " is-editing" : ""}`}
                        key={a.id}
                      >
                        <div
                          className={`saved-alert-top${editingAlertId === a.id ? "" : " saved-alert-top--clickable"}`}
                          role={editingAlertId === a.id ? undefined : "button"}
                          tabIndex={editingAlertId === a.id ? undefined : 0}
                          onClick={() => {
                            if (editingAlertId !== a.id) beginEdit(a);
                          }}
                          onKeyDown={(e) => {
                            if (editingAlertId === a.id) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              beginEdit(a);
                            }
                          }}
                        >
                          <div className="saved-alert-body">
                            <strong>{a.label?.trim() || `알림 #${a.id}`}</strong>
                            <span className="saved-alerts-meta">
                              {[a.category, a.breed || "품종 전체", a.region || "지역 전체"].filter(Boolean).join(" · ")}{" "}
                              · {formatKoreanDate(a.createdAt)}
                            </span>
                          </div>
                        </div>

                        {editingAlertId === a.id ? (
                          <form
                            className="search-form alert-form saved-alert-inline-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void persistAlert();
                            }}
                          >
                            <AlertConditionFields
                              alertLabel={alertLabel}
                              setAlertLabel={setAlertLabel}
                              alertCategory={alertCategory}
                              setAlertCategory={setAlertCategory}
                              alertBreed={alertBreed}
                              setAlertBreed={setAlertBreed}
                              alertRegion={alertRegion}
                              setAlertRegion={setAlertRegion}
                              alertGender={alertGender}
                              setAlertGender={setAlertGender}
                              alertNeutered={alertNeutered}
                              setAlertNeutered={setAlertNeutered}
                              alertKeywords={alertKeywords}
                              setAlertKeywords={setAlertKeywords}
                            />
                            <div className="saved-alert-inline-actions">
                              <button type="submit">저장</button>
                              <button type="button" className="alert-row-btn" onClick={() => resetAlertForm()}>
                                취소
                              </button>
                              <button
                                type="button"
                                className="alert-row-btn danger"
                                onClick={() => void deleteAlert(a.id)}
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
                                beginEdit(a);
                              }}
                            >
                              수정
                            </button>
                            <button
                              className="alert-row-btn danger"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteAlert(a.id);
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
                      void persistAlert();
                    }}
                  >
                    <p className="alert-add-form-title">새 알림 조건</p>
                    <AlertConditionFields
                      alertLabel={alertLabel}
                      setAlertLabel={setAlertLabel}
                      alertCategory={alertCategory}
                      setAlertCategory={setAlertCategory}
                      alertBreed={alertBreed}
                      setAlertBreed={setAlertBreed}
                      alertRegion={alertRegion}
                      setAlertRegion={setAlertRegion}
                      alertGender={alertGender}
                      setAlertGender={setAlertGender}
                      alertNeutered={alertNeutered}
                      setAlertNeutered={setAlertNeutered}
                      alertKeywords={alertKeywords}
                      setAlertKeywords={setAlertKeywords}
                    />
                    <div className="alert-add-form-actions alert-form-actions">
                      <button type="submit">저장</button>
                      <button
                        type="button"
                        className="alert-row-btn"
                        onClick={() => {
                          setShowAddAlertForm(false);
                          resetAlertForm();
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
                      aria-label="알림 조건 추가"
                      onClick={openAddAlertForm}
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
