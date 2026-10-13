/**
 * ============================================================================
 * 포털이 **알림 설정**을 물어 올 때의 판단 — 라우트가 아니라 여기에 둔다
 * ============================================================================
 * ── 🔴 왜 이 통로가 있어야 하나 ─────────────────────────────────────────
 * 포털(dss-auth)에 알림 통로를 가진 시스템으로 한 줄 등록되면, 포털은 그 시스템에
 * 주소를 **둘** 물으러 온다 — 알림 목록(/api/integration/notifications)과 알림
 * 설정(/api/integration/notification-settings). 설정 통로가 없으면 404 가 나고
 * 포털 관리자 화면에서 이 게시판이 「지금은 불러올 수 없습니다」로 그려진다.
 * 고장이 아닌데 화면이 상한 것처럼 보인다. 그래서 통로를 함께 낸다.
 *
 * ── 🔴 이 게시판의 알림 설정은 **읽기 전용**이다 ────────────────────────
 * 설정을 저장할 표가 없고 이번 조각은 스키마를 건드리지 않는다. 그러면 답할 수
 * 있는 길은 둘이다:
 *
 *  ① 200 으로 받아들이고 **아무것도 바꾸지 않는다**(`changedCount: 0`)
 *  ② 🔴 **읽기는 내주고, 저장은 403 으로 분명히 거절한다** ← 고른 길
 *
 * ①을 고르지 않은 까닭: 포털 관리자가 스위치를 눌러 「저장됨」을 보고 화면을 다시
 * 열면 값이 되돌아 있다 — **눌렀는데 아무 일도 일어나지 않는** 쪽이 훨씬 나쁘다.
 * ②는 포털이 그 자리에 우리가 적어 보낸 문장을 그대로 그리고(dss-auth 의
 * gather.ts 의 messageFrom), 포털은 403 을 **정상 응답**으로 다룬다 — 못 물어본
 * 것(unavailable)과 달리 degraded 로 세지 않는다(그쪽 settings.ts 머리말).
 * 개선요청(dss-improvements)이 같은 자리에서 같은 길을 골랐다.
 *
 * ── 지금 내주는 내용은 **거짓이 아니다** ────────────────────────────────
 * 종류는 둘(필독·공지)이고, **둘 다** 받는 사람은 **전 직원**이다. 그 규칙은
 * 코드에 있다 — notifications/queries.ts 의 조건은 셋(알림이 되는 주제의 글 ·
 * 아직 안 열었음 · 자기가 쓴 글이 아님)이고 **역할로 거르는 조건이 한 줄도
 * 없다.** 주제로 갈리는 조건도 없다 — 필독과 공지가 한 질의에서 같은 세 조건을
 * 지난다. 아래 표는 그것을 그대로 옮겨 적은 것이고, `editable: false` 가
 * 「여기서는 못 바꾼다」를 말한다.
 *
 * 🔴 설정이 진짜로 필요해지면: 표를 만들고(마이그레이션) `enabled`·`receives` 를
 * 그 표에서 읽은 뒤 `editable` 을 true 로 바꾸고 PUT 이 저장하게 하면 된다.
 * 고칠 자리가 이 파일과 라우트 하나뿐이도록 모아 두었다.
 *
 * ── DB 를 여기서 부르지 않는다 ──────────────────────────────────────────
 * 사람을 되짚는 일은 **인자로 받는다**(findActor). 그래서 이 파일의 판단은 DB 도
 * 네트워크도 없이 그대로 돌려 볼 수 있고, 라우트에는 「머리말에서 토큰 꺼내
 * 검증하고 이 함수 부르기」만 남는다. 본보기는 개선요청의
 * server/integration/portal-notifications.ts 다.
 * ============================================================================
 */
import { USER_ROLES, type UserRole } from "@/lib/codes";
import { ROLE_LABELS } from "@/lib/labels";
import {
  NOTIFICATION_TOPICS,
  notificationKind,
  notificationKindLabel,
  type NotificationTopic,
} from "@/lib/notifications/bell-items";

/** 포털 쪽 sub 로 되짚은 이 게시판의 사람. 🔴 살아 있는 사람만 온다. */
export type PortalActor = {
  id: string;
  role: UserRole;
};

