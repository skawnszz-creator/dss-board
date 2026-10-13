/**
 * ============================================================================
 * 「아직 열어 보지 않은 필독·공지」를 그 사람 기준으로 가져온다
 * ============================================================================
 * 규칙은 전부 notifications/bell-items.ts 에 있다. 이 파일은 그 순수 계산에
 * **재료를 날라다 주는 자리**다 — 글 줄, 이 사이트의 주소, client_id.
 *
 * ── 🔴 스키마를 건드리지 않는다 ─────────────────────────────────────────
 * 새 표도 마이그레이션도 없다. 재료가 이미 있다:
 *   web_posts       topic in ('MUST_READ','NOTICE') · is_deleted · author_id ·
 *                   title · created_at
 *   web_post_views  누가 열었는가. (post_id, user_id) 에 유일 색인이 있다
 *   색인            web_posts_live_topic_idx on (topic, created_at)
 *                   where is_deleted = false — **거르는 데는** 주제가 둘이 되어도
 *                   그대로 탄다(`in` 은 색인 앞칸을 두 번 훑는다)
 *
 * 🔵 솔직하게: **차례는 이제 색인이 대 주지 못한다.** 맨 앞 열쇠가 주제가 아니라
 * 「필독인가」라서 정렬이 한 번 붙는다(주제가 하나였을 때는 색인의 created_at 이
 * 그대로 차례였다). 거르고 남는 줄은 「아직 안 읽은 필독·공지」뿐이라 몇 백을 넘지
 * 않고, 종과 목록이 같은 차례를 말하는 값이 그보다 크다.
 *
 * ── 🔴 여기서 던지지 않는다 ─────────────────────────────────────────────
 * 이 값은 **모든 화면의 머리말**에 실린다. DB 가 멎었든, 설정이 빠져 이 사이트
 * 주소를 못 만들든(env.ownBaseUrl 은 던진다), 종 하나 때문에 사이트 전체가 못
 * 쓰게 되면 안 된다. 그래서 어떤 실패도 **빈 목록**으로 돌아간다 — 개선요청이
 * 같은 판단을 적어 두었다(그쪽 db/queries/notifications.ts).
 *
 * ⚠️ 로그에는 **오류의 종류만** 남긴다. 제목·사람 이름·주소는 싣지 않는다.
 * ============================================================================
 */

import { and, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";

import { thisServiceId } from "@/lib/auth/oidc";
import { db } from "@/lib/db";
import { webPostViews, webPosts, webUsers } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  buildNoticeNotificationItems,
  NOTIFICATION_MAX_ITEMS,
  NOTIFICATION_TOPICS,
  type BoardNotificationFeed,
  type NoticeNotificationSource,
  type NotificationTopic,
} from "./bell-items";

const EMPTY: BoardNotificationFeed = { items: [], count: 0 };

/**
 * 이 사람이 아직 열어 보지 않은 필독·공지 — 줄과 **진짜 개수**.
 *
 * ── 조건 셋 ─────────────────────────────────────────────────────────────
 * 1. 알림이 되는 주제(필독·공지)이고 지워지지 않은 글
 * 2. 그 사람의 web_post_views 에 **행이 없다**(아직 안 열었다)
 * 3. 🔴 **자기가 쓴 글은 뺀다.** 쓴 사람이 자기 글 알림을 받는 것도 이상하고,
 *    글을 쓴 뒤 자기 글을 안 열면 **영영 남는다**(기한이 없으므로).
 *
 * ── 🔴 차례 — 필독이 위다 ───────────────────────────────────────────────
 * 목록 화면과 **같은 모양**이다(posts/queries.ts 의 `pinned` 정렬). 종과 목록이
 * 다른 차례를 말하면 안 된다 — 같은 사람이 종에서 본 맨 윗줄과 목록의 맨 윗줄이
 * 다르면 둘 중 하나가 거짓말로 읽힌다. 그래서 그쪽 표현을 글자 그대로 옮겼다.
 *
 * ── 🔴 개수는 자르기 전의 전체다 ────────────────────────────────────────
 * 줄은 NOTIFICATION_MAX_ITEMS 에서 자르지만 배지 숫자는 **자르기 전의 진짜
 * 개수**여야 한다 — 묶음이 받은 값을 그대로 찍기 때문이다(@dss/ui README 7절).
 * 그래서 `count(*) over ()` 를 함께 읽는다: 창 함수는 WHERE 뒤 · LIMIT 앞에
 * 계산되므로 잘리기 전의 수가 나오고, 세는 질의를 따로 보내지 않아도 된다
 * (종은 모든 화면에 딸려 오므로 왕복 한 번이 곧 모든 화면의 비용이다).
 */
