"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { USER_ROLES, type UserRole } from "@/lib/codes";
import { db } from "@/lib/db";
import { webUsers } from "@/lib/db/schema";
import { UUID_RE } from "@/lib/http";

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** 직원의 역할을 바꾼다 (관리자만). */
export async function changeUserRole(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const userId = str(formData.get("userId")).trim();
  const nextRole = str(formData.get("role")).trim();

  if (!UUID_RE.test(userId)) redirect("/admin/users?error=1");
  if (!(USER_ROLES as readonly string[]).includes(nextRole)) {
    redirect("/admin/users?error=1");
  }

  // 자기 역할은 스스로 바꾸지 못하게 한다 — 마지막 관리자가 자신을 내려
  // 아무도 관리할 수 없게 되는 상황을 막는다.
  if (userId === admin.user.id) redirect("/admin/users?error=self");

  const rows = await db
    .select({ id: webUsers.id, role: webUsers.role, name: webUsers.displayName })
    .from(webUsers)
    .where(eq(webUsers.id, userId))
    .limit(1);

  const target = rows[0];
  if (!target) redirect("/admin/users?error=1");
  if (target.role === nextRole) redirect("/admin/users");

  await db
    .update(webUsers)
    .set({ role: nextRole as UserRole, updatedAt: new Date() })
    .where(eq(webUsers.id, userId));

  await writeAudit({
    actorId: admin.user.id,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    targetType: "USER",
    targetId: userId,
    detail: { name: target.name, from: target.role, to: nextRole },
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
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
