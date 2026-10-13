# DSS 사내 게시판

임직원이 자유롭게 글을 쓰고 읽는 사내 게시판.
DSS 통합 로그인 포털(dss-auth) 뒤에 붙는 사내 시스템 중 하나다.

| 문서 | 내용 |
|---|---|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 무엇을 만드는가 (요구사항, 1차 범위, 만들지 않는 것) |
| [DESIGN.md](./DESIGN.md) | 화면 흐름, 데이터 구조, 보안 규칙 |

- 개발 주소: **http://localhost:3400**
- 전용 DB: **`dss_board`** (계측기 `dss_meters` · 휴가 `dss_leave` 와 섞이지 않는다)
- 포트: **3400**
  (A/S 3000 · 포털 3100 · 홈페이지 3200 · 계측기 3300 · 개선요청 3500 · PO 3600 · 휴가 3700 · 재고 3800)

---

## 처음 준비

```bash
npm install
cp .env.example .env.local     # 값을 채운다 (git 에 올리지 않는다)
```

### 개발 DB — PC 마다 다르다

둘 중 **이 PC 에 해당하는 쪽만** 하면 된다. `.env.local` 의 `DATABASE_URL` 포트를
고른 쪽에 맞춘다.

**① Docker 가 있는 PC — 컨테이너, 포트 `5434`**

이 저장소의 `docker-compose.yml` 로 띄운다. 로컬에 PostgreSQL 이 따로 깔려 있어도
5432 와 부딪히지 않는다. 계정·DB·UTF8 인코딩은 컨테이너가 처음 뜰 때 알아서 만든다.

```bash
# 비밀번호는 DSS_BOARD_DB_PASSWORD 환경변수로 넘긴다 (compose 파일에 적지 않는다)
docker compose up -d db
```

```
DATABASE_URL=postgres://dss_board:<비밀번호>@localhost:5434/dss_board
```

**② 로컬에 PostgreSQL 을 설치한 PC — 포트 `5432`**

Windows 서비스로 등록돼 있지 않으므로 **PC 를 재부팅하면 직접 켠다.**
설치 폴더는 PC 마다 다르니 자기 경로로 바꿔 쓴다.

```bash
"<PostgreSQL 설치 폴더>/bin/pg_ctl.exe" -D C:/pgdata -l C:/pgdata/server.log start
netstat -ano | grep ':5432'     # LISTENING 이면 떠 있는 것
```

DB 와 계정 만들기 (②에서만, 한 번만):

```sql
CREATE ROLE dss_board LOGIN PASSWORD '...';
CREATE DATABASE dss_board OWNER dss_board ENCODING 'UTF8'
  TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';
```

> Windows 계정명이 한글이면 클러스터가 `SQL_ASCII` 로 만들어진다.
> 그래서 **DB 를 만들 때 UTF8 을 명시**한다.

표 만들기 (① ② 공통):

```bash
npm run db:generate     # 스키마 → SQL 생성 (생성된 SQL 을 손으로 고치지 않는다)
npm run db:migrate      # 적용 — 사용자 승인 후에만 실행한다
```

---

## 실행

```bash
npm run dev             # http://localhost:3400
```

SWC 바이너리가 회사 PC 정책에 막혀 Turbopack 이 안 돌면:

```bash
npx next dev --webpack -H 0.0.0.0 -p 3400
```

---

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (0.0.0.0:3400) |
| `npm run build` / `npm start` | 운영 빌드 · 실행 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | 문법 검사 |
| `npm run db:generate` | 스키마 변경 → 마이그레이션 SQL 생성 |
| `npm run db:migrate` | 마이그레이션 적용 (**승인 후**) |
| `npm run make:admin` | 관리자 지정 **비상구** (평소에는 쓰지 않는다 — 아래 「역할은 포털이 정한다」) |
| `npm run cleanup:orphans` | 글에 붙지 못한 사진·첨부 정리 |

---

## 환경변수

`.env.example` 을 보고 `.env.local` 을 만든다. 비밀값은 git·화면·메신저에 올리지 않는다.

| 이름 | 설명 |
|---|---|
| `DATABASE_URL` | 이 사이트 전용 DB 접속 주소 |
| `STORAGE_ROOT` | 사진·첨부를 쌓는 폴더 (절대경로). NAS 에서는 `/data` |
| `SESSION_COOKIE_SECURE` | HTTPS 를 붙인 뒤 `true`. 사내망 HTTP 에서 켜면 로그인이 조용히 실패한다 |
| `SESSION_HOURS` | 세션 수명. 포털 SSO 절대 만료 12시간을 넘기지 않는다 |
| `SEED_DEV_ENABLED` | 개발용 가짜 글 넣기(`npm run seed:dev`)를 열어주는 깃발. 기본 `false` |
| `OIDC_ISSUER` · `OIDC_REDIRECT_URI` | 포털 연결 주소. **`auto`** 면 서버가 뜰 때 이 기계의 사내망 IPv4 로 푼다. 운영(HTTPS 도메인)은 직접 적는다 |
| `OIDC_CLIENT_ID` · `OIDC_CLIENT_SECRET` | 포털에 등록된 값. `client_id` 는 `dss-board` |
| `AUTH_STATE_SECRET` | PKCE 상태 쿠키 서명 열쇠 |

### 역할은 포털이 정한다

로그인은 **통합 로그인 포털(dss-auth) 하나로만** 들어온다. 포털을 거치지 않는 길은 없다.

- 포털이 ID 토큰에 실어 보낸 `role` 을 **로그인할 때마다** 반영한다.
  클레임이 안 오면 지금 값을 그대로 두고(처음 보는 사람은 `MEMBER`), 모르는 값이면 로그인을 거절한다
- 역할을 주는 곳은 **포털의 `/admin/users` → 「시스템 접근·역할」**.
  바뀐 역할은 **그 사람이 다시 로그인할 때** 반영된다
- 게시판 `/admin/users` 에서는 역할을 바꿀 수 없다. 거기서 할 수 있는 일은 **게시판 사용 중지·재개**뿐이다
- `npm run make:admin` 은 **포털이 막혔을 때의 비상구**다. 거기서 올린 역할도 다음 로그인에 포털 값으로 덮인다

---

## NAS 배포

운영 환경은 Synology DS218+ 의 Linux Docker 컨테이너다.
**배포는 직접 수행하지 않는다.** 절차만 적어둔다.

```bash
docker build -t dss-board .
docker run -d --name dss-board \
  -p 3400:3400 \
  -v /volume1/dss-board-data:/data \
  --env-file .env.production \
  dss-board
```

- 사진·첨부는 컨테이너 안에 쌓지 않고 `/data` 볼륨에 둔다
- `PORT` · `STORAGE_ROOT` 는 환경변수로 넘긴다
- 배치·정리 스크립트는 전부 TypeScript(`tsx`)다. PowerShell 스크립트는 만들지 않는다
