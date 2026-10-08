/**
 * 포털에서 넘어온 사람을 이 사이트의 web_users 에 잇는다.
 *
 * 사람을 잇는 열쇠는 auth_sub(ID 토큰의 sub) 하나뿐이다.
 * 이메일로 사람을 식별하지 않는다 — 포털의 email 은 nullable 이고 바뀔 수 있다.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { webUsers, type WebUser } from "@/lib/db/schema";

export type AuthClaims = {
  /** dss-auth users.id (UUID) */
  sub: string;
  /** 화면 표시용 이름. 없으면 '이름 없음' */
  name?: string | null;
  /** 화면 표시용. 없을 수 있다 */
  email?: string | null;
};

/** 로그인이 거절된 이유 */
export type ProvisionResult =
  | { ok: true; user: WebUser }
  | { ok: false; reason: "BLOCKED" };

/**
 * 처음 보는 sub 면 행을 만든다(자동 프로비저닝).
 * **기본 역할은 항상 가장 낮은 MEMBER** 이고, 승격은 사람이 한다.
 *
 * 이미 있는 사람이면 이름·이메일만 최신값으로 갱신한다.
 * is_active / is_deleted 는 건드리지 않는다 — 끊어 둔 계정이 로그인으로 되살아나면 안 된다.
 */
export async function upsertUserFromClaims(
  claims: AuthClaims,
): Promise<ProvisionResult> {
  const displayName = claims.name?.trim() || "이름 없음";
  const email = claims.email?.trim() || null;
  const now = new Date();

  const rows = await db
    .insert(webUsers)
    .values({
      authSub: claims.sub,
      displayName,
      email,
      role: "MEMBER",
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: webUsers.authSub,
      set: { displayName, email, lastLoginAt: now, updatedAt: now },
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
