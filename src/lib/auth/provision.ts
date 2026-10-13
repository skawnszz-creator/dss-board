/**
 * 포털에서 넘어온 사람을 이 사이트의 web_users 에 잇는다.
 *
 * 사람을 잇는 열쇠는 auth_sub(ID 토큰의 sub) 하나뿐이다.
 * 이메일로 사람을 식별하지 않는다 — 포털의 email 은 nullable 이고 바뀔 수 있다.
 */
import { eq } from "drizzle-orm";

import { USER_ROLES, type UserRole } from "@/lib/codes";
import { db } from "@/lib/db";
import { webUsers, type WebUser } from "@/lib/db/schema";

export type AuthClaims = {
  /** dss-auth users.id (UUID) */
  sub: string;
  /** 화면 표시용 이름. 없으면 '이름 없음' */
  name?: string | null;
  /** 화면 표시용. 없을 수 있다 */
  email?: string | null;
  /**
   * 포털이 실어 보낸 이 사이트에서의 역할.
   *
   * **타입을 string 으로 단정하지 않는다** — 받는 쪽이 보내는 쪽의 타입을
   * 정할 수 없다. 무엇이 오든 그대로 받아 decideRole 이 거른다.
   * 부여 행이 없는 사람에게는 클레임 자체가 실리지 않아 undefined 다.
   */
  role?: unknown;
};

/** 로그인이 거절된 이유 */
export type ProvisionResult =
  | { ok: true; user: WebUser }
  | { ok: false; reason: "BLOCKED" | "UNKNOWN_ROLE" };

type RoleDecision =
  /** 클레임이 없다. 포털이 이 사람의 역할을 관리하지 않는다는 뜻이니 그대로 둔다. */
  | { kind: "KEEP" }
  /** 이 사이트가 아는 값이다. 그대로 적용한다. */
  | { kind: "APPLY"; role: UserRole }
  /** 모르는 값이다. 로그인을 거절한다. */
  | { kind: "REJECT" };

/**
 * 포털이 ID 토큰에 실어 보낸 role 클레임을 어떻게 다룰지.
 *
 * **클레임이 없으면 유지(KEEP)** 다. 포털은 user_client_grants 에 부여 행이
 * 있을 때만 role 을 싣는데, 이 게시판은 전 직원이 쓰는 곳이라(포털에
 * requires_grant=false 로 등록돼 있다) 부여 행이 없는 사람이 정상이다.
 * 없다고 거절하면 아무도 못 들어온다. 처음 보는 사람은 MEMBER 로 만든다.
 *
 * **모르는 값이면 거절(REJECT)** 이다. 유지하면 안전한 쪽으로 실패하지
 * 않는다 — 관리자를 일반으로 **내리려다** 역할 이름을 잘못 적었을 때, 그
 * 사람이 관리자로 남아 있는데 아무 표시도 나지 않는다. 거절하면 잘못
 * 설정된 그 계정만 못 들어오고, 즉시 드러나며, 나머지는 멀쩡히 고칠 수 있다.
 *
 * (개선요청 src/lib/auth/sso-login.ts · A/S · 계측기의 같은 함수와 같은 판정이다.)
 */
function decideRole(claim: unknown): RoleDecision {
  if (claim === undefined || claim === null) return { kind: "KEEP" };
  if (typeof claim !== "string") return { kind: "REJECT" };
  if ((USER_ROLES as readonly string[]).includes(claim)) {
    return { kind: "APPLY", role: claim as UserRole };
  }
  return { kind: "REJECT" };
}

/**
 * 처음 보는 sub 면 행을 만든다(자동 프로비저닝).
 *
 * **역할의 출처는 통합 로그인 포털 하나다**(2026-10-13 사용자 결정).
 * 로그인할 때마다 포털이 보낸 role 을 그대로 반영하고, 안 보내면 지금 값을
 * 그대로 둔다. 처음 보는 사람에게 주는 기본값은 가장 낮은 MEMBER 다.
 *
 * 이름·이메일은 늘 최신값으로 갱신한다.
 * is_active / is_deleted 는 건드리지 않는다 — 끊어 둔 계정이 로그인으로 되살아나면 안 된다.
 */
export async function upsertUserFromClaims(
  claims: AuthClaims,
): Promise<ProvisionResult> {
  // 🔴 거절 판정은 DB 를 건드리기 전에 한다. 모르는 역할로 들어온 사람의
  // 계정을 만들거나 lastLoginAt 을 갱신하면 안 된다.
  const decision = decideRole(claims.role);
  if (decision.kind === "REJECT") {
    console.error(
      `[auth] 이 게시판이 모르는 역할입니다: ${String(claims.role)} ` +
        `(아는 값: ${USER_ROLES.join(", ")})`,
    );
    return { ok: false, reason: "UNKNOWN_ROLE" };
  }

  const displayName = claims.name?.trim() || "이름 없음";
  const email = claims.email?.trim() || null;
  const now = new Date();

  const rows = await db
    .insert(webUsers)
    .values({
      authSub: claims.sub,
      displayName,
      email,
      // 처음 보는 사람인데 포털이 역할을 안 보냈다면 가장 낮은 것으로 시작한다.
      role: decision.kind === "APPLY" ? decision.role : "MEMBER",
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: webUsers.authSub,
      set: {
        displayName,
        email,
        lastLoginAt: now,
        updatedAt: now,
        // KEEP 이면 role 을 set 에 넣지 않는다 — 지금 값이 그대로 남는다.
        ...(decision.kind === "APPLY" ? { role: decision.role } : {}),
      },
    })
    .returning();

  const user = rows[0];
  if (!user) {
    // onConflictDoUpdate 는 항상 한 행을 돌려준다. 여기 오면 DB 쪽 문제다.
    throw new Error("계정을 만들거나 갱신하지 못했습니다.");
  }

  // 끊어 둔 계정은 로그인시키지 않는다.
  if (!user.isActive || user.isDeleted) return { ok: false, reason: "BLOCKED" };

  return { ok: true, user };
}

/** 관리자 지정 스크립트에서 쓴다. */
export async function findUserByAuthSub(
  authSub: string,
): Promise<WebUser | null> {
  const rows = await db
    .select()
    .from(webUsers)
    .where(eq(webUsers.authSub, authSub))
    .limit(1);
  return rows[0] ?? null;
}
