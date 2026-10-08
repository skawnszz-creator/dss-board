# DSS 사내 게시판 — 설계

작성일 2026-10-08 · 상태 **승인됨 (2026-10-08, 첨부파일 추가 반영)** · 근거 문서 [REQUIREMENTS.md](./REQUIREMENTS.md)

휴가 시스템(`dss-leave`)이 이미 검증한 구조를 그대로 따른다. 새로 발명하지 않는다.

---

## 1. 화면 흐름

```
                      [ 사내 PC 브라우저 ]
                              |
                     http://localhost:3400
                              |
                     로그인 되어 있나? ──── 아니오 ──→ /login
                              |                          |
                             예                   "포털로 로그인" 버튼
                              |                          |
                              |              (개발 중에는 임시 로그인 목록)
                              |                          |
                              |                 포털 dss-auth :3100
                              |                          |
                              |              /api/auth/callback 로 돌아옴
                              |                          |
                              └──────────────┬───────────┘
                                             v
                            ┌────────────────────────────────┐
                            │   /  글 목록 (메인)             │
                            │   검색 · 주제필터 · 20개 페이지  │
                            └───┬────────────────┬───────────┘
                     제목 클릭  │                │  [글쓰기]
                                v                v
                   /posts/[id]  글 보기      /posts/new  글 쓰기
                   본문 + 첨부 + 열람자       제목·주제·본문·첨부
                                │                │
                 (작성자·관리자) │                │ 저장
                     ┌──────────┴─────┐          v
                     v                v      글 보기로 이동
            /posts/[id]/edit      삭제 확인 → 목록으로
                  수정

                  관리자만 ──→ /admin/users  직원 역할 변경
```

### 라우트 구조

```
src/app/
  layout.tsx                              루트. 한글 폰트·Tailwind
  (public)/
    login/page.tsx                        로그인 안내 (+ 개발용 임시 로그인)
  (internal)/                             ★ 여기 아래는 전부 로그인 필수
    layout.tsx                            requireSession() · 상단 헤더
    page.tsx                              글 목록 (메인)
    posts/new/page.tsx                    글 쓰기
    posts/[id]/page.tsx                   글 보기
    posts/[id]/edit/page.tsx              글 수정
    admin/users/page.tsx                  사용자 관리 (requireAdmin)
  actions/
    auth.ts                               로그인·로그아웃
    posts.ts                              글 작성·수정·삭제·열람기록
    admin.ts                              역할 변경
  api/
    auth/callback/route.ts                포털에서 돌아오는 자리
    images/route.ts                       POST 본문 사진 업로드
    images/[id]/route.ts                  GET 사진 내려주기 (권한 검사)
    files/route.ts                        POST 첨부파일 업로드
    files/[id]/route.ts                   GET 첨부파일 내려받기 (권한 검사)
```

- 라우트 그룹으로 **공개 구간 / 사내 구간 경계를 눈에 보이게** 나눈다.
- 이 사이트에는 **공개 구간이 사실상 없다.** `(public)/login` 하나뿐이고, 거기서 사내 데이터를 조회하지 않는다.
- 휴가 시스템의 `/pending`(명단 연결 대기) 같은 화면은 **필요 없다.**
  포털을 통과한 임직원은 누구나 바로 쓸 수 있다 (요구사항 2).

---

## 2. 로그인 — 어댑터 4개 파일에 가둔다

`src/lib/auth/` 안에만 둔다. 화면·API 어디서도 쿠키를 직접 읽지 않는다.

| 파일 | 하는 일 |
|---|---|
| `oidc.ts` | 포털의 discovery 문서를 읽고 `/authorize` 로 보낸다. 돌아온 code 를 토큰으로 바꾸고 ID 토큰을 검증한다 |
| `session.ts` | 이 사이트 세션 쿠키 발급·조회·삭제. **파일 하나뿐** |
| `guards.ts` | `requireSession()` · `requireAdmin()` · `canEditPost()`. 권한 판정은 여기서만 |
| `dev-login.ts` | **개발용 임시 로그인.** 맨 위에 `// dss-auth OIDC 연결 시 폐기 대상` 주석 |

### ID 토큰 검증 (`jose`, 하나도 빠뜨리지 않는다)