/** 포털 쪽 sub 로 이 게시판 계정을 찾는다. 없거나 막힌 사람이면 null. */
export type FindActorByAuthSub = (subject: string) => Promise<PortalActor | null>;

/** 그 시스템의 역할 한 줄. 🔴 포털은 우리 역할 어휘를 모른다 — 이름표를 함께 보낸다. */
export type PortalSettingsRole = {
  code: UserRole;
  label: string;
  /** 🔴 false 면 포털 화면이 그 줄을 잠근다. 이 게시판은 언제나 false(위 머리말). */
  editable: boolean;
};

export type PortalSettingsRoleCell = {
  receives: boolean;
  defaultReceives: boolean;
};

export type PortalSettingsKind = {
  kind: string;
  label: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
  /** 열쇠는 위 역할의 `code`. */
  roles: Record<string, PortalSettingsRoleCell>;
};

export type PortalNotificationSettings = {
  roles: PortalSettingsRole[];
  kinds: PortalSettingsKind[];
};

export type PortalSettingsResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 403; message: string };

/**
 * 🔴 **모든 역할이 받는다.** 손으로 적은 값이 아니라 위 머리말이 짚은 사실이다 —
 * 알림 질의에 역할 조건이 없으므로 MEMBER 도 ADMIN 도 똑같이 받는다. 종류가 둘이
 * 된 지금도 **종류마다 다르지 않다** — 질의가 하나이기 때문이다.
 * 개선요청은 이 자리에서 권한 함수를 부르지만, 이 게시판에는 **부를 함수가 없다는
 * 것**이 곧 「전 직원」이라는 뜻이다. 언젠가 역할로 거르게 되면 그 판정 함수를
 * 여기서 부르도록 바꾼다 — 그래야 표가 저절로 따라간다.
 */
const RECEIVES_FOR_EVERY_ROLE = true;

/**
 * 종이 무엇을 언제 보여 주는가. 포털 화면이 종류 줄 밑에 그대로 그린다.
 *
 * 🔴 종류 이름을 문장에 손으로 적지 않는다 — 같은 줄의 `label` 과 **한 글자도
 * 다르면 안 되기** 때문이다(「필독 글」이라 적힌 줄의 이름표가 「공지」일 수는
 * 없다). 그래서 이름도 종에 실리는 그 이름에서 온다.
 *
 * 나머지 두 문장(열면 사라진다 · 자기가 쓴 글은 안 온다)은 **종류와 무관하게
 * 같다** — 질의의 조건 2·3번이 주제를 가리지 않기 때문이다.
 */
function kindDescription(topic: NotificationTopic): string {
  return `아직 열어 보지 않은 ${notificationKindLabel(topic)} 글을 종에 띄웁니다. 그 글을 열면 사라집니다. 자기가 쓴 글은 오지 않습니다.`;
}

/**
 * 한 종류의 역할 칸들. 🔴 **종류마다 새로 만든다** — 한 객체를 두 줄이 나눠 쓰면
 * 언젠가 한쪽을 고친 것이 다른 쪽까지 바꾼다(지금은 JSON 으로 나가 티가 안 난다).
 */
function roleCells(): Record<string, PortalSettingsRoleCell> {
  const cells: Record<string, PortalSettingsRoleCell> = {};
  for (const code of USER_ROLES) {
    cells[code] = {
      receives: RECEIVES_FOR_EVERY_ROLE,
      defaultReceives: RECEIVES_FOR_EVERY_ROLE,
    };
  }
  return cells;
}

/**
 * 이 게시판이 내주는 알림 설정 — **코드에 있는 규칙을 그대로 옮겨 적은 표**.
 *
 * 종류 이름과 코드는 종이 쓰는 그 상수에서 온다(notifications/bell-items.ts).
 * 여기에 "NOTICE" 를 손으로 적으면 종에 뜬 종류와 설정 표의 종류가 언젠가 갈린다.
 *
 * 🔴 종류가 **몇 개인지도 여기서 정하지 않는다.** NOTIFICATION_TOPICS 를 그대로
 * 돌므로, 쓰는 분이 알림이 되는 주제를 또 바꾸면 이 표가 저절로 따라간다 — 종에는
 * 뜨는데 설정 표에는 없는 종류(그 반대도)가 생길 자리가 없다.
 */
