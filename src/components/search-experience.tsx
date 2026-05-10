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

    setAlertMessage("알림 조건을 저장하는 중입니다.");

    const response = await fetch("/api/alerts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: formData.get("email"),
        breed: formData.get("breed"),
        region: formData.get("region"),
        gender: formData.get("gender"),
        neutered: formData.get("neutered"),
        featureKeywords: formData.get("featureKeywords")
      })
    });

    const data = await response.json();
    if (!response.ok) {
      setAlertMessage(data.message ?? "알림 조건 저장에 실패했습니다.");
      return;
    }

    setAlertMessage(`알림 조건을 저장했습니다. 현재 ${data.matches.length}건이 70점 이상으로 매칭되었습니다.`);
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">통합 보호 동물 탐색</p>
        <h1>잃어버린 반려동물과 닮은 공고를 한 번에 찾아보세요.</h1>
        <p>
          포인핸드 등 보호소 공고를 수집하고, 지역/품종/특징 키워드로 검색하며, 조건에 맞는 신규 공고를 알림으로 받을 수 있습니다.
        </p>
      </section>

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
        <form className="search-form" onSubmit={onAlertSubmit}>
          <label className="wide">
            이메일
            <input name="email" placeholder="me@example.com" required type="email" />
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