1. **서명** — 포털 `/jwks` 로 검증. 캐싱하되 모르는 `kid` 면 다시 받는다
2. **`iss`** — `OIDC_ISSUER` 와 끝 슬래시까지 정확히 일치
3. **`aud`** — `dss-board` 와 일치
4. **`nonce`** — 보낸 값과 일치
5. **`exp`·`iat`** — 시계 오차 허용 30초
6. **`alg`** — `RS256` 만. `none`·`HS256` 은 거부

검증 실패 시 **예외를 밖으로 던지지 않고** 로그인 실패로 처리한다. 사용자에게 상세 사유를 보여주지 않는다.

### PKCE 상태 운반

`code_verifier` · `state` · `nonce` 는 **DB 표를 새로 만들지 않고 서명된 10분 쿠키**에 담는다.
서명하지 않으면 사용자가 `code_verifier` 를 바꿔치기해 PKCE 를 무력화할 수 있다.

### 이 사이트의 세션

- 쿠키 이름 **`board_session`** (포털 `dss_sso` · 휴가 `leave_session` 과 겹치지 않는다)
- `httpOnly: true` · `sameSite: "lax"` · `path: "/"` · `secure` 는 **HTTPS 일 때만**
  → 사내망 HTTP 에서 `secure` 를 켜면 쿠키가 저장되지 않아 **로그인이 조용히 실패**한다
- **서버 저장형**: 쿠키에는 랜덤 토큰 원문, DB 에는 그 sha256 만. 퇴사자를 즉시 끊을 수 있다
- 수명 **12시간** (포털 SSO 세션 절대 만료를 넘기지 않는다)

### 처음 로그인하는 사람

`auth_sub` 가 처음 보이면 `web_users` 에 행을 만든다. **역할은 항상 `MEMBER`.**
이름·이메일은 로그인할 때마다 토큰 값으로 갱신한다. 사람 식별은 **`auth_sub` 로만** 한다.

### 로그아웃 2종

| 메뉴 | 동작 |
|---|---|
| 로그아웃 | 이 사이트 세션만 끊는다 |
| 포털까지 로그아웃 | discovery 의 `end_session_endpoint` 로 보낸다 (주소 하드코딩 금지) |

---

## 3. 데이터 구조

> 표 이름 `web_` + snake_case + 복수형 · 기본키 UUID · 시각은 `timestamptz`.
> **소프트 삭제 4칸**은 `is_deleted` · `deleted_at` · `deleted_by` · `delete_reason` 로 이름·개수 고정.

### `web_users`

| 칸 | 형 | 비고 |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `auth_sub` | uuid **UNIQUE** | 포털 ID 토큰의 `sub`. 사람을 잇는 유일한 열쇠 |
| `display_name` | text NOT NULL | 화면 표시용. 로그인마다 갱신 |
| `email` | text **NULL 허용** | 카카오에서 안 올 수 있다 |
| `role` | text NOT NULL | `MEMBER` \| `ADMIN` — CHECK 제약 |
| `is_active` | boolean NOT NULL | 기본 `true` |
| `last_login_at` | timestamptz NULL | |
| `created_at` / `updated_at` | timestamptz NOT NULL | |
| 소프트 삭제 4칸 | | |

### `web_sessions`

| 칸 | 형 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → `web_users.id` | |
| `token_hash` | text **UNIQUE** | 쿠키 토큰의 sha256. 원문은 저장하지 않는다 |
| `expires_at` | timestamptz | |
| `revoked_at` | timestamptz NULL | 끊긴 세션 |
| `created_at` | timestamptz | |

### `web_posts` — 이 사이트의 중심

| 칸 | 형 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `author_id` | uuid → `web_users.id` | |
| `topic` | text NOT NULL | `MUST_READ`(필독) \| `NOTICE`(공지) \| `GENERAL`(일반) — CHECK |
| `title` | varchar(200) NOT NULL | |
| `content` | jsonb NOT NULL | 서식 본문. **구조화된 문서로 저장** (5절) |
| `content_text` | text NOT NULL | 검색용으로 글자만 뽑아둔 것 |
| `created_at` / `updated_at` | timestamptz | |
| 소프트 삭제 4칸 | | |

**왜 주제를 영문 코드로 저장하나:** 화면에는 `필독`·`공지`·`일반` 로 보여주되 DB 에는 영문 코드를 넣는다.
계측기 시스템에서 **psql 로 한글을 넘기면 깨지는 문제**를 이미 겪었다. 조건문에 한글 리터럴이
들어가지 않게 해 두면 그 함정을 피할 수 있다.