export function boardNotificationSettings(): PortalNotificationSettings {
  const roles: PortalSettingsRole[] = USER_ROLES.map((code) => ({
    code,
    label: ROLE_LABELS[code],
    // 🔴 저장할 표가 없다 — 이 게시판에서는 아무 칸도 바꿀 수 없다(위 머리말).
    editable: false,
  }));

  const kinds: PortalSettingsKind[] = NOTIFICATION_TOPICS.map((topic) => ({
    kind: notificationKind(topic),
    label: notificationKindLabel(topic),
    description: kindDescription(topic),
    enabled: true,
    defaultEnabled: true,
    roles: roleCells(),
  }));

  return { roles, kinds };
}

/** 🔴 세 갈래(없는 사람·막힌 사람·관리자가 아닌 사람)가 **같은 문장**이다. */
const FORBIDDEN_MESSAGE = "이 시스템의 알림 설정은 볼 수 없습니다.";

/**
 * 저장은 받지 않는다 — 까닭은 위 머리말. 포털이 이 문장을 그대로 그린다.
 *
 * 🔴 종류 이름을 손으로 적지 않는다(표와 같은 자리에서 온다). 개수를 말하지
 * 않는 것도 일부러다 — 종류가 늘면 「하나뿐」 같은 말이 조용히 거짓이 된다.
 */
export const SETTINGS_READ_ONLY_MESSAGE = `DSS 사내 게시판은 알림 설정을 바꿀 수 없습니다. 알림 종류(${NOTIFICATION_TOPICS.map(
  notificationKindLabel,
).join("·")})도 받는 사람(전 직원)도 코드에 정해져 있습니다.`;

/**
 * 설정을 **읽는** 것도 자격을 본다 — 관리자만.
 *
 * 어느 역할이 무엇을 받는지는 그 자체가 조직 구성 정보다. 이 게시판은 「전 직원」
 * 하나뿐이라 숨길 것이 적지만, 자격을 보는 줄은 A/S·개선요청과 **같은 자리에**
 * 그어 둔다 — 네 시스템이 같은 포털 화면에 나란히 그려지는데 한 곳만 느슨하면
 * 그 한 곳이 「이 사람이 거기 계정이 있는가」를 알려 주는 창구가 된다.
 *
 * 🔴 되짚지 못한 사람·막힌 사람·관리자가 아닌 사람 **셋 다 같은 답**이다 — 까닭을
 * 나누면 포털에 토큰 하나 구울 수 있는 쪽이 사람 목록과 각자의 권한을 알아낼 수
 * 있다(알림 목록 통로가 거절 까닭을 숨기는 것과 같은 줄이다).
 */
export async function readPortalNotificationSettings(params: {
  subject: string;
  findActor: FindActorByAuthSub;
}): Promise<PortalSettingsResult<PortalNotificationSettings>> {
  const actor = await params.findActor(params.subject);
  if (!actor || actor.role !== "ADMIN") {
    return { ok: false, status: 403, message: FORBIDDEN_MESSAGE };
  }
  return { ok: true, value: boardNotificationSettings() };
}

/**
 * 설정 저장 — **언제나 거절한다.** 돌려주는 것은 답에 실을 문장뿐이다.
 *
 * 🔴 자격을 먼저 보고 거절한다. 관리자가 아닌 사람에게 「바꿀 수 없는 시스템이다」를
 * 알려 줄 이유가 없다 — 읽기와 **같은 문장**으로 답한다. 까닭을 적은 문장은 관문을
 * 통과한 관리자에게만 간다.
 *
 * 돌려주는 타입에 `ok: true` 갈래가 아예 없다 — 저장할 표가 생기기 전에는 성공이
 * 있을 수 없고, 타입이 그것을 말한다.
 */
export async function writePortalNotificationSettings(params: {
  subject: string;
  findActor: FindActorByAuthSub;
}): Promise<{ status: 403; message: string }> {
  const actor = await params.findActor(params.subject);
  if (!actor || actor.role !== "ADMIN") {
    return { status: 403, message: FORBIDDEN_MESSAGE };
  }
  return { status: 403, message: SETTINGS_READ_ONLY_MESSAGE };
}
