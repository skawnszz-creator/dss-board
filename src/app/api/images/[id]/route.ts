/**
 * 본문 사진 내려주기.
 *
 * 업로드 폴더를 정적으로 노출하지 않는다 — 주소만 알면 누구나 받을 수 있게 되기 때문이다.
 * 반드시 앱을 거쳐 세션을 확인한 뒤 내려준다.
 */
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getViewer } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { webPostImages } from "@/lib/db/schema";
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
    .from(webPostImages)
    .where(eq(webPostImages.id, id))
    .limit(1);

  const image = rows[0];
  if (!image || image.isDeleted) return notFound();

  const opened = await openUpload(image.storagePath);
  if (!opened) {
    console.warn("[images] DB 에는 있는데 디스크에 파일이 없습니다:", image.id);
    return notFound();
  }

  return new Response(opened.stream, {
    headers: {
      // 서버가 직접 판정해 저장한 값이다 (브라우저가 보낸 값이 아니다)
      "content-type": image.mimeType,
      "content-length": String(opened.byteSize),
      "content-disposition": contentDisposition("inline", image.originalName),
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
    },
  });
}
