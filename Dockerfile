# DSS 사내 게시판 — 운영 이미지
#
# NAS(Synology DS218+, Linux) 용. 멀티스테이지: deps → build → tools → runner
# 네이티브 바이너리가 필요한 라이브러리를 쓰지 않는다.
#
# 개발 PC에서 굽고 NAS로 옮긴다.
#
#   docker build -t dss-board:0.1 .
#   docker build --target tools -t dss-board-tools:1 .
#   docker save dss-board:0.1 -o dss-board-0.1.tar
#   (NAS에서) docker load -i dss-board-0.1.tar
#
# 🔴 굽는 것도 올리는 것도 사람이 한다. 이 파일은 그때 쓸 절차를 적어 둔 것이지,
#    지금 돌리라는 뜻이 아니다.

# 베이스는 ARG 로 뺀다. 기본값이 node:22-bookworm-slim 인 까닭:
#
#  · NAS 에 이미 도는 여섯 이미지(통합 로그인 · A/S · 계측기 · 개선요청 · PO ·
#    휴가)가 전부 이 베이스다. 바닥이 같으면 도커가 레이어를 나눠 써서 디스크를
#    덜 먹는다 — 그 기계는 공간이 넉넉하지 않다.
#  · 이미 여섯이 운영으로 검증한 바닥이다.
#
# ARG 로 두는 것은 나중에 굽는 자리에서 한 줄로 바꿀 수 있게 하려는 것이다:
#   docker build --build-arg NODE_IMAGE=node:24-bookworm-slim .
ARG NODE_IMAGE=node:22-bookworm-slim

# ── 1단계 : 라이브러리만 설치한다 ─────────────────────────────────────
#
# package 파일만 먼저 복사한다. 소스를 먼저 복사하면 화면 한 줄만 고쳐도
# 라이브러리를 처음부터 다시 깐다.
#
# 🔴 여기서는 devDependency 까지 전부 깐다(NODE_ENV 를 두지 않는다). 2단계의
#    next build 도, 아래 tools 스테이지의 drizzle-kit 도 그것이 있어야 돈다.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── 2단계 : 앱을 굽는다 ───────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# 빌드에만 쓰는 가짜 DATABASE_URL. 🔴 지우지 마라 — 없으면 빌드가 멈춘다.
#
# `next build` 는 각 화면의 데이터를 모으려고 서버 모듈을 실제로 불러온다.
# /admin/users 가 서버 컴포넌트에서 db.select() 를 부르고, 그때 src/lib/env.ts 의
# required("DATABASE_URL") 이 값이 없으면 던진다. 이미지에는 .dockerignore 가
# .env* 를 막아 두어(그게 맞다) 값이 없다. 실측으로 확인한 증상:
#   Error: Failed to collect page data for /admin/users
# 개발 PC 에는 .env.local 이 있어 드러나지 않고 이미지 안에서만 드러난다.
#
# 접속은 하지 않는다 — postgres.js 는 실제로 쓸 때 연결한다. 값이 "있기만" 하면
# 되므로 누가 봐도 가짜인 값을 쓴다.
#
# 🔴 이 값은 이 단계에만 있고 최종 이미지에는 남지 않는다 — runner 는 별도 FROM
#    이라 이 ENV 를 물려받지 않는다. 운영에서는 compose 가 진짜 값을 환경변수로
#    넣는다. (마이그레이션을 돌리는 tools 스테이지에도 넣지 않는다. 거기는 진짜
#    DATABASE_URL 을 받아야 하는 자리다.)
ENV DATABASE_URL="postgres://build:build@127.0.0.1:5432/build_time_only"

RUN npm run build

# ── 곁가지 : 마이그레이션을 돌리는 도구 이미지 ────────────────────────
#
# 운영 이미지(runner)에는 drizzle-kit 이 없다 — devDependency 라서다. 그래서
# 그 안에서는 db:migrate 를 부를 수 없다. 이 스테이지가 그 자리를 맡는다.
#
#   docker build --target tools -t dss-board-tools:1 .
#
# NAS 에서는 compose 의 `profiles: [tools]` 서비스로 두고, 부를 때만 잠깐
# 떴다 사라진다(`run --rm`). 상시 서비스가 아니라 메모리 예산 밖이다.
#
# ⚠️ 이 스테이지를 runner 뒤로 옮기지 않는다. **마지막 스테이지가 `docker build`
#    의 기본 대상**이라, 뒤에 두면 `--target` 없이 구운 이미지가 앱이 아니라
#    도구가 된다 — 그 이미지는 `node server.js` 를 모른다.
FROM ${NODE_IMAGE} AS tools
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Seoul NEXT_TELEMETRY_DISABLED=1

# ⚠️ 소유자는 COPY 할 때 정한다. 다 옮겨 놓고 `RUN chown -R /app` 을 하면 그
#    한 줄이 /app 전체를 새 레이어에 한 벌 더 복사한다 — 계측기 도구 이미지에서
#    실측 1.86GB → 1.07GB.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json drizzle.config.ts ./
COPY --chown=node:node src ./src
# 마이그레이션 SQL 과 적용 이력(meta/_journal.json).
COPY --chown=node:node drizzle ./drizzle
# 🔴 tsconfig.json 의 경로(@dss/ui)가 이 폴더를 가리킨다. 빠뜨리면 경로 해석이
#    깨질 수 있다 — 별도 저장소 dss-ui 를 git submodule 로 끌어온 자리다.
COPY --chown=node:node vendor ./vendor
# 운영용 비상구. make:admin 은 포털(dss-auth)이 막혔을 때 관리 화면에 들어갈
# 유일한 길이고(scripts/make-admin.ts 머리말), cleanup:orphans 는 글에 못 붙은
# 사진을 치운다. 비상구는 쓸 일이 생긴 뒤에 넣을 수 없으니 미리 담는다.
COPY --chown=node:node scripts ./scripts

USER node

# 기본값은 아무것도 바꾸지 않는 쪽으로 둔다. 적용은 명령을 적어 부른다:
#   docker compose … --profile tools run --rm tools-board npm run db:migrate
CMD ["node", "-e", "console.log('db:migrate 를 명령으로 적어 부르세요.')"]

# ── 3단계 : 실행에 필요한 것만 담는다 ─────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3400
ENV TZ=Asia/Seoul
# 사진·첨부파일은 컨테이너 안에 쌓지 않는다. 이 경로에 NAS 폴더를 볼륨으로 붙인다.
ENV STORAGE_ROOT=/data

# 🔴 사용자는 이미지에 이미 있는 node(uid 1000)를 쓴다. 따로 만들지 않는다.
#    NAS 의 첨부 폴더(/volume1/dss/*)는 Synology ACL 을 걷고 **uid 1000** 에게
#    내준 자리다(dss-deploy/nas/setup/01-prepare.sh). uid 가 다른 계정으로 돌면
#    글에 사진을 붙이는 순간 권한 오류가 나는데, 그것이 배포할 때는 보이지 않고
#    사람이 쓸 때 처음 드러난다.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# 돌면서 캐시를 쓰는 자리(revalidatePath 가 여기에 쓴다). 미리 만들어 node 에게
# 준다. chown 은 새로 만든 폴더 둘에만 건다 — /app 전체에 -R 로 걸면 레이어가
# 한 벌 더 생긴다.
RUN mkdir -p .next/cache && chown node:node .next .next/cache

RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 3400
CMD ["node", "server.js"]
