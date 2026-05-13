import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnimalPhotoGallery } from "@/components/animal-photo-gallery";
import {
  buildPawinhandStyleSummaryLine,
  detailStatusHeadline,
  displayOrDash,
  featuresTextForDetailList,
  formatNoticePeriodCompact,
  shelterLineWithPhone
} from "@/lib/animal-detail-presentation";
import { parseAnimalImageGalleryJson } from "@/lib/animal-images";
import { prisma } from "@/lib/db";
import { pawinhandKrDetailUrl } from "@/lib/pawinhand-bridge";
import {
  SOURCE_AWTIS,
  SOURCE_MULTI,
  SOURCE_PAWINHAND,
  sourceSiteLabel,
  sourceTypeLinkLabel
} from "@/lib/source-constants";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type PlatformLink = { sourceType: string; sourceUrl: string };

function sortedPlatformLinks(animal: {
  sourceSite: string;
  noticeNo: string;
  detailUrl: string;
  sources: { sourceType: string; sourceUrl: string }[];
}): PlatformLink[] {
  const order = [SOURCE_PAWINHAND, SOURCE_AWTIS];
  const src = animal.sources ?? [];
  if (src.length > 0) {
    return [...src].sort(
      (a, b) => order.indexOf(a.sourceType) - order.indexOf(b.sourceType)
    );
  }
  if (animal.sourceSite === SOURCE_AWTIS) {
    return [{ sourceType: SOURCE_AWTIS, sourceUrl: animal.detailUrl }];
  }
  if (animal.sourceSite === SOURCE_MULTI) {
    return [
      { sourceType: SOURCE_PAWINHAND, sourceUrl: pawinhandKrDetailUrl(animal.noticeNo) },
      { sourceType: SOURCE_AWTIS, sourceUrl: animal.detailUrl }
    ];
  }
  return [{ sourceType: SOURCE_PAWINHAND, sourceUrl: pawinhandKrDetailUrl(animal.noticeNo) }];
}

export default async function AnimalDetailPage({ params }: PageProps) {
  const { id } = await params;
  const animalId = Number(id);

  if (!Number.isInteger(animalId)) {
    notFound();
  }

  const animal = await prisma.animal.findUnique({
    where: {
      id: animalId
    },
    include: {
      sources: true,
      shelter: {
        include: {
          animals: {
            where: {
              id: {
                not: animalId
              }
            },
            take: 4,
            orderBy: {
              foundDate: "desc"
            }
          }
        }
      }
    }
  });

  if (!animal) {
    notFound();
  }

  const galleryUrls = parseAnimalImageGalleryJson(animal.imageGallery, animal.imageUrl);
  const platformLinks = sortedPlatformLinks(animal);
  const hasMultipleSources = (animal.sources?.length ?? 0) >= 2;
  const statusHeadline = detailStatusHeadline(animal.status);
  const summaryLine = buildPawinhandStyleSummaryLine(animal);
  const periodLine = formatNoticePeriodCompact(animal.noticeStartAt, animal.noticeEndAt);
  const shelterLine = shelterLineWithPhone(animal.shelter);
  const jurisdiction = displayOrDash(animal.foundRegion);
  const featuresText = featuresTextForDetailList(animal.features);

  return (
    <main>
      <Link className="back-link" href="/protect">
        검색으로 돌아가기
      </Link>

      <article className="detail-layout detail-layout--pawinhand-ref">
        <div className="detail-media detail-media--pawinhand-ref">
          <span className="detail-image-status-badge">{statusHeadline}</span>
          <AnimalPhotoGallery alt={`${animal.breed} 사진`} urls={galleryUrls} />
        </div>

        <section className="detail-panel detail-panel--pawinhand-ref">
          <p className="detail-source-chips">
            <span className="detail-source-chip">{sourceSiteLabel(animal.sourceSite)}</span>
          </p>

          <h1 className="detail-title-pawinhand">
            [{animal.category}] {animal.breed}
          </h1>

          <p className="detail-summary-pawinhand">{summaryLine}</p>

          <div className="detail-spec-rows" aria-label="공고 상세">
            <div className="detail-spec-row">
              <span className="detail-spec-k">공고번호</span>
              <span className="detail-spec-v detail-notice-no-value">{animal.noticeNo}</span>
            </div>
            <div className="detail-spec-row">
              <span className="detail-spec-k">공고기간</span>
              <span className="detail-spec-v">{periodLine}</span>
            </div>
            <div className="detail-spec-row">
              <span className="detail-spec-k">발견장소</span>
              <span className="detail-spec-v">{displayOrDash(animal.foundLocation)}</span>
            </div>
            <div className="detail-spec-row">
              <span className="detail-spec-k">특이사항</span>
              <span className="detail-spec-v">{featuresText}</span>
            </div>
            <div className="detail-spec-row">
              <span className="detail-spec-k">보호센터</span>
              <span className="detail-spec-v">{shelterLine}</span>
            </div>
            <div className="detail-spec-row">
              <span className="detail-spec-k">관할기관</span>
              <span className="detail-spec-v">{jurisdiction}</span>
            </div>
          </div>

          <p className="detail-tel-footnote">* 전화 문의는 보호소 운영시간 확인 후 이용 바랍니다.</p>

          <div className="detail-platform-links detail-platform-links--stack">
            {platformLinks.map((s) => (
              <a
                key={`${s.sourceType}-${s.sourceUrl}`}
                className="primary-link detail-cta-link"
                href={s.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {sourceTypeLinkLabel(s.sourceType)}
              </a>
            ))}
          </div>

          {hasMultipleSources ? (
            <p className="notice detail-multi-source-hint">
              이 동물은 아래 플랫폼에서도 동일 공고로 확인할 수 있습니다.
            </p>
          ) : null}
          {platformLinks.length >= 2 ? (
            <p className="notice detail-inquiry-hint">
              빠른 회신을 받으려면 <strong>포인핸드</strong>와 <strong>국가동물보호정보시스템</strong>에 각각 문의해 보세요.
            </p>
          ) : null}
        </section>
      </article>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Related</p>
            <h2>같은 보호소의 다른 공고</h2>
          </div>
        </div>
        <div className="related-list">
          {animal.shelter.animals.length > 0 ? (
            animal.shelter.animals.map((related: (typeof animal.shelter.animals)[number]) => (
              <Link className="related-card" href={`/animal/${related.id}`} key={related.id}>
                <Image alt={`${related.breed} 사진`} src={related.imageUrl} width={220} height={150} unoptimized />
                <div>
                  <strong>{related.breed}</strong>
                  <span>{related.foundLocation}</span>
                </div>
              </Link>
            ))
          ) : (
            <p className="notice">같은 보호소의 다른 공고가 아직 없습니다.</p>
          )}
        </div>
      </section>
    </main>
  );
}