**인덱스**

```
web_posts_live_created_idx    (created_at DESC)  WHERE is_deleted = false
web_posts_live_topic_idx      (topic, created_at DESC)  WHERE is_deleted = false
web_posts_author_idx          (author_id)
```

### `web_post_views` — 누가 읽었는가

| 칸 | 형 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `post_id` | uuid → `web_posts.id` | |
| `user_id` | uuid → `web_users.id` | |
| `first_viewed_at` | timestamptz | 명단 정렬 기준 |
| `last_viewed_at` | timestamptz | |
| `view_count` | integer | 기본 1 |

`UNIQUE (post_id, user_id)` — 같은 사람이 열 번 봐도 명단에는 한 번만 나온다.

### `web_post_images` — 본문에 붙인 사진

| 칸 | 형 | 비고 |
|---|---|---|
| `id` | uuid PK | 주소에 그대로 쓰인다: `/api/images/{id}` |
| `post_id` | uuid NULL → `web_posts.id` | 글 저장 전에는 비어 있다 |
| `uploaded_by` | uuid → `web_users.id` | |
| `storage_path` | text | **상대경로만.** `images/2026/10/{uuid}.png` |
| `original_name` | text | 화면 표시용 |
| `mime_type` / `byte_size` | text / bigint | 서버가 직접 판정한 값 |
| `created_at` | timestamptz | |
| 소프트 삭제 4칸 | | |

### `web_post_files` — 첨부파일

| 칸 | 형 | 비고 |
|---|---|---|
| `id` | uuid PK | 주소에 그대로 쓰인다: `/api/files/{id}` |
| `post_id` | uuid NULL → `web_posts.id` | 글 저장 전에는 비어 있다 |
| `uploaded_by` | uuid → `web_users.id` | |
| `storage_path` | text | **상대경로만.** `files/2026/10/{uuid}.xlsx` |
| `original_name` | text | 화면에 보이는 이름이자 내려받을 때 붙는 이름 |
| `mime_type` / `byte_size` | text / bigint | **서버가 직접 판정한 값.** 브라우저가 보낸 값이 아니다 |
| `download_count` | integer | 기본 0 |
| `sort_order` | integer | 올린 순서 |
| `created_at` | timestamptz | |
| 소프트 삭제 4칸 | | |

`post_id` 에 인덱스를 둔다 (`WHERE is_deleted = false` 부분 인덱스).

### `web_audit_logs` — 추가만 한다

| 칸 | 형 |
|---|---|
| `id` / `actor_id`(NULL) / `action` / `target_type` / `target_id`(NULL) / `detail`(jsonb) / `created_at` |

남기는 행위: 로그인 · 로그아웃 · 글 작성 · 수정 · 삭제 · 역할 변경 ·
사진 업로드 · **첨부파일 업로드 · 첨부파일 내려받기**.
**UI 로 개별 기록을 지울 수 있게 만들지 않는다.**

> **소프트 삭제 4칸을 두지 않는 표**: `web_sessions`(끊기는 것은 `revoked_at` 이 담당) ·
> `web_post_views`(열람 기록은 지우지 않는다) · `web_audit_logs`(추가 전용).
> 업무 데이터 표(`web_users` · `web_posts` · `web_post_images` · `web_post_files`)에는 전부 둔다.

---

## 4. 목록 · 정렬 · 검색 · 페이지 (요구사항 5·7·8·10·11)

주소로 상태를 나타낸다: `/?topic=MUST_READ&q=안전&page=2`

### 정렬 — 세 가지 경우가 다르다

| 상황 | 정렬 |
|---|---|
| **기본** (필터·검색 없음) | `ORDER BY (topic = 'MUST_READ') DESC, created_at DESC` → **필독이 항상 맨 위**, 그 안에서 최신순 |
| **주제 필터** | `WHERE topic = ?` + `ORDER BY created_at DESC` (이미 한 주제만 보므로 고정 없음) |
| **검색** | `ORDER BY created_at DESC` (찾는 글이 위에 오게. 필독 고정 해제) |

