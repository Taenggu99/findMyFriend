# findMyFriend

전국 동물 보호소 및 보호 단체의 보호 동물 공고를 통합 검색하고, 사용자가 저장한 조건과 유사한 공고가 있을 때 알림 후보를 찾는 MVP 프로젝트입니다. 기획은 `setup.md`를 따릅니다.

## 주요 기능

- 발견 기간, 지역, 품종 카테고리, 성별, 중성화 여부, 특징 키워드 기반 검색
- 카드형 검색 결과와 스크롤 기반 추가 로딩
- 동물 상세 페이지, 보호 단체 정보, 같은 보호소의 다른 공고 표시
- 알림 조건 저장 및 유사도 점수 계산
- 포인핸드 공고 동기화: `pawinhand.net` **브리지 JSON API** + 메인 화면 **수동 동기화** 버튼 / `POST /api/crawl/pawinhand`
- SQLite + Prisma 기반 로컬 MVP 데이터베이스

## 기술 스택

- Next.js App Router
- React
- TypeScript
- Prisma ORM
- SQLite
- (선택) Playwright — 향후 상세 페이지 스크린샷·DOM 보강 시

## 시작하기

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

개발 서버는 `http://localhost:3000`에서 확인할 수 있습니다.

## 환경 변수

```bash
DATABASE_URL="file:./dev.db"
```

SQLite 파일은 프로젝트 루트의 `dev.db`(또는 `DATABASE_URL`에 맞는 경로)에 생성됩니다.

포인핸드 브리지 동기화용 옵션은 `.env.example`의 `PAWINHAND_BRIDGE_*` 주석을 참고하세요.

예정인 Discord 알림 변수는 `.env.example`을 참고하세요. `NEXT_PUBLIC_APP_URL`을 넣으면 Discord 메시지에 앱 내 상세 링크가 붙습니다.

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

`crawler:pawinhand`는 브리지 API를 호출해 DB에 반영합니다. **Chromium 설치가 필수는 아닙니다.**

## 프로젝트 구조

```text
src/
  app/
    api/
      alerts/
      animals/
      crawl/pawinhand/
    animal/[id]/
    page.tsx
  components/
    search-experience.tsx
  crawler/
    pawinhand.ts
  lib/
    db.ts
    pawinhand-bridge.ts
    pawinhand-rss.ts
    pawinhand-crawl.ts
  types/
    animal.ts
prisma/
  schema.prisma
  seed.ts
```

## 포인핸드 데이터 가져오기 (브리지 API)

포인핸드 웹 목록은 Vue SPA라 HTML DOM만으로는 목록을 안정적으로 못 가져왔고, 대신 앱이 쓰는 **브리지 JSON**을 사용합니다.

- 엔드포인트 예시: [`https://pawinhand.net/bridge/animals/condition`](https://pawinhand.net/bridge/animals/condition?city=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C&country=%EC%A0%84%EC%B2%B4&species=%EA%B0%9C&breeds=%EC%A0%84%EC%B2%B4&state=%EC%A0%84%EC%B2%B4&sex=%EC%A0%84%EC%B2%B4&neutral=%EC%A0%84%EC%B2%B4&start_date=20260204&end_date=20260504&offset=0&limit=20) (`city`, `country`, `species`, `breeds`, `state`, `sex`, `neutral`, `start_date`/`end_date`는 `yyyymmdd`, `offset`/`limit`로 페이지네이션)
- 기본 설정은 **최근 3개월**, `limit` 20, 최대 **100페이지**까지 이어 받습니다. `PAWINHAND_BRIDGE_*` 환경 변수로 시·도·종·페이지 상한 등을 바꿀 수 있습니다 (`.env.example` 참고).
- **`city=전체` 또는 `species=전체`는 빈 배열이 돌아오는 경우가 있어**, 코드 기본값은 `서울특별시` + **`개`**입니다. 고양이 등은 `PAWINHAND_BRIDGE_SPECIES`로 바꾸세요.
- 이 프로젝트에는 **내장 자동 스케줄(크론)이 없습니다.** 필요하면 Vercel Cron 등으로 `POST /api/crawl/pawinhand`를 주기적으로 호출하면 됩니다.

### 수동 동기화

- 개발 서버 실행 중 메인 화면의 **「포인핸드 브리지 동기화」** 버튼
- 또는 터미널: `npm run crawler:pawinhand`

검색은 항상 **로컬 DB**만 읽습니다. 동기화 후에야 최신 포인핸드 공고가 검색에 나옵니다.

### RSS (보조)

`src/lib/pawinhand-crawl.ts`의 `importPawinhandFromRss`는 브리지가 막혔을 때 등 **보조**용으로 남겨 두었습니다. 피드는 보통 최대 약 100건입니다.

### 한계·주의

- `detail_url`이 `pasm.kr`처럼 짧게 오면 공고번호로 포인핸드 상세 URL을 조합합니다.
- 일부 필드는 원본에 `&amp;`처럼 이스케이프된 문자열이 있어 디코딩해 저장합니다.

## 알림 (Discord)

- 알림 조건을 저장하면 **70점 이상** 매칭이 있을 때만, 서버가 **Discord Incoming Webhook**으로 요약 메시지를 보냅니다. (매칭이 없으면 Discord로는 보내지 않습니다.)
- 사용자 식별은 이메일이 아니라 브라우저 `localStorage`에 저장되는 **구독 키(UUID)** 로 합니다. 선택 입력인 **표시 이름**은 Discord 임베드 제목에만 쓰입니다.

### `.env`에 넣을 값

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `DISCORD_WEBHOOK_URL` | 알림을 받으려면 **필수** | Discord 채널 → **채널 설정** → **연동** → **웹후크** → **새 웹후크** → 생성 후 나오는 **웹후크 URL** 전체 (`https://discord.com/api/webhooks/...`) |
| `DISCORD_WEBHOOK_USERNAME` | 선택 | 채널에 표시될 **보낸 사람(봇) 이름**. 비우면 웹훅 만들 때 지정한 이름을 씁니다. |
| `DISCORD_WEBHOOK_AVATAR_URL` | 선택 | 봇 프로필 이미지 URL (공개 접근 가능한 `https://` 이미지). |
| `NEXT_PUBLIC_APP_URL` | 선택 | 예: `http://localhost:3000` 또는 배포 도메인. 넣으면 Discord 본문에 `/animal/[id]` 링크가 포함됩니다. 비우면 공고 `detailUrl`만 표시합니다. |

봇 토큰이나 서버 ID는 **웹훅만 쓰는 방식**에서는 필요 없습니다.

## 유사도 점수

```text
품종 40점 + 지역 15점 + 성별 10점 + 특징 키워드 35점
```

특징 키워드는 공백으로 분리하며, 일부 동의어는 `src/lib/similarity.ts`를 참고하세요.

## 데이터베이스 모델 요약

- `Animal`: 보호 동물 공고
- `Shelter`: 보호소/보호 단체
- `User`: 구독자 (`subscriberKey` + 선택 `displayName`)
- `UserAlert`: 알림 조건
- `AlertLog`: 매칭/발송 이력
