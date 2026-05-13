import Link from "next/link";

export type SiteNavKey = "home" | "protect" | "adopt";

export function SiteNav({ current }: { current: SiteNavKey }) {
  return (
    <nav className="site-nav" aria-label="서비스 구역">
      <Link className={current === "home" ? "site-nav-link is-active" : "site-nav-link"} href="/">
        처음
      </Link>
      <Link
        className={current === "protect" ? "site-nav-link is-active" : "site-nav-link"}
        href="/protect"
      >
        통합 보호 동물
      </Link>
      <Link className={current === "adopt" ? "site-nav-link is-active" : "site-nav-link"} href="/adopt">
        통합 분양 동물
      </Link>
    </nav>
  );
}
