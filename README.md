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
npm run naver-cafe:login
npm run cafe:crawl
```

`npm run cafe:crawl`은 **구피사랑 카페** 크롤을 CLI로 돌립니다(Playwright·`storage/naver-session.json` 필요). GitHub Actions 러너 모드에서도 동일 스크립트를 사용합니다.

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
    pawinhand-row-category.ts
    pawinhand-rss.ts
    pawinhand-crawl.ts
  data/
    breeds-by-category.ts
  types/
    animal.ts
prisma/
  schema.prisma
  seed.ts
```

## 포인핸드 데이터 가져오기 (브리지 API)

포인핸드 웹 목록은 Vue SPA라 HTML DOM만으로는 목록을 안정적으로 못 가져왔고, 대신 앱이 쓰는 **브리지 JSON**을 사용합니다.

- 엔드포인트 예시: [`https://pawinhand.net/bridge/animals/condition`](https://pawinhand.net/bridge/animals/condition?city=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C&country=%EC%A0%84%EC%B2%B4&species=%EA%B0%9C&breeds=%EC%A0%84%EC%B2%B4&state=%EC%A0%84%EC%B2%B4&sex=%EC%A0%84%EC%B2%B4&neutral=%EC%A0%84%EC%B2%B4&start_date=20260204&end_date=20260504&offset=0&limit=20) (`city`, `country`, `species`, `breeds`, `state`, `sex`, `neutral`, `start_date`/`end_date`는 `yyyymmdd`, `offset`/`limit`로 페이지네이션)
- 동기화 시 **내장 17개 시·도**와 축종 **`개` · `고양이` · `기타`** 를 곱해 순회합니다. `[기타축종]` 공고는 품종 키워드로 **조류 / 설치류 / 파충류 / 기타** 로 나누어 DB `category`에 넣습니다 (`src/lib/pawinhand-row-category.ts`).
- 기본 **최근 3개월**, 조합당 `limit` 20, **`PAWINHAND_BRIDGE_MAX_PAGES_PER_QUERY`**(기본 8) 페이지까지 받습니다. `PAWINHAND_BRIDGE_CITIES`, `PAWINHAND_BRIDGE_SPECIES_LIST`, 요청 간격 `PAWINHAND_BRIDGE_REQUEST_DELAY_MS` 등은 `.env.example` 참고.
- **`city=전체` 또는 `species=전체`는 빈 배열**이 되는 경우가 있어, 전국 수집은 시·도 목록을 돌리는 방식으로 구현했습니다.
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

- 알림 조건을 **여러 개** 저장할 수 있으며, 규칙마다 **알림 이름**(`UserAlert.label`)을 붙일 수 있습니다. **70점 이상** 매칭이 있을 때만 Discord로 보내고, 동물별 **썸네일 이미지**가 임베드에 붙습니다.
- 사용자 식별은 브라우저 `localStorage`의 **구독 키(UUID)** 입니다.

### `.env`에 넣을 값

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `DISCORD_WEBHOOK_URL` | 알림을 받으려면 **필수** | Discord 채널 → **채널 설정** → **연동** → **웹후크** → **새 웹후크** → 생성 후 나오는 **웹후크 URL** 전체 (`https://discord.com/api/webhooks/...`) |
| `DISCORD_WEBHOOK_USERNAME` | 선택 | 채널에 표시될 **보낸 사람(봇) 이름**. 비우면 웹훅 만들 때 지정한 이름을 씁니다. |
| `DISCORD_WEBHOOK_AVATAR_URL` | 선택 | 봇 프로필 이미지 URL (공개 접근 가능한 `https://` 이미지). |
| `NEXT_PUBLIC_APP_URL` | 선택 | 예: `http://localhost:3000` 또는 배포 도메인. 넣으면 Discord 본문에 `/animal/[id]` 링크가 포함됩니다. 비우면 공고 `detailUrl`만 표시합니다. |

봇 토큰이나 서버 ID는 **웹훅만 쓰는 방식**에서는 필요 없습니다.

## GitHub Actions — 네이버 카페 크롤 (6시간마다)

워크플로: [`.github/workflows/naver-cafe-crawl.yml`](.github/workflows/naver-cafe-crawl.yml)  
UTC 기준 **6시간마다** 실행되며, **Actions 탭에서 수동 실행(`workflow_dispatch`)** 도 가능합니다.

### 추천: 지금은 **B (러너에서 크롤)**

베르셀에 Playwright·SQLite·세션까지 맞추기 전에도 동작하기 쉽습니다.

1. GitHub → 저장소 **Settings → Secrets and variables → Actions**  
2. **`CAFE_CRAWL_POST_URL` 시크릿은 만들지 않습니다.** (없으면 자동으로 B로 갑니다.)  
3. 아래 시크릿만 등록합니다.

| Secret | 필수 | Secret 칸에 넣는 값 |
| --- | --- | --- |
| `NAVER_CAFE_SESSION_JSON` | **필수** | 로컬 `storage/naver-session.json` 파일 **전체** (`npm run naver-cafe:login` 후 복사). 레포에 커밋 금지. |
| `DATABASE_URL` | **필수** | 앱이 쓰는 DB와 **같은** 연결 문자열 권장. 예: Turso/Neon URL 또는 로컬과 동일하게 쓸 `file:./dev.db`는 **러너마다 새 파일**이라 알림 DB가 비어 Discord가 안 나갈 수 있음. |
| `DISCORD_WEBHOOK_URL` | 선택 | 카페·동물 알림용 웹훅 URL 한 줄. |
| `DISCORD_CAFE_WEBHOOK_URL` | 선택 | 카페만 다른 웹훅이면 여기에. |

4. (선택) **Variables** 탭에 `NAVER_CAFE_CRAWL_MAX_LIST`, `NAVER_CAFE_CRAWL_MAX_DETAILS` 숫자 문자열.

로컬에서만 시험: `npm run naver-cafe:login` 후 `npm run cafe:crawl` (`.env`의 `DATABASE_URL` 사용).

### 나중에: **A (배포 URL만 curl)**

베르셀(또는 다른 호스트)에서 `POST /api/crawl/naver-cafe`가 **안정적으로** 돌아가게 만든 뒤:

1. Actions 시크릿 **`CAFE_CRAWL_POST_URL`** = `https://배포주소/api/crawl/naver-cafe` 전체  
2. 서버에 `CRON_SECRET`을 썼다면 같은 값으로 **`CRON_SECRET`** 시크릿 추가  
3. 이때는 러너 크롤보다 **GitHub 분·시간을 덜 씀**. (B용 시크릿은 그대로 두어도 되고, 정리하려면 `NAVER_CAFE_SESSION_JSON` 등은 삭제해도 됨.)

### 동작 분기 (요약)

| 조건 | 동작 |
| --- | --- |
| `CAFE_CRAWL_POST_URL` 시크릿이 **있고** 값이 있음 | **A** — 해당 URL로 `curl` POST만 |
| `CAFE_CRAWL_POST_URL`이 **없음** | **B** — 러너에서 `npm run cafe:crawl` |

### Repository variables (선택)

| Variable | 설명 |
| --- | --- |
| `NAVER_CAFE_CRAWL_MAX_LIST` | 게시판당 목록 개수 상한 (숫자 문자열, 비우면 크롤러 기본값) |
| `NAVER_CAFE_CRAWL_MAX_DETAILS` | 상세 수집 상한 (숫자 문자열, 비우면 크롤러 기본값) |

### Secrets 요약 표

| Secret | A (curl) | B (러너, **기본 추천**) |
| --- | --- | --- |
| `CAFE_CRAWL_POST_URL` | **필수** | **등록하지 않음** |
| `CRON_SECRET` | 선택 | 불필요 |
| `NAVER_CAFE_SESSION_JSON` | 불필요 | **필수** |
| `DATABASE_URL` | 불필요 | **필수** |
| `DISCORD_WEBHOOK_URL` | 불필요 (배포 서버 env) | 선택 |
| `DISCORD_CAFE_WEBHOOK_URL` | 불필요 | 선택 |

## 유사도 점수

```text
카테고리 10점 + 품종 30점 + 지역 15점 + 성별 10점 + 특징 키워드 35점 (= 100)
```

특징 키워드는 공백으로 분리하며, 일부 동의어는 `src/lib/similarity.ts`를 참고하세요.

## 데이터베이스 모델 요약

- `Animal`: 보호 동물 공고
- `Shelter`: 보호소/보호 단체
- `User`: 구독자 (`subscriberKey` + 선택 `displayName`)
- `UserAlert`: 알림 조건 (`label`, `category`, `breed` 등)
- `AlertLog`: 매칭/발송 이력
