"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatKoreanDate, monthsAgo, toDateInputValue } from "@/lib/date";
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
  gender: string;
  neutered: string;
  keywords: string;
};

type AnimalResponse = {
  animals: AnimalWithShelter[];
  total: number;
  hasMore: boolean;
};

const regions = ["서울특별시", "경기도", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "제주특별자치도"];
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

  Object.entries(search).forEach(([key, value]) => {
    if (key !== "useDefaultPeriod" && value && key !== "from" && key !== "to") {
      params.set(key, String(value));
    }
  });

  return params.toString();
}

export function SearchExperience() {
  const defaultSearch = useMemo(
    () => ({
      useDefaultPeriod: true,
      from: toDateInputValue(monthsAgo(3)),
      to: toDateInputValue(new Date()),
      region: "",
      category: "",
      gender: "",
      neutered: "",
      keywords: ""
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
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlInfo, setCrawlInfo] = useState("");
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

  function updateSearch(key: keyof SearchState, value: string | boolean) {
    setSearch((current) => {
      const next = { ...current, [key]: value };
      if (key === "useDefaultPeriod" && value === true) {
        next.from = toDateInputValue(monthsAgo(3));
        next.to = toDateInputValue(new Date());
      }
      return next;
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void fetchAnimals(1);
  }

  async function onAlertSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const subscriberKey = readOrCreateSubscriberKey();

    if (!subscriberKey) {
      setAlertMessage("이 브라우저에서 구독 ID를 만들 수 없습니다. 쿠키/저장소를 허용했는지 확인해 주세요.");
      return;
    }

    setAlertMessage("알림 조건을 저장하는 중입니다.");

    const response = await fetch("/api/alerts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subscriberKey,
        displayName: formData.get("displayName"),
        breed: formData.get("breed"),
        region: formData.get("region"),
        gender: formData.get("gender"),
        neutered: formData.get("neutered"),
        featureKeywords: formData.get("featureKeywords")
      })
    });

    const data = (await response.json()) as {
      message?: string;
      matches?: unknown[];
      discord?: { sent: boolean; skippedReason?: string; error?: string };
    };

    if (!response.ok) {
      setAlertMessage(data.message ?? "알림 조건 저장에 실패했습니다.");
      return;
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

    setAlertMessage(`알림 조건을 저장했습니다. 현재 ${matchCount}건이 70점 이상으로 매칭되었습니다.${extra}`);
  }

  async function runPawinhandCrawl() {
    setCrawlLoading(true);
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
          city: string;
          species: string;
          limit: number;
          maxPages: number;
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
        setCrawlInfo(
          `브리지 동기화 완료: ${data.upserted ?? 0}건 DB 반영 / API ${data.itemCount ?? 0}건 (${data.pages ?? 0}페이지) · ${data.query.city} · ${data.query.start_date}–${data.query.end_date}${warn}`
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
      setCrawlLoading(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">통합 보호 동물 탐색</p>
        <h1>잃어버린 반려동물과 닮은 공고를 한 번에 찾아보세요.</h1>
        <p>
          검색은 <strong>로컬 DB</strong>만 조회합니다. 포인핸드 공고는 아래 버튼으로{" "}
          <code>pawinhand.net</code> 브리지 JSON API를 호출해 DB에 반영하세요. 수집 범위는 환경 변수(
          <code>PAWINHAND_BRIDGE_*</code>)로 바꿀 수 있으며, 앱에는 <strong>자동 주기 스케줄은 없습니다</strong>{" "}
          (원하면 호스팅 Cron으로 같은 API를 주기 호출).
        </p>
      </section>

      <section className="panel crawl-panel" aria-label="포인핸드 데이터 동기화">
        <p>
          <strong>포인핸드</strong> 앱이 쓰는 브리지 엔드포인트(
          <code>/bridge/animals/condition</code>)로 목록 JSON을 받습니다. 성별·중성화·썸네일·공고 기간·보호소 정보 등이 예전 RSS
          방식보다 풍부합니다.
        </p>
        <div className="crawl-actions">
          <button
            className="crawl-button"
            disabled={crawlLoading}
            type="button"
            onClick={() => void runPawinhandCrawl()}
          >
            {crawlLoading ? "가져오는 중…" : "포인핸드 브리지 동기화"}
          </button>
        </div>
      </section>

      {crawlInfo ? <p className="notice">{crawlInfo}</p> : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Search</p>
            <h2>보호 동물 검색</h2>
          </div>
          <span>{total}건</span>
        </div>

        <form className="search-form" onSubmit={onSubmit}>
          <label className="checkbox-label">
            <input
              checked={search.useDefaultPeriod}
              type="checkbox"
              onChange={(event) => updateSearch("useDefaultPeriod", event.target.checked)}
            />
            최근 3개월 기본 검색
          </label>

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

          <label>
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

          <label>
            품종 카테고리
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

          <label className="wide">
            특징 키워드
            <input
              placeholder="예: 갈색 빨간목줄 겁많음"
              value={search.keywords}
              onChange={(event) => updateSearch("keywords", event.target.value)}
            />
          </label>

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

      <section className="panel alert-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Alert</p>
            <h2>실시간 알림 조건 저장</h2>
          </div>
        </div>
        <p className="alert-hint">
          알림 요약은 서버에 설정된 <strong>Discord 웹훅</strong>으로 전송됩니다. 70점 이상 매칭이 있을 때만 채널에
          메시지가 옵니다.
        </p>
        <form className="search-form" onSubmit={onAlertSubmit}>
          <label className="wide">
            표시 이름 <span className="optional">(선택)</span>
            <input name="displayName" placeholder="예: 우리집 댕댕이 찾기" type="text" />
          </label>
          <label>
            품종
            <input name="breed" placeholder="예: 푸들" />
          </label>
          <label>
            지역
            <input name="region" placeholder="예: 서울" />
          </label>
          <label>
            성별
            <select name="gender" defaultValue="">
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
            <select name="neutered" defaultValue="">
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
            <input name="featureKeywords" placeholder="예: 갈색 빨간목줄" />
          </label>
          <button type="submit">알림 저장</button>
        </form>
        {alertMessage ? <p className="notice">{alertMessage}</p> : null}
      </section>
    </main>
  );
}
