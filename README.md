# findMyFriend

전국 동물 보호소 및 보호 단체의 보호 동물 공고를 통합 검색하고, 사용자가 저장한 조건과 유사한 공고가 있을 때 알림 후보를 찾는 MVP 프로젝트입니다.

## 주요 기능

- 발견 기간, 지역, 품종 카테고리, 성별, 중성화 여부, 특징 키워드 기반 검색
- 카드형 검색 결과와 스크롤 기반 추가 로딩
- 동물 상세 페이지, 보호 단체 정보, 같은 보호소의 다른 공고 표시
- 사용자 알림 조건 저장 및 유사도 점수 계산
- Playwright 기반 포인핸드 크롤러 골격
- SQLite + Prisma 기반 로컬 MVP 데이터베이스

## 기술 스택

- Next.js App Router
- React
- TypeScript
- Prisma ORM
- SQLite
- Playwright

## 시작하기

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

개발 서버가 실행되면 `http://localhost:3000`에서 확인할 수 있습니다.

## 환경 변수

로컬 개발용 기본값은 `.env`에 들어 있습니다.

```bash
DATABASE_URL="file:./dev.db"
```

SQLite 파일은 `prisma/dev.db`에 생성됩니다.

## 주요 명령어

```bash
npm run dev
npm run build
npm run lint
npm run db:generate
npm run db:push
npm run db:seed
npm run crawler:pawinhand
```

## 프로젝트 구조

```text
src/
  app/
    api/
      alerts/
      animals/
    animal/[id]/
    page.tsx
  components/
    search-experience.tsx
  crawler/
    pawinhand.ts
  lib/
    db.ts
    similarity.ts
  types/
    animal.ts
prisma/
  schema.prisma
  seed.ts
```

## 크롤러 안내

포인핸드 크롤러는 다음 명령으로 실행합니다.

```bash
npm run crawler:pawinhand
```

현재 크롤러는 MVP 골격입니다. 포인핸드의 실제 DOM 구조, 로그인/봇 방지 정책, 네트워크 응답 형태가 바뀌면 선택자와 파싱 로직을 조정해야 합니다. 크롤러가 실패해도 `npm run db:seed`로 넣은 샘플 데이터로 검색과 상세 페이지를 확인할 수 있습니다.

## 알림 처리 범위

현재 단계에서는 실제 이메일/웹 푸시 발송까지 연결하지 않았습니다. 알림 조건을 저장하면 DB의 기존 동물과 유사도 점수를 계산하고, 70점 이상인 항목을 `alert_logs`에 기록합니다.

## 유사도 점수

MVP 점수는 다음 기준으로 계산합니다.

```text
품종 40점 + 지역 15점 + 성별 10점 + 특징 키워드 35점
```

특징 키워드는 공백으로 분리하며, 일부 동의어 예시는 `src/lib/similarity.ts`에 정의되어 있습니다.
# findMyFriend

전국 동물 보호소 및 보호 단체의 보호 동물 공고를 통합 검색하고, 사용자가 저장한 조건과 유사한 신규 공고를 찾는 MVP입니다.

현재 구현 범위는 `setup.md` 기획서를 기준으로 한 Next.js App Router 앱, Prisma/SQLite 데이터 모델, 검색/상세/알림 조건 API, 포인핸드 Playwright 크롤러 골격입니다.

## 기술 스택

- Next.js App Router
- React
- TypeScript
- Prisma
- SQLite
- Playwright

## 주요 기능

- 최근 3개월 기본 검색과 직접 기간 검색
- 발견 지역, 품종 카테고리, 성별, 중성화 여부, 특징 키워드 검색
- 카드형 검색 결과와 추가 로딩
- 보호 동물 상세 페이지
- 보호 단체 정보와 원본 공고 링크
- 같은 보호소의 다른 공고 표시
- 이메일 기반 알림 조건 저장
- 품종, 지역, 성별, 특징 키워드 기반 유사도 점수 계산
- 포인핸드 목록/상세 페이지 수집 스크립트 골격

## 시작하기

```bash
npm install
cp .env.example .env
npm run db:push
npm run db:seed
npm run dev
```

개발 서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## 데이터베이스

SQLite를 사용합니다. 기본 연결 문자열은 다음과 같습니다.

```env
DATABASE_URL="file:./dev.db"
```

Prisma 스키마는 `prisma/schema.prisma`에 있으며, 주요 모델은 다음과 같습니다.

- `Animal`: 보호 동물 공고
- `Shelter`: 보호소/보호 단체
- `User`: 향후 로그인 기능용 사용자 모델
- `UserAlert`: 사용자 알림 조건
- `AlertLog`: 알림 발송/매칭 이력

## 자주 쓰는 명령어

```bash
npm run dev
npm run build
npm run lint
npm run db:generate
npm run db:push
npm run db:seed
npm run crawler:pawinhand
```

## 크롤러

포인핸드 크롤러는 `src/crawler/pawinhand.ts`에 있습니다.

```bash
npm run crawler:pawinhand
```

크롤러는 다음 흐름으로 동작합니다.

1. `https://pawinhand.kr/shelter/animal` 목록 페이지에서 상세 링크를 수집합니다.
2. 상세 페이지에서 품종, 성별, 중성화 여부, 구조장소, 이미지, 보호소 정보를 추출합니다.
3. `sourceSite + noticeNo` 기준으로 중복 저장을 방지합니다.

실제 사이트의 DOM 구조와 접근 정책은 바뀔 수 있으므로, 운영 전에는 선택자와 요청 간격을 다시 확인해야 합니다.

## 구현 메모

- 이메일/웹 푸시는 실제 발송 연동 전 단계입니다. 현재는 알림 조건 저장과 최근 공고 기준 매칭 후보 반환까지 구현되어 있습니다.
- 검색 결과는 API 페이지네이션을 사용하며, UI에서는 `더 보기` 버튼으로 이어서 불러옵니다.
- seed 데이터가 있어 크롤러 실행 전에도 검색과 상세 페이지를 확인할 수 있습니다.
