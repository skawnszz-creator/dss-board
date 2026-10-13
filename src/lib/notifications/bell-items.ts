/**
 * ============================================================================
 * 이 게시판의 **자체 알림** — 「아직 열어 보지 않은 공지」
 * ============================================================================
 * 머리말의 알림 종(@dss/ui 의 NotificationBell)이 받는 아홉 칸을 만든다.
 * 이 파일은 **순수 계산만** 한다 — DB 도 React 도 세션도 환경변수도 모른다.
 * 재료(글 줄 · 이 사이트의 주소 · client_id)는 부르는 쪽이 날라다 준다
 * (notifications/queries.ts).
 *
 * ── 🔴 알림 표를 만들지 않는다 ───────────────────────────────────────────
 * 새 표도 마이그레이션도 없다. 알림은 이미 있는 두 표에서 **매 요청
 * 파생**한다 — 공지 글(web_posts)과 「누가 열었는가」(web_post_views). 알림을
 * 따로 저장하면 글과 알림이 두 벌의 진실이 되어 언젠가 어긋난다(개선요청·A/S
 * 가 같은 길을 쓴다).
 *
 * ── 🔴 쓰는 분이 정한 것 둘 ─────────────────────────────────────────────
 * 1. **알림이 되는 글은 공지(NOTICE)뿐이다.** 필독(MUST_READ)도 일반(GENERAL)
 *    도 아니다.
 * 2. **그 글을 열면 사라진다.** 기한은 없다 — 30일이 지나도 안 열었으면 남는다.
 *    「열었다」를 적는 곳은 글 보기 화면의 recordPostView 하나다
 *    (app/actions/posts.ts). 알림 쪽에서 따로 확인(acknowledge)을 적지 않으므로
 *    확인 기록 표도 필요 없다.
 * ============================================================================
 */

import type { NotificationBellItem } from "@dss/ui";

import type { PostTopic } from "@/lib/codes";
import { formatListDate } from "@/lib/format";
import { TOPIC_LABELS } from "@/lib/labels";

/**
 * 알림이 되는 주제. 🔴 **공지 하나뿐이다**(위 머리말).
 *
 * 질의의 조건이자 종에 실리는 `kind` 이기도 하다 — 둘이 같은 값이어야 「종에
 * 뜬 종류」와 「거른 주제」가 갈라지지 않는다. 그래서 한 상수에서 나온다.
 */
export const NOTIFICATION_TOPIC: PostTopic = "NOTICE";

/**
 * 종류 코드. @dss/ui 는 이 값으로 **색 한 칸만** 고른다(그쪽 tone.ts) —
 * 종류 목록을 아는 분기가 묶음에 한 군데도 없다.
 */
export const NOTIFICATION_KIND: string = NOTIFICATION_TOPIC;

/** 사람이 읽는 종류 이름("공지"). 🔴 색과 **함께 글자로도** 그려진다. */
export const NOTIFICATION_KIND_LABEL: string = TOPIC_LABELS[NOTIFICATION_TOPIC];

/**
 * 이 시스템의 사람이 읽는 이름. 종에서 줄마다 작게 붙는다.
 *
 * 🔵 지금은 이 게시판 자신의 알림만 그리므로 모든 줄에 같은 이름이 붙는다.
 * 다음 조각에서 포털이 **다른 사이트 알림을 합쳐** 같은 종에 실으면 그때
 * 비로소 이 칸이 줄을 가른다.
 */
export const NOTIFICATION_SOURCE_NAME = "DSS 사내 게시판";

/** 알림 id 의 앞머리. 나중에 알림 종류가 늘어도 열쇠끼리 부딪히지 않게 한다. */
export const NOTIFICATION_ID_PREFIX = "POST";

/**
 * 종에 실어 보낼 줄 수의 상한.
 *
 * 🔴 **배지 숫자는 이 상한에 걸리기 전의 진짜 개수**다(아래 BoardNotificationFeed
 * 의 count). 묶음은 받은 수를 그대로 찍으므로 참말을 넣어야 한다.
 *
 * 200 인 까닭: 포털이 한 시스템에서 받은 목록을 **200줄에서 자른다**
 * (dss-auth 의 notifications/merge.ts 의 MAX_ITEMS_PER_SOURCE — 개선요청이 그
 * 값에 맞춰 PORTAL_MAX_ITEMS_PER_SOURCE 를 두었다). 다음 조각에서 이 목록을
 * 그대로 포털에 내줄 때 같은 수를 두 번 정하지 않게 지금부터 맞춘다.
 */
export const NOTIFICATION_MAX_ITEMS = 200;

/** 글 하나를 여는 화면의 경로 앞머리. */
const POST_PATH_PREFIX = "/posts/";

/**
 * 종이 받는 한 뭉치 — 그릴 줄과 배지에 찍을 수.
 *
 * 🔴 **count 는 items.length 가 아니다.** 목록은 NOTIFICATION_MAX_ITEMS 에서
 * 잘리지만 숫자는 자르기 전의 전체다(그쪽이 참말이다 — @dss/ui README 7절
 * 「개수 — 다시 세지 않는다」). 200건이 넘는 일은 흔치 않지만, 넘는 날 종이
 * 「200」이라고 거짓을 말하지 않게 한다.
 */
