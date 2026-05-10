import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { formatKoreanDate } from "@/lib/date";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

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

  return (
    <main>
      <Link className="back-link" href="/">
        검색으로 돌아가기
      </Link>

      <article className="detail-layout">
        <div className="detail-image">
          <Image alt={`${animal.breed} 사진`} src={animal.imageUrl} width={900} height={720} priority unoptimized />
        </div>

        <section className="detail-panel">
          <div className="badges">
            <span>{animal.status}</span>
            <span>{animal.gender}</span>
          </div>
          <h1>
            [{animal.category}] {animal.breed} <small>(중성화 {animal.neutered})</small>
          </h1>
          <dl className="detail-list">
            <div>
              <dt>공고번호</dt>
              <dd>{animal.noticeNo}</dd>
            </div>
            <div>
              <dt>공고기간</dt>
              <dd>
                {formatKoreanDate(animal.noticeStartAt)} - {formatKoreanDate(animal.noticeEndAt)}
              </dd>
            </div>
            <div>
              <dt>발견날짜</dt>
              <dd>{formatKoreanDate(animal.foundDate)}</dd>
            </div>
            <div>
              <dt>발견장소</dt>
              <dd>{animal.foundLocation}</dd>
            </div>
            <div>
              <dt>특이사항</dt>
              <dd>{animal.features}</dd>
            </div>
          </dl>
          <a className="primary-link" href={animal.detailUrl} rel="noreferrer" target="_blank">
            원본 공고 보기
          </a>
        </section>
      </article>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Shelter</p>
            <h2>보호 단체 정보</h2>
          </div>
        </div>
        <dl className="detail-list">
          <div>
            <dt>보호 단체</dt>
            <dd>
              <a href={animal.shelter.website} rel="noreferrer" target="_blank">
                {animal.shelter.name}
              </a>
            </dd>
          </div>
          <div>
            <dt>전화번호</dt>
            <dd>{animal.shelter.phone}</dd>
          </div>
          <div>
            <dt>주소</dt>
            <dd>{animal.shelter.address}</dd>
          </div>
          <div>
            <dt>웹사이트</dt>
            <dd>
              <a href={animal.shelter.website} rel="noreferrer" target="_blank">
                {animal.shelter.website}
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Related</p>
            <h2>같은 보호소의 다른 공고</h2>
          </div>
        </div>
        <div className="related-list">
          {animal.shelter.animals.length > 0 ? (
            animal.shelter.animals.map((related) => (
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
