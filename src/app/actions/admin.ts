"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { webUsers } from "@/lib/db/schema";
import { UUID_RE } from "@/lib/http";

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * 역할 바꾸기 — **더 이상 이 게시판에서 하지 않는다. 언제나 거절한다.**
 *
 * 2026-10-13 사용자 결정: 역할의 출처는 통합 로그인 포털(dss-auth) 하나다.
 * 포털이 ID 토큰에 실어 보낸 role 을 로그인할 때마다 반영한다
 * (src/lib/auth/provision.ts 의 decideRole). 여기서 또 바꿀 수 있으면 두 곳이
 * 서로 다른 답을 갖게 되고, 포털에서 내린 사람이 다음 로그인까지 관리자로
 * 남는다.
 *
 * 🔴 화면에서 단추만 빼면 폼을 직접 보내 뚫을 수 있다. 그래서 서버에서도
 * 막는다 — 이 저장소가 처음부터 지켜 온 원칙이다.
 *
 * 🔴 함수를 지우지 않는 까닭: 되돌리기 쉽고, 지우면 과거 ROLE_CHANGE 감사
 * 기록이 무엇을 가리키던 것인지 흐려진다.
 */
export async function changeUserRole(formData: FormData): Promise<void> {
  // 관리자인지 먼저 확인한다 — 관리자가 아닌 사람에게는 이 길이 있다는 것조차
  // 알릴 필요가 없다(requireAdmin 이 로그인·권한 화면으로 보낸다).
  await requireAdmin();
  void formData;

  redirect("/admin/users?error=role-locked");
}

/** 계정을 쓸 수 있게/못 쓰게 한다 (관리자만). 세션도 다음 요청에서 끊긴다. */
export async function setUserActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const userId = str(formData.get("userId")).trim();
  const active = str(formData.get("active")) === "true";

  if (!UUID_RE.test(userId)) redirect("/admin/users?error=1");
  if (userId === admin.user.id) redirect("/admin/users?error=self");

  const rows = await db
    .select({ id: webUsers.id, name: webUsers.displayName })
    .from(webUsers)
    .where(eq(webUsers.id, userId))
    .limit(1);

  const target = rows[0];
  if (!target) redirect("/admin/users?error=1");

  await db
    .update(webUsers)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(webUsers.id, userId));

  await writeAudit({
    actorId: admin.user.id,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    targetType: "USER",
    targetId: userId,
    detail: { name: target.name, isActive: active },
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
}