- 필독 글이 20개를 넘으면 1페이지가 전부 필독으로 찬다. **의도된 동작**이다.
- 목록에서 **필독 행은 제목을 굵게** 쓴다.

### 검색

- 범위: **제목 + 본문 글자(`content_text`) + 작성자 이름**
- 방식: `ILIKE '%키워드%'` 로 세 곳을 OR. 20명 규모·글 수천 건까지는 충분히 빠르다
- `%` · `_` 는 escape 해서 넘긴다. SQL 은 **반드시 Drizzle 파라미터 바인딩**으로만 만든다

### 페이지

- `LIMIT 20 OFFSET (page-1)*20` + 같은 조건의 `COUNT(*)` 로 전체 쪽수를 구한다
- `page` 는 1 이상 정수만 받고, 범위를 벗어나면 1쪽으로 돌린다

---

## 5. 서식 본문 — 저장과 보안 (요구사항 4)

### 저장 형태

Tiptap 에디터의 **구조화된 문서(JSON)** 를 `web_posts.content` 에 넣는다.
**HTML 문자열을 그대로 저장하지 않는다.**

### 화면에 보일 때 — `dangerouslySetInnerHTML` 을 아예 쓰지 않는다

저장된 JSON 을 **직접 만든 작은 렌더러가 React 요소로** 바꿔 그린다.
우리가 아는 노드만 그리고 모르는 것은 버리므로, 본문으로 스크립트가 들어올 길이 없다.

| 허용 | 목록 |
|---|---|
| 노드 | `doc` `paragraph` `text` `hardBreak` `bulletList` `orderedList` `listItem` `image` `blockquote` |
| 마크 | `bold` `italic` `underline` `link` `textStyle`(글자색·글자크기) |
| 문단 속성 | `textAlign` — `left` `center` `right` 만 |
| 글자색 | `#rrggbb` 형태만 (정규식 검사) |
| 글자크기 | 미리 정한 목록(예: 12·14·16·18·24·32px)에 있는 값만 |
| 링크 | `http://` · `https://` 로 시작하는 것만. `target="_blank"` + `rel="noopener noreferrer nofollow"` |
| 이미지 | `src` 가 **`/api/images/{uuid}` 형태일 때만** 그린다. 외부 주소·`data:` 는 거부 |

그 외 노드·마크·속성은 **조용히 버린다.**

### 필요한 패키지 (전부 순수 JS — 네이티브 바이너리 없음)

```
@tiptap/react  @tiptap/starter-kit  @tiptap/extension-image
@tiptap/extension-text-style  @tiptap/extension-color
@tiptap/extension-text-align  @tiptap/extension-underline
@tiptap/extension-link
```

`sharp` · `canvas` 같은 금지 라이브러리는 쓰지 않는다. 사진 리사이즈·썸네일은 1차에 넣지 않는다.

---

## 6. 사진 붙여넣기 · 첨부파일 (요구사항 4)

### 6-1. 본문 사진

```
  본문에서 Ctrl+V (또는 드래그&드롭)
            |
            v
  POST /api/images   (multipart, 사진 1장)
            |
      [ 서버 검사 ]
       1. 로그인 확인
       2. 확장자 화이트리스트: png · jpg · jpeg · gif · webp
       3. 앞부분 바이트(매직 넘버)가 확장자와 맞는지
          PNG 89504E47 / JPEG FFD8FF / GIF 474946 / WEBP RIFF…WEBP
       4. MZ(Windows 실행파일) · ELF(Linux) 헤더면 즉시 거부
       5. 브라우저가 보낸 MIME 은 믿지 않는다
       6. 10MB 넘으면 중단
            |
            v
   ① 파일을 먼저 디스크에 쓴다
      {STORAGE_ROOT}/images/2026/10/{uuid}.png
   ② 그 다음 DB 에 기록한다
      (순서를 반대로 하면 DB 에는 있고 디스크에는 없는 사진이 생긴다.
       이 순서면 최악의 경우 주인 없는 파일이 남고, 그건 치울 수 있다)
            |
            v
   { id, url: "/api/images/{id}" } 반환 → 에디터가 본문에 그림을 넣는다
            |
            v
   글 저장 시 본문 JSON 안의 이미지 id 들을 찾아 post_id 를 채운다
```

### 내려줄 때 — `GET /api/images/[id]`