async function selectUnreadNotices(userId: string): Promise<{
  posts: NoticeNotificationSource[];
  count: number;
}> {
  // 2번 — 그 사람의 열람 기록이 없는 글만. 유일 색인 (post_id, user_id) 을 탄다.
  const notViewed = sql`not exists (
    select 1 from ${webPostViews}
    where ${webPostViews.postId} = ${webPosts.id}
      and ${webPostViews.userId} = ${userId}
  )`;

  const conditions: SQL[] = [
    // 1번 — 알림이 되는 주제이고 살아 있는 글(web_posts_live_topic_idx 가 이 둘이다).
    // 🔴 목록을 여기에 적지 않는다 — 종에 실리는 종류와 **같은 상수**다(bell-items.ts).
    inArray(webPosts.topic, [...NOTIFICATION_TOPICS]),
    eq(webPosts.isDeleted, false),
    // 3번 — 자기가 쓴 글은 뺀다.
    ne(webPosts.authorId, userId),
    notViewed,
  ];

  const rows = await db
    .select({
      id: webPosts.id,
      // 종에 실릴 종류가 이 칸에서 나온다(bell-items.ts 의 notificationKind).
      topic: webPosts.topic,
      title: webPosts.title,
      authorName: webUsers.displayName,
      createdAt: webPosts.createdAt,
      // 🔴 잘리기 전의 전체 개수(위 머리말). 줄마다 같은 값이 실려 온다.
      total: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(webPosts)
    .innerJoin(webUsers, eq(webUsers.id, webPosts.authorId))
    .where(and(...conditions))
    // 🔴 필독이 맨 위(위 머리말). 목록 화면과 **같은 표현**이다
    // (posts/queries.ts 의 `(topic = 'MUST_READ') desc`).
    // 그다음은 새 글이 위로. id 를 덧붙이는 것은 같은 시각의 글이 둘일 때 상한에서
    // 잘리는 줄이 매번 달라지지 않게 하는 장치다.
    .orderBy(
      sql`(${webPosts.topic} = 'MUST_READ') desc`,
      desc(webPosts.createdAt),
      desc(webPosts.id),
    )
    .limit(NOTIFICATION_MAX_ITEMS);

  if (rows.length === 0) return { posts: [], count: 0 };

  return {
    // total 은 줄마다 같은 값이라 목록에는 싣지 않는다 — 아래 count 한 번뿐이다.
    posts: rows.map((row) => ({
      id: row.id,
      // `topic` 칸은 text 라 string 으로 온다(schema.ts — 코드값 검사는 DB 의
      // web_posts_topic_check 가 한다). 위 조건 1번이 NOTIFICATION_TOPICS 로
      // 걸러 왔으므로 그 둘 말고는 올 수 없다.
      topic: row.topic as NotificationTopic,
      title: row.title,
      authorName: row.authorName,
      createdAt: row.createdAt,
    })),
    count: rows[0].total,
  };
}

/**
 * 머리말의 종에 실을 **이 사이트 자신의 알림**.
 *
 * 🔴 `userId` 는 부르는 쪽이 `requireSession()` 으로 읽은 **살아 있는 web_users
 * 행**의 id 여야 한다. 쿠키에 박힌 값이나 요청 본문에서 온 값을 넘기면 남의
 * 알림을 보게 된다.
 */
export async function listUnreadNoticeNotifications(
  userId: string,
): Promise<BoardNotificationFeed> {
  try {
    const { posts, count } = await selectUnreadNotices(userId);
    if (posts.length === 0) return EMPTY;

    return {
      items: buildNoticeNotificationItems({
        posts,
        // 주소를 못 만들면 여기서 던진다 — 아래 catch 가 받는다(env.ts 의
        // ownBaseUrlFrom 주석).
        baseUrl: env.ownBaseUrl,
        sourceId: thisServiceId(),
      }),
      count,
    };
  } catch (error) {
    // 🔴 오류의 **종류만** 남긴다. 값(제목·이름·주소)은 싣지 않는다.
    console.error("listUnreadNoticeNotifications: failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return EMPTY;
  }
}
