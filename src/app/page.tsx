import Link from "next/link";

import { SiteNav } from "@/components/site-nav";

export default function HomePage() {
  return (
    <main>
      <SiteNav current="home" />

      <section className="hero hub-hero">
        <p className="eyebrow">findMyFriend</p>
        <h1>보호 공고와 카페 분양 정보를 한곳에서 시작하세요.</h1>
        <p>
          <strong>통합 보호 동물 탐색</strong>은 포인핸드·국가동물보호정보시스템 공고를 다루고,{" "}
          <strong>통합 분양 동물 탐색</strong>은 네이버 카페(구피사랑) 일부 게시판을 Playwright로 수집해 조건에 맞는
          새 글을 Discord로 알려 줍니다.
        </p>
      </section>

      <div className="hub-cards">
        <Link className="hub-card hub-card--protect" href="/protect">
          <p className="eyebrow">Shelter · rescue</p>
          <h2>통합 보호 동물 탐색</h2>
          <p>지자체·포인핸드 유기동물 공고 검색, 알림 조건, DB 동기화 화면으로 이동합니다.</p>
          <span className="hub-card-cta">이동 →</span>
        </Link>
        <Link className="hub-card hub-card--adopt" href="/adopt">
          <p className="eyebrow">Naver Cafe</p>
          <h2>통합 분양 동물 탐색</h2>
          <p>
            구피사랑 카페의 나눔·분양 게시판을 감시합니다. 로그인 세션 저장 후 크론으로 주기 호출해 Discord 웹훅 알림을
            받을 수 있습니다.
          </p>
          <span className="hub-card-cta">이동 →</span>
        </Link>
      </div>
    </main>
  );
}
