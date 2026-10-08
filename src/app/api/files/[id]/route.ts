/**
 * 첨부파일 내려받기.
 *
 * **항상 내려받기(attachment)로만** 내려준다.
 * 브라우저에서 바로 열리게 하면 HTML·SVG 가 섞여 들어올 때 스크립트가 실행될 수 있다.
 */
import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { webPostFiles } from "@/lib/db/schema";
import { UUID_RE } from "@/lib/http";
import { contentDisposition, openUpload } from "@/lib/uploads/storage";

function notFound(): Response {
  return new Response("찾을 수 없습니다.", { status: 404 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer) return new Response("로그인이 필요합니다.", { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const rows = await db
    .select()
    .from(webPostFiles)
    .where(eq(webPostFiles.id, id))
    .limit(1);

  const file = rows[0];
  if (!file || file.isDeleted) return notFound();

  const opened = await openUpload(file.storagePath);
  if (!opened) {
    console.warn("[files] DB 에는 있는데 디스크에 파일이 없습니다:", file.id);
    return notFound();
  }

  await db
    .update(webPostFiles)
    .set({ downloadCount: sql`${webPostFiles.downloadCount} + 1` })
    .where(eq(webPostFiles.id, file.id));

  await writeAudit({
    actorId: viewer.user.id,
    action: AUDIT_ACTIONS.FILE_DOWNLOAD,
    targetType: "FILE",
    targetId: file.id,
    detail: { postId: file.postId },
  });

  return new Response(opened.stream, {
    headers: {
      // 종류를 따지지 않고 내려받게 한다
      "content-type": "application/octet-stream",
      "content-length": String(opened.byteSize),
      "content-disposition": contentDisposition("attachment", file.originalName),
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
