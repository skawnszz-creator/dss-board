import { NotificationBell } from "@dss/ui";

import { fetchPortalNotifications } from "@/lib/auth/oidc";
import { listUnreadNoticeNotifications } from "@/lib/notifications/queries";

/**
 * ============================================================================
 * 머리말의 알림 종 — **이 게시판의 알림 + 다른 시스템들의 알림**
 * ============================================================================
 * 사내 시스템이 여럿인데(A/S · 계측기 · 개선요청 · PO/내자 · 휴가 · 재고 ·
 * 이 게시판) 「어느 시스템에서 종을 열어도 같은 알림을 본다」가 목표다. 그래서
 * 길이 둘이다:
 *
 *   ① 이 게시판 → 포털  (여기)   POST · Basic client_secret · 남의 알림을 받아 온다
 *   ② 포털 → 이 게시판           GET  · 포털이 서명한 Bearer · 우리 공지를 내준다
 *                                (app/api/integration/notifications — 앞 조각)
 *
 * ── 🔴 자기 알림은 자기가 붙인다 ────────────────────────────────────────
 * 포털은 **부른 사이트 자신에게는 묻지 않는다.** 그래서 ① 의 답에는 이 게시판의
 * 공지가 들어 있지 않고, 들어 있어서도 안 된다 — 포털은 30초 캐시를 들기
 * 때문에, 자기 알림까지 거기서 받으면 **방금 열어 본 공지가 30초 동안 종에
 * 남는다**(사람이 지금 보고 있는 바로 이 게시판에서). 남의 시스템 알림이 30초
 * 늦는 것은 괜찮다 — 거기서 일하고 있지 않으니까.
 * 그래서 여기서 **우리 DB 의 목록**(notifications/queries.ts)과 **포털이 준
 * 목록**을 합친다. 둘은 겹치지 않는다.
 *
 * 🔴 **자기 것이 앞, 포털에서 온 것이 뒤**다. 지금 이 게시판을 보고 있는 사람의
 *    읽을거리가 먼저 보여야 하고, 받은 목록은 다시 섞지 않는다 — 포털이 정한
 *    차례가 있다.
 *
 * ── 🔴 개수는 두 쪽을 **더한다**(다시 세지 않는다) ──────────────────────
 * 묶음은 받은 숫자를 그대로 찍는다(@dss/ui README 7절). 양쪽 count 모두 「그
 * 시스템이 센 진짜 개수」다 — 우리 쪽은 200줄 상한에 **걸리기 전**의 수이고
 * (notifications/bell-items.ts), 포털 쪽은 각 시스템이 센 값의 합이다. 그래서
 * `items.length` 로 다시 세면 둘 다 거짓이 된다.
 *
 * ── 🔴 왜 **서버**에서 가져오나 (브라우저가 아니라) ─────────────────────
 * 자격증명이 `client_secret` 이라 브라우저에서는 부를 수 없다. 브라우저에서
 * 가져오려면 이 사이트 안에 중계 통로를 하나 더 두고 거기서 세션을 다시
 * 검증해야 한다 — **시크릿을 다루는 자리를 하나 더 만드는** 일이다. 서버에서
 * 부르면 시크릿은 이 프로세스 밖으로 나가지 않는다.
 *
 * 🔴 그 대신 **모든 화면 이동이 이 왕복만큼 느려지는** 것을 막아야 한다. 그래서
 *    부르는 쪽((internal)/layout.tsx)이 이 조각을 `<Suspense>` 로 감싼다 —
 *    머리말과 본문이 먼저 뜨고 종만 나중에 흘러 들어온다. 왕복 자체에도 상한이
 *    걸려 있다(auth/oidc.ts 의 NOTIFICATIONS_TIMEOUT_MS = 2초).
 *
 * ── 🔴 둘 다 던지지 않는다 ──────────────────────────────────────────────
 * DB 가 멎어도(queries.ts 가 삼킨다) 포털이 죽거나 거절해도(oidc.ts 가 삼킨다)
 * 빈 목록이 온다. 그래서 한쪽이 없으면 **나머지만** 그려지고, 둘 다 없으면
 * 종이 아예 그려지지 않는다 — 어느 경우에도 화면은 뜬다. 그래서 이 자리에
 * error boundary 가 필요 없다.
 *
 * 두 물음은 **나란히** 나간다 — 우리 DB 가 포털을 기다릴 이유가 없다.
 * ============================================================================
 */
export async function HeaderNotificationBell({
  userId,
  subject,
}: {
  /** 이 게시판의 사람 id(web_users.id). 🔴 requireSession() 이 읽은 살아 있는 행의 값이다. */
  userId: string;
  /** 포털에 물을 때 쓰는 그 사람의 영구 식별자(web_users.auth_sub = ID 토큰의 sub). */
  subject: string;
}) {
  const [mine, others] = await Promise.all([
    listUnreadNoticeNotifications(userId),
    fetchPortalNotifications(subject),
  ]);

  const items = [...mine.items, ...others.items];

  // 🔴 **알림이 0건이면 머리말이 예전과 글자 하나 다르지 않아야 한다.** 묶음도
  //    빈 목록이면 스스로 아무것도 그리지 않지만(그쪽 시험), 앞 조각이 그
  //    판단에만 기대지 않고 레이아웃에서 한 번 더 막아 두었다. 이제 종을
  //    Suspense 안으로 옮기면서 레이아웃은 목록을 볼 수 없게 되었으므로, 그
  //    두 겹 중 바깥 한 겹이 이 자리로 내려온다.
  if (items.length === 0) return null;

  return (
    <NotificationBell
      items={items}
      // 🔴 두 쪽을 **더한다**(위 머리말). items.length 가 아니다.
      count={mine.count + others.count}
      // onAcknowledge 를 넘기지 않는다 — 이 게시판의 알림은 **글을 열면
      // 사라지고**(열람 기록이 곧 확인이다 — notifications/bell-items.ts),
      // 포털에서 온 줄은 그 알림을 만든 시스템에서만 확인을 적을 수 있다.
      // 그 줄을 누르면 그 시스템의 화면으로 건너간다.
      //
      // colorScheme 도 넘기지 않는다. 이 사이트는 globals.css 에서
      // color-scheme: light 로 고정이고, 기본값 "host" 는 조상에 .dark 가
      // 있을 때만 어두워지므로 그대로 두는 것이 옳다(@dss/ui README 4절).
    />
  );
}