- **세션 확인 후** 스트림으로 내려준다. 정적 폴더로 노출하지 않는다
- `X-Content-Type-Options: nosniff`
- 한글 원본 파일명은 `Content-Disposition` 의 `filename*=UTF-8''…` 형식

### 6-2. 첨부파일

흐름은 사진과 같다. 다른 점만 적는다.

```
  글 쓰기 화면에서 파일 선택 또는 드래그&드롭
            |
            v
  POST /api/files   (한 번에 여러 개도 받는다)
            |
      [ 서버 검사 — 확장자를 믿지 않는다 ]
       1. 로그인 확인
       2. 확장자 화이트리스트 (아래 표). 없는 것은 전부 거부
       3. 파일 앞부분 바이트가 그 확장자와 맞는지
       4. MZ(Windows 실행파일) · ELF(Linux) 헤더면 무조건 거부
       5. 브라우저가 보낸 MIME 은 버리고 서버가 판정한 값을 저장
       6. 한 개 10MB 초과 / 한 글 10개 초과면 거부
            |
            v
   ① 파일을 먼저 디스크에 쓴다  {STORAGE_ROOT}/files/2026/10/{uuid}.xlsx
   ② 그 다음 DB 에 기록한다
            |
            v
   { id, originalName, byteSize } 반환 → 화면의 첨부 목록에 줄이 하나 생긴다
            |
            v
   글 저장 시 그 id 들의 post_id 를 채운다
```

**허용 확장자와 파일 앞부분 검사**

| 종류 | 확장자 | 앞부분이 이래야 한다 |
|---|---|---|
| PDF | `pdf` | `%PDF` |
| 새 오피스 · 한글 · 압축 | `xlsx` `docx` `pptx` `hwpx` `zip` | `PK` (ZIP 구조) |
| 옛 오피스 · 한글 | `xls` `doc` `ppt` `hwp` | OLE2 서명 `D0CF11E0A1B11AE1` |
| 사진 | `png` `jpg` `jpeg` `gif` `webp` | 6-1 과 동일 |
| 글자 파일 | `txt` `csv` | 고정 서명이 없다 → **실행파일 헤더가 아닌 것**과 널바이트가 섞이지 않은 것만 통과 |

- **매크로가 들어갈 수 있는 `xlsm` · `docm` · `pptm` 은 허용하지 않는다.**
- `exe` `bat` `cmd` `ps1` `sh` `msi` `jar` `vbs` `js` `scr` `lnk` 등은 화이트리스트에 없으므로 자동 거부된다.
- 올리는 쪽에서도 `accept` 로 한 번 걸러주되, **실제 차단은 서버에서** 한다.

**내려받을 때 — `GET /api/files/[id]`**

- **세션 확인 후** 스트림으로 내려준다. 정적 폴더로 노출하지 않는다
- **항상 `Content-Disposition: attachment`** — 브라우저에서 바로 열리지 않게 한다.
  HTML·SVG 가 섞여 들어와도 브라우저가 실행하지 않는다
- `Content-Type: application/octet-stream` + `X-Content-Type-Options: nosniff`
- 한글 파일명은 `filename*=UTF-8''…` 형식으로 붙인다
- `download_count` 를 1 올리고 감사 로그에 남긴다

### 경로 규칙 (NAS 이식 — 사진·첨부 공통)

- 저장 루트는 `STORAGE_ROOT` 환경변수. **절대경로를 DB 에 넣지 않는다**
- DB 경로는 **항상 `/` 구분자**. DB 에 넣을 문자열을 만들 때 `path.join()` 을 쓰지 않는다
  → `path.join` 은 **실제 파일에 닿는 함수 딱 하나**에서만 쓴다
- 파일명은 **UUID + 확장자, 전부 소문자.** 한글·공백·원본 파일명을 디스크에 쓰지 않는다

### 주인 없는 파일 정리

글을 저장하지 않고 창을 닫으면 `post_id` 가 빈 사진·첨부가 남는다.
`scripts/cleanup-orphans.ts` 를 **tsx 로 실행**해 24시간 지난 미연결 사진·첨부를 치운다.
**PowerShell 스크립트는 만들지 않는다** (Linux 컨테이너에서 돌지 않는다).

---

## 7. 열람자 명단 (요구사항 6)

