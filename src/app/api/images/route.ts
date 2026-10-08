/**
 * 본문에 붙이는 사진 업로드 (요구사항 4).
 *
 * 파일을 multipart 로 받지 않고 **본문 그대로(스트림)** 받는다.
 * request.formData() 는 파일 전체를 메모리에 올리는데, DS218+ 의 RAM 이 작다.
 * 원본 파일명은 ?name= 으로 받고, 믿지 않고 다듬어 쓴다.
 */
import type { NextRequest } from "next/server";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { webPostImages } from "@/lib/db/schema";
import { jsonError, sameOrigin } from "@/lib/http";
import { MAX_IMAGE_BYTES, formatBytes } from "@/lib/limits";
import { IMAGE_EXTENSIONS, extensionOf, sniffImage } from "@/lib/uploads/sniff";
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
  if (!ext || !(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    return jsonError(
      400,
      `사진은 ${IMAGE_EXTENSIONS.join(" · ")} 만 붙일 수 있습니다.`,
    );
  }
  if (!request.body) return jsonError(400, "파일이 없습니다.");

  try {
    // ① 파일을 먼저 쓴다
    const saved = await saveUpload({
      kind: "images",
      ext,
      body: request.body,
      maxBytes: MAX_IMAGE_BYTES,
      sniff: (head) => sniffImage(ext, head),
    });

    // ② 그 다음 DB 에 기록한다
    const [row] = await db
      .insert(webPostImages)
      .values({
        uploadedBy: viewer.user.id,
        storagePath: saved.relativePath,
        originalName: sanitizeOriginalName(rawName, ext),
        mimeType: saved.mimeType,
        byteSize: saved.byteSize,
      })
      .returning({ id: webPostImages.id });

    await writeAudit({
      actorId: viewer.user.id,
      action: AUDIT_ACTIONS.IMAGE_UPLOAD,
      targetType: "IMAGE",
      targetId: row.id,
      detail: { bytes: saved.byteSize, mimeType: saved.mimeType },
    });

    return Response.json(
      { id: row.id, url: `/api/images/${row.id}` },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return jsonError(400, error.message);
    }
    console.error("[images] 업로드 실패", error);
    return jsonError(
      500,
      `사진을 올리지 못했습니다. (한 장 ${formatBytes(MAX_IMAGE_BYTES)} 이내)`,
    );
  }
}
