# DSS 사내 게시판

임직원이 자유롭게 글을 쓰고 읽는 사내 게시판.
DSS 통합 로그인 포털(dss-auth) 뒤에 붙는 사내 시스템 중 하나다.

| 문서 | 내용 |
|---|---|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 무엇을 만드는가 (요구사항, 1차 범위, 만들지 않는 것) |
| [DESIGN.md](./DESIGN.md) | 화면 흐름, 데이터 구조, 보안 규칙 |

- 개발 주소: **http://localhost:3400**
- 전용 DB: **`dss_board`** (계측기 `dss_meters` · 휴가 `dss_leave` 와 섞이지 않는다)
- 포트: **3400** (A/S 3000 · 포털 3100 · 계측기 3200 · 휴가 3300)

---

## 처음 준비

```bash
npm install
cp .env.example .env.local     # 값을 채운다 (git 에 올리지 않는다)
```

PostgreSQL 은 Windows 서비스로 등록돼 있지 않다. **PC 를 재부팅하면 직접 켠다.**

```bash
"C:/Users/이남준/pgsql/bin/pg_ctl.exe" -D C:/pgdata -l C:/pgdata/server.log start
netstat -ano | grep ':5432'     # LISTENING 이면 떠 있는 것
```

DB 와 계정 만들기 (한 번만):

```sql
CREATE ROLE dss_board LOGIN PASSWORD '...';
CREATE DATABASE dss_board OWNER dss_board ENCODING 'UTF8'
  TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';
```

> Windows 계정명이 한글이라 클러스터가 `SQL_ASCII` 로 만들어져 있다.
> 그래서 **DB 를 만들 때 UTF8 을 명시**한다.

표 만들기:

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
| `npm run make:admin` | 첫 관리자 지정 |
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
| `DEV_FAKE_LOGIN_ENABLED` | 개발용 임시 로그인. 기본 `false` |
| `OIDC_*` | 포털 OIDC 연결값. 엔드포인트가 열리면 채운다 |
| `AUTH_STATE_SECRET` | PKCE 상태 쿠키 서명 열쇠 |

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