```
  글 보기 화면이 열린다
        |
   서버: 명단을 먼저 읽어서 그린다  (SELECT … ORDER BY first_viewed_at)
        |
   화면이 떠 있는 상태에서 작은 클라이언트 조각이 한 번만 서버 액션을 부른다
        |
   INSERT … ON CONFLICT (post_id, user_id)
     DO UPDATE SET last_viewed_at = now(), view_count = view_count + 1
        |
   성공하면 내 이름을 명단 끝에 바로 붙인다 (새로고침 없이)
```

**왜 서버 렌더 중에 기록하지 않나:** 목록에서 링크에 마우스만 올려도 Next.js 가 미리 불러올 수
있어, 읽지 않은 사람이 명단에 들어간다. 그래서 **화면이 실제로 열린 뒤 한 번** 기록한다.

- 작성자가 자기 글을 봐도 명단에 들어간다
- 명단은 **누구나** 볼 수 있다 (관리자 전용 아님)
- 보이는 방식: `읽음 7명 — 김부장, 이과장, 박차장, …` / 많으면 접었다 펼친다

---

## 8. 권한 판정 (요구사항 9)

`guards.ts` 한 곳에서만 판정한다.

```
canEditPost(viewer, post) = viewer.isAdmin || post.authorId === viewer.user.id
canDeletePost(viewer, post) = 위와 같다
```

- **클라이언트가 보낸 작성자 ID·역할을 절대 믿지 않는다.** 폼 필드·쿼리스트링에 담겨 온 값으로
  판정하지 않는다. 항상 **세션에서 얻은 값**으로만 판정한다
- 화면에서 버튼을 숨기는 것은 UI 편의일 뿐이다. **수정·삭제 서버 액션 안에서 다시 판정**한다
- 상태를 바꾸는 요청은 **요청 출처(Origin)** 도 확인한다
- 삭제는 `is_deleted = true` 로 표시하고 `deleted_by` 에 누가 지웠는지 남긴다.
  **되살리는 기능·화면은 만들지 않는다** (사용자 결정). 지우기 전에 한 번 더 묻는다

---

## 9. 디자인 방향 (요구사항 1)

**타사 사내 게시판에서 흔히 보는, 군더더기 없는 표 형태.**

| 항목 | 지정 |
|---|---|
| 배경 | 흰색. 카드 그림자·그라디언트 없음 |
| 구분 | 얇은 회색 선(`border-gray-200`)만 |
| 포인트 색 | 남색 계열 하나 (`blue-700`) — 버튼·링크 |
| 글꼴 | **시스템 기본 글꼴.** 외부 폰트 CDN 을 쓰지 않는다 (사내망·NAS 에서 막힐 수 있다) |
| 주제 배지 | 필독 = 빨강 / 공지 = 파랑 / 일반 = 회색. 작은 사각 배지 |
| 필독 행 | 제목을 **굵게**. 배경을 아주 옅게 깐다 |
| 표 | 주제 · 제목 · 작성자 · 작성일 4열. 작성일은 올해면 `MM-DD`, 지난해면 `YY-MM-DD` |
| 첨부 표시 | 첨부가 있는 글은 제목 옆에 작은 클립 표시와 개수 (`📎 2`) |
| 첨부 목록 | 글 보기 본문 아래. 파일 이름 · 크기(`1.2MB`) · 내려받기 버튼 한 줄씩 |
| 휴대폰 | 4열이 안 들어가므로 작성자·작성일을 제목 아래 작은 글씨로 내린다 |
| 한 화면 | 최대 폭 1100px, 가운데 정렬 |

상단 헤더: 왼쪽에 `DSS 사내 게시판`, 오른쪽에 내 이름 · 로그아웃. 관리자에게만 `사용자 관리` 링크.

---

## 10. 환경 설정

### `.env.local` (git 에 넣지 않는다 · 화면에 출력하지 않는다)

```
DATABASE_URL=postgres://<계정>:<비밀번호>@127.0.0.1:5432/dss_board
PORT=3400
STORAGE_ROOT=C:\WEB-DATA\dss-board      # NAS 에서는 /data
SESSION_COOKIE_SECURE=false             # HTTPS 붙이면 true
SESSION_HOURS=12

DEV_FAKE_LOGIN_ENABLED=true             # 개발 PC 에서만. 기본값은 꺼짐
OIDC_ISSUER=                            # 포털 완성 후 채운다
OIDC_CLIENT_ID=dss-board
OIDC_CLIENT_SECRET=                     # NEXT_PUBLIC_ 접두사 절대 금지
OIDC_REDIRECT_URI=http://localhost:3400/api/auth/callback
```

