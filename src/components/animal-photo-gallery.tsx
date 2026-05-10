"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type Props = {
  urls: string[];
  alt: string;
};

export function AnimalPhotoGallery({ urls, alt }: Props) {
  const list = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of urls) {
      const t = u.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out.length ? out : ["/placeholder.svg"];
  }, [urls]);

  const [active, setActive] = useState(0);
  const current = list[Math.min(active, list.length - 1)] ?? "/placeholder.svg";
  const isRemote = current.startsWith("http://") || current.startsWith("https://");

  return (
    <div className="animal-photo-gallery">
      <div className="animal-photo-gallery-main">
        <Image
          key={current}
          src={current}
          alt={alt}
          fill
          className="animal-photo-gallery-img"
          sizes="(max-width: 900px) 100vw, 860px"
          unoptimized={isRemote}
          priority={active === 0}
        />
      </div>

      {list.length > 1 ? (
        <div className="animal-photo-gallery-thumbs-wrap">
          <p className="animal-photo-gallery-count muted">
            사진 {list.length}장 · 썸네일을 눌러 다른 각도를 볼 수 있어요
          </p>
          <div className="animal-photo-gallery-thumbs" role="tablist" aria-label="동물 사진 목록">
            {list.map((src, i) => {
              const thumbRemote = src.startsWith("http://") || src.startsWith("https://");
              const selected = i === active;
              return (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`animal-photo-gallery-thumb${selected ? " is-active" : ""}`}
                  onClick={() => setActive(i)}
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    className="animal-photo-gallery-thumb-img"
                    sizes="80px"
                    unoptimized={thumbRemote}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