export type BoardNotificationFeed = {
  items: NotificationBellItem[];
  count: number;
};

/**
 * 알림으로 만들 공지 한 줄. 종에 필요한 칸만 받는다.
 *
 * 목록 조회(posts/queries.ts 의 listPosts)를 돌려쓰지 않는 이유: 그쪽은 첨부
 * 개수까지 세고 쪽수를 계산하는데 종에는 한 칸도 쓰이지 않는다. 종은 **모든
 * 화면**에 딸려 오므로 그 비용이 매 화면에 붙는다.
 */
export type NoticeNotificationSource = {
  /** 글 id(uuid). 알림 id 와 링크가 이 값에서 나온다. */
  id: string;
  title: string;
  /** 쓴 사람 이름(web_users.display_name). */
  authorName: string;
  createdAt: Date;
};

/**
 * 절대 주소인지 보고 끝의 슬래시를 떼어 낸다.
 *
 * 🔴 **상대경로를 받지 않는다.** 자기 화면에서는 `/posts/…` 로도 잘 열리지만,
 * 이 목록은 다음 조각에서 포털을 거쳐 **다른 사이트의 종**에 실린다 — 포털은
 * 상대경로로 온 줄을 버린다(dss-auth 의 merge.ts). 같은 계산을 두 번 적지
 * 않으려면 지금부터 절대 주소여야 한다.
 *
 * 조용히 물러서지 않고 던진다 — 주소가 틀린 채로 그럭저럭 도는 상태가 가장
 * 오래 숨는다. 종 하나 때문에 모든 화면이 죽지 않게 삼키는 것은 부르는
 * 쪽(queries.ts)의 몫이다.
 */
function requireAbsoluteBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(trimmed)) {
    throw new Error(
      `알림 주소의 앞머리(baseUrl)는 http(s):// 로 시작하는 절대 주소여야 합니다(받은 값: ${baseUrl}).`,
    );
  }
  return trimmed;
}

/**
 * 글 id → 이 시스템 안에서의 알림 id.
 *
 * 🔴 **같은 글에는 언제나 같은 값이 나와야 한다.** 시각·제목·사람처럼 변하는
 * 것을 섞지 않는다 — 들어가는 것은 절대 바뀌지 않는 행 id 뿐이다.
 */
export function noticeNotificationId(postId: string): string {
  return `${NOTIFICATION_ID_PREFIX}:${postId}`;
}

/** 무슨 일인가 — 「누가 언제 썼나」. 이름이 비면 날짜만. */
function detailOf(post: NoticeNotificationSource): string {
  const when = formatListDate(post.createdAt);
  const name = post.authorName.trim();
  return name === "" ? when : `${name} · ${when}`;
}

/**
 * 공지 줄 → 종이 받는 목록.
 *
 * ── 차례는 받은 그대로다 ────────────────────────────────────────────────
 * 여기서 다시 정렬하지 않는다. 질의가 이미 **새 글부터** 준다
 * (notifications/queries.ts). 두 곳에서 각자 정렬하면 언젠가 갈린다.
 *
 * ── 🔴 아홉 칸이 전부 채워진다 ──────────────────────────────────────────
 * @dss/ui 의 NotificationBellItem 은 아홉 칸이 모두 필수 string 이고, **없는
 * 값은 null 이 아니라 빈 문자열**이다(그쪽 types.ts). 여기서는 빈 칸이 하나도
 * 없다 — 제목도 쓴 사람도 늘 있다.
 */
export function buildNoticeNotificationItems(input: {
  posts: readonly NoticeNotificationSource[];
  /** 이 사이트의 주소 앞머리. 🔴 절대 주소여야 한다(requireAbsoluteBaseUrl). */
  baseUrl: string;
  /** 이 사이트의 client_id(`dss-board`). auth/oidc.ts 의 thisServiceId() 에서 온다. */
  sourceId: string;
}): NotificationBellItem[] {
  const baseUrl = requireAbsoluteBaseUrl(input.baseUrl);
  const seen = new Set<string>();
  const items: NotificationBellItem[] = [];

  for (const post of input.posts) {
    const id = noticeNotificationId(post.id);

    // key 는 목록 안에서 유일해야 한다(React key 이자 눌린 줄을 되찾는 열쇠다).
    // 같은 글이 두 번 실려 오는 일은 정상적으로는 없지만, 그렇다면 이 줄은
    // 공짜다 — 만약 일어난다면 종이 줄을 잘못 그린다.
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      // 🔴 목록 **전체**에서 유일해야 한다. 다음 조각에서 다른 시스템의 줄이
      // 같은 목록에 섞이면 id 만으로는 부딪히므로 포털과 같은 모양
      // (`client_id:id`)으로 둔다.
      key: `${input.sourceId}:${id}`,
      sourceId: input.sourceId,
      sourceName: NOTIFICATION_SOURCE_NAME,
      id,
      kind: NOTIFICATION_KIND,
      kindLabel: NOTIFICATION_KIND_LABEL,
      subject: post.title,
      detail: detailOf(post),
      // 🔴 **절대 주소**다. 남의 종에 그려질 링크이기도 하거니와, 포털이
      //    상대경로로 온 줄을 버린다(requireAbsoluteBaseUrl 주석).
      href: `${baseUrl}${POST_PATH_PREFIX}${post.id}`,
    });
  }

  return items;
}