`src/lib/env.ts` 에서 한곳으로 읽고, **비밀값이 없으면 조용히 기본값으로 넘어가지 않고 throw** 한다.

### NAS 준비

- `next.config.ts` 에 `output: "standalone"`
- `Dockerfile` 멀티스테이지 (deps → build → runner)
- `.dockerignore` 에 `node_modules` · `.next` · `.env*`
- 서버는 `0.0.0.0` 에 바인딩 (`next dev -H 0.0.0.0 -p 3400`)
- 개발 DB 는 `docker-compose.yml` 로도 띄울 수 있게 둔다
- 사진 저장 폴더는 컨테이너에 **볼륨으로 붙인다** (`/data`)

### 빌드 참고

회사 PC 의 Application Control 이 SWC 바이너리를 막으면 Turbopack 이 돌지 않는다.
그때는 `next dev --webpack` / `next build --webpack` 을 쓴다.

---

## 11. 만들 순서

| # | 단계 | 결과 |
|---|---|---|
| 1 | 프로젝트 생성 · 설정 | Next 16.3.3 · Tailwind 4 · Drizzle · `output: standalone` |
| 2 | DB 스키마 + 마이그레이션 **생성** | `npx drizzle-kit generate`. **적용은 승인 후** |
| 3 | 인증 어댑터 · 임시 로그인 · 가드 | 로그인해서 들어오는 것까지 |
| 4 | **글 목록** | 정렬(필독 고정) · 검색 · 주제 필터 · 20개 페이지 |
| 5 | 글 쓰기 · 수정 | 에디터 + 사진 붙여넣기 + **첨부파일 업로드** |
| 6 | 글 보기 | 본문 렌더러 + **첨부 내려받기** + 열람자 명단 |
| 7 | 삭제 | 확인 후 삭제 |
| 8 | 사용자 관리 | 관리자 역할 지정 |
| 9 | 첫 관리자 지정 스크립트 · Dockerfile · README | tsx 스크립트 |

**한 번에 하나씩** 만들고 중간중간 화면으로 확인받는다.

- `drizzle-kit generate` 로 만든 SQL 은 **손으로 고치지 않는다**
- `migrate` 실행과 데이터 변경은 **승인 후에만** 한다
- 기존 데이터를 지우거나 초기화하는 명령은 임의로 실행하지 않는다
- 운영 배포는 직접 하지 않는다. 절차와 명령어만 적어준다
- git push 는 요청이 있을 때만 한다

---

## 12. 이 설계에서 미리 밝혀두는 판단

| # | 판단 | 이유 |
|---|---|---|
| D1 | 주제를 영문 코드(`MUST_READ` 등)로 저장 | psql 한글 깨짐 함정을 피한다. 화면에는 한글로 보여준다 |
| D2 | 본문을 HTML 이 아니라 구조화된 JSON 으로 저장 | `dangerouslySetInnerHTML` 을 아예 쓰지 않을 수 있다 |
| D3 | 검색은 `ILIKE`, 전문검색 색인 없음 | 20명 규모에서 과한 설계다. 느려지면 그때 넣는다 |
| D4 | 열람 기록은 화면이 열린 뒤 클라이언트에서 한 번 | 미리 불러오기(prefetch)로 조회수가 늘지 않게 |
| D5 | 사진 리사이즈·썸네일 없음 | `sharp` 가 금지 라이브러리다. 10MB 제한으로 대신한다 |
| D6 | `web_sessions`·`web_post_views`·`web_audit_logs` 에는 소프트 삭제 칸 없음 | 지우는 개념이 없는 표다 (3절 끝 참고) |
| D7 | 첨부는 **항상 내려받기**로만 내려준다 (`attachment`) | 브라우저에서 바로 열리면 HTML·SVG 가 섞여 들어올 때 스크립트가 실행될 수 있다 |
| D8 | 매크로 오피스(`xlsm`·`docm`·`pptm`)는 허용하지 않음 | 사내 게시판에 매크로가 돌아다니면 위험하다. 필요하면 zip 으로 묶어 올린다 |
