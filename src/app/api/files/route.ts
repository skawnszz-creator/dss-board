/**
 * 첨부파일 업로드 (1개 10MB 이내, 한 글에 10개까지).
 *
 * 사진과 같은 방식으로 본문 그대로(스트림) 받는다.
 * 확장자 화이트리스트 + 파일 앞부분 검사 + 실행파일 거부는 sniff.ts 가 한다.
 */
import type { NextRequest } from "next/server";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { webPostFiles } from "@/lib/db/schema";
import { jsonError, sameOrigin } from "@/lib/http";
import { MAX_FILE_BYTES, formatBytes } from "@/lib/limits";
import { FILE_EXTENSIONS, extensionOf, sniffAttachment } from "@/lib/uploads/sniff";
import {
  UploadError,
  sanitizeOriginalName,
  saveUpload,
} from "@/lib/uploads/storage";

export async function POST(request: NextRequest): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "로그인이 필요합니다.");
  if (!sameOrigin(request)) return jsonError(403, "허용되지 않은 요청입니다.");

  const rawName = request.nextUrl.searchParams.get("name");
  const ext = extensionOf(rawName ?? "");
  if (!ext || !(FILE_EXTENSIONS as readonly string[]).includes(ext)) {
    return jsonError(400, `${ext ? `${ext} 파일은` : "이 파일은"} 올릴 수 없습니다.`);
  }
  if (!request.body) return jsonError(400, "파일이 없습니다.");

  try {
    // ① 파일을 먼저 쓴다
    const saved = await saveUpload({
      kind: "files",
      ext,
      body: request.body,
      maxBytes: MAX_FILE_BYTES,
      sniff: (head) => sniffAttachment(ext, head),
    });

    const originalName = sanitizeOriginalName(rawName, ext);

    // ② 그 다음 DB 에 기록한다
    const [row] = await db
      .insert(webPostFiles)
      .values({
        uploadedBy: viewer.user.id,
        storagePath: saved.relativePath,
        originalName,
        mimeType: saved.mimeType,
        byteSize: saved.byteSize,
      })
      .returning({ id: webPostFiles.id });

    await writeAudit({
      actorId: viewer.user.id,
      action: AUDIT_ACTIONS.FILE_UPLOAD,
      targetType: "FILE",
      targetId: row.id,
      detail: { bytes: saved.byteSize, mimeType: saved.mimeType },
    });

    return Response.json(
      {
        id: row.id,
        originalName,
        byteSize: saved.byteSize,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return jsonError(400, error.message);
    }
    console.error("[files] 업로드 실패", error);
    return jsonError(
      500,
      `파일을 올리지 못했습니다. (한 개 ${formatBytes(MAX_FILE_BYTES)} 이내)`,
    );
  }
}
