/**
 * 감사 기록. 추가만 한다 (append-only).
 * UI 로 개별 기록을 지울 수 있게 만들지 않는다.
 *
 * 기록에 실패해도 사용자의 작업을 막지 않는다 — 대신 서버 로그에 남긴다.
 */
import { db } from "@/lib/db";
import { webAuditLogs } from "@/lib/db/schema";

export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGIN_BLOCKED: "LOGIN_BLOCKED",
  LOGOUT: "LOGOUT",
  POST_CREATE: "POST_CREATE",
  POST_UPDATE: "POST_UPDATE",
  POST_DELETE: "POST_DELETE",
  IMAGE_UPLOAD: "IMAGE_UPLOAD",
  FILE_UPLOAD: "FILE_UPLOAD",
  FILE_DOWNLOAD: "FILE_DOWNLOAD",
  ROLE_CHANGE: "ROLE_CHANGE",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export async function writeAudit(entry: {
  actorId?: string | null;
  action: AuditAction;
  targetType?: "POST" | "USER" | "FILE" | "IMAGE" | null;
  targetId?: string | null;
  /** 제목·바뀐 역할 등. 개인정보를 과하게 담지 않는다. */
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(webAuditLogs).values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      detail: entry.detail ?? null,
    });
  } catch (error) {
    console.error("[audit] 기록 실패", entry.action, error);
  }
}
