/**
 * ============================================================================
 * 「이 사람이 아직 안 읽은 공지」를 밖으로 내주는 통로
 * ============================================================================
 * 통합 종이 쓴다 — 포털(dss-auth)이 등록된 시스템마다 이 통로에 물어 합친다.
 * 그래야 A/S 든 계측기든 개선요청이든 PO 든 휴가든 **어느 시스템에서 종을
 * 열어도** 이 게시판의 공지가 보인다.
 *
 * 앞 조각이 만든 목록을 **그대로** 내준다(notifications/queries.ts 의
 * listUnreadNoticeNotifications · notifications/bell-items.ts). 화면의 종이
 * 보는 바로 그 줄들이다 — 규칙을 두 벌로 적으면 같은 사람이 이 게시판에서는
 * 6건, 포털에서는 다른 수를 보게 된다. 그 줄들은 이미 포털이 읽을 아홉 칸
 * 모양이다(`key` 가 `client_id:id` 이고 `href` 가 절대 주소다) — 앞 조각이
 * 이 통로를 내다보고 그렇게 만들어 두었다.
 *
 * 🔴 대상 사용자는 **토큰 안에서만** 온다. 쿼리 문자열을 읽지 않는다 — 읽으면
 * 토큰 하나로 아무 사람의 알림이나 볼 수 있는 문이 된다.
 *
 * ── 🔴 GET 이다 (POST 가 아니다) ────────────────────────────────────────
 * dss-auth/docs/사이트-알림-통로.md 의 POST 는 **반대 방향** — 사이트가 포털에
 * 물을 때의 것이고, 자격도 `client_secret`(Basic)이다. 포털이 우리에게 올
 * 때는 GET 으로 오고 자격은 포털이 RS256 으로 서명한 Bearer 토큰이다.
 * 읽기뿐이라 GET 이 맞고, 토큰을 쿼리가 아니라 `Authorization` 머리말로 받는
 * 것은 쿼리가 접근 로그에 그대로 남기 때문이다.
 *
 * ⚠️ 포털은 이 왕복을 **1.5초**만 기다린다(그쪽 READ_TIMEOUT_MS). 여기서 하는
 * 일은 색인을 타는 질의 둘뿐이다 — 사람 되짚기(web_users_auth_sub_uq)와 공지
 * 목록(web_posts_live_topic_idx).
 * ============================================================================
 */
import { and, eq } from "drizzle-orm";

import {
  PORTAL_TOKEN_PURPOSES,
  readBearerToken,
  verifyPortalServiceToken,
} from "@/lib/auth/portal-service-token";
import { db } from "@/lib/db";
import { webUsers } from "@/lib/db/schema";
import { UUID_RE } from "@/lib/http";
import type { BoardNotificationFeed } from "@/lib/notifications/bell-items";
import { listUnreadNoticeNotifications } from "@/lib/notifications/queries";

/** 🔴 이 응답이 캐시되면 이미 읽은 공지가 남의 종에 계속 남는다. 모든 답에 붙인다. */
const NO_STORE = { "cache-control": "no-store" };

/** 되짚지 못한 사람의 답. 🔴 오류가 아니다(아래 머리말). */
const EMPTY_FEED: BoardNotificationFeed = { items: [], count: 0 };

/**
 * 포털 쪽 sub 로 이 게시판의 사람을 찾는다. 없으면 null.
 *
 * ── 🔴 uuid 모양을 먼저 본다 ────────────────────────────────────────────
 * `web_users.auth_sub` 는 **uuid 칸**이다(schema.ts). 모양이 다른 글자로
 * 비교하면 PostgreSQL 이 22P02(invalid input syntax for type uuid)로 **던진다**
 * — 백채널 로그아웃 통로가 같은 자리에서 그것을 try/catch 로 받아 500 을 낸다.
 * 여기서는 500 이 날 자리가 아니다(포털 화면에서 이 시스템 한 줄이 상한 것처럼
 * 보인다). 그래서 묻기 전에 모양을 보고, 모양이 아니면 **못 찾은 것**으로
 * 친다 — 어차피 uuid 칸에 맞을 수 있는 값이 아니다.
 *
 * ── 살아 있는 사람만 ────────────────────────────────────────────────────
 * 정지(`is_active=false`)·삭제된 사람은 못 찾은 것으로 친다. 세션을 읽는 자리
 * (auth/session.ts 의 getSessionUser)와 **같은 줄**이다 — 이 게시판 화면에서
 * 막힌 사람의 공지 알림이 포털의 종에는 계속 뜨면 안 된다.
 */
async function findActiveUserIdByAuthSub(authSub: string): Promise<string | null> {
  if (!UUID_RE.test(authSub)) return null;

  const rows = await db
    .select({ id: webUsers.id })
    .from(webUsers)
    .where(
      and(
        eq(webUsers.authSub, authSub),
        eq(webUsers.isActive, true),
        eq(webUsers.isDeleted, false),
      ),
    )
    .limit(1);

  return rows[0]?.id ?? null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const verified = await verifyPortalServiceToken(
      readBearerToken(request.headers.get("authorization")),
      PORTAL_TOKEN_PURPOSES.notificationsRead,
    );
    if (!verified.ok) {
      // 🔴 왜 거절했는지는 밖으로 내보내지 않는다 — 부르는 쪽이 맞혀 가며
      //    두드릴 실마리가 된다. 까닭은 서버 로그에만 남는다
      //    (auth/portal-service-token.ts).
      return Response.json(
        { error: "invalid_token" },
        { status: 401, headers: { ...NO_STORE, "www-authenticate": "Bearer" } },
      );
    }

    // 🔴 이 게시판에 계정이 없는 사람은 **빈 목록**이다 — 오류가 아니다. 포털은
    //    여러 시스템에 같은 질문을 던지고, 이 게시판에 한 번도 들어온 적 없는
    //    사람은 흔하다(포털에 전 직원 공개로 등록돼 있다). 오류를 돌려주면
    //    포털의 종이 그 줄에서 상한 것처럼 보인다.
    const userId = await findActiveUserIdByAuthSub(verified.subject);
    if (userId === null) {
      return Response.json(EMPTY_FEED, { headers: NO_STORE });
    }

    // 🔵 앞 조각이 만든 그 함수다. 어떤 실패도 삼키고 빈 목록을 돌려주므로
    //    (그 파일 머리말) 여기서 따로 받아 낼 것이 없다.
    const feed = await listUnreadNoticeNotifications(userId);
    return Response.json(feed, { headers: NO_STORE });
  } catch (error) {
    // 설정값이 빠졌거나(env 의 getter 가 던진다) 포털의 discovery·JWKS 를 못
    // 읽었거나 DB 가 멎었다. 안쪽 사정은 내보내지 않고 「지금은 안 된다」로만
    // 답한다 — 포털은 이 줄만 빼고 나머지를 그린다.
    console.error("[integration] 알림 목록을 내주지 못했습니다:", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      { error: "temporarily_unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
