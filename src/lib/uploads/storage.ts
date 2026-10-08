/**
 * 사진·첨부파일을 디스크에 쌓고 다시 읽는 자리.
 *
 * NAS 이식 규칙 (DESIGN 6절)
 * - 저장 루트는 STORAGE_ROOT 환경변수. **절대경로를 DB 에 넣지 않는다.**
 * - DB 경로는 항상 '/' 구분자, 전부 소문자.
 * - 디스크 파일명은 UUID + 확장자. 한글·공백·원본 파일명을 쓰지 않는다.
 * - `path.join` 은 **실제 파일시스템에 닿는 이 파일 안에서만** 쓴다.
 * - 저장 순서는 **파일이 먼저, DB 기록이 나중.**
 * - 파일 전체를 메모리에 올리지 않고 스트림으로 흘려 쓴다 (DS218+ 의 RAM 이 작다).
 */
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { env } from "@/lib/env";
import { HEAD_BYTES, type SniffResult } from "./sniff";

/** 사용자에게 보여줄 수 있는 업로드 실패 사유 */
export class UploadError extends Error {}

export type UploadKind = "images" | "files";

/** DB 에 저장할 상대경로. 예: images/2026/10/{uuid}.png */
function buildRelativePath(kind: UploadKind, ext: string): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  // Linux(ext4)는 대소문자를 구분한다. 전부 소문자로 통일한다.
  return `${kind}/${year}/${month}/${randomUUID()}.${ext}`.toLowerCase();
}

/** 상대경로 → 실제 절대경로. 경로 탈출을 막는다. */
export function absolutePathOf(relativePath: string): string {
  if (!/^[a-z0-9][a-z0-9/._-]*$/.test(relativePath)) {
    throw new UploadError("저장 경로가 올바르지 않습니다.");
  }
  if (relativePath.includes("..")) {
    throw new UploadError("저장 경로가 올바르지 않습니다.");
  }
  // DB 에는 '/' 로 저장하고, 실제 경로를 만들 때만 OS 구분자로 바꾼다.
  return path.join(env.storageRoot, ...relativePath.split("/"));
}

/** 원본 파일명 — 화면 표시용으로만 쓴다. 디스크에는 쓰지 않는다. */
export function sanitizeOriginalName(
  raw: string | null | undefined,
  ext: string,
): string {
  const cleaned = (raw ?? "")
    // 경로 구분자와 제어문자를 뺀다
    .replace(/[\\/\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!cleaned) return `file.${ext}`;
  return cleaned.slice(0, 200);
}

export type SavedUpload = {
  relativePath: string;
  byteSize: number;
  mimeType: string;
};

/**
 * 요청 본문(스트림)을 그대로 디스크에 쓴다.
 * 앞부분을 먼저 모아 검사하고, 통과한 뒤에야 파일을 만든다.
 */
export async function saveUpload(opts: {
  kind: UploadKind;
  ext: string;
  body: ReadableStream<Uint8Array>;
  maxBytes: number;
  sniff: (head: Buffer) => SniffResult;
}): Promise<SavedUpload> {
  const reader = opts.body.getReader();

  // 1) 앞부분만 먼저 모은다
  const headParts: Buffer[] = [];
  let headSize = 0;
  let streamEnded = false;

  while (headSize < HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) {
      streamEnded = true;
      break;
    }
    const chunk = Buffer.from(value);
    headParts.push(chunk);
    headSize += chunk.length;
    if (headSize > opts.maxBytes) {
      await reader.cancel().catch(() => {});
      throw new UploadError("파일이 너무 큽니다.");
    }
  }

  const head = Buffer.concat(headParts);
  if (head.length === 0) throw new UploadError("빈 파일입니다.");

  // 2) 받아들일 파일인지 본다
  const verdict = opts.sniff(head);
  if (!verdict.ok) {
    await reader.cancel().catch(() => {});
    throw new UploadError(verdict.reason);
  }

  // 3) 파일을 먼저 쓴다 (DB 기록은 호출한 쪽에서 그 다음에)
  const relativePath = buildRelativePath(opts.kind, opts.ext);
  const absolute = absolutePathOf(relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });

  // wx: 이미 있는 파일을 덮어쓰지 않는다
  const out = createWriteStream(absolute, { flags: "wx" });
  let total = 0;

  try {
    const write = async (chunk: Buffer) => {
      total += chunk.length;
      if (total > opts.maxBytes) throw new UploadError("파일이 너무 큽니다.");
      if (!out.write(chunk)) await once(out, "drain");
    };

    await write(head);

    if (!streamEnded) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await write(Buffer.from(value));
      }
    }

    await new Promise<void>((resolve, reject) => {
      out.once("error", reject);
      out.end(() => resolve());
    });
  } catch (error) {
    out.destroy();
    await reader.cancel().catch(() => {});
    // 쓰다 만 파일은 치운다
    await unlink(absolute).catch(() => {});
    throw error;
  }

  return { relativePath, byteSize: total, mimeType: verdict.mimeType };
}

/** 내려줄 때 쓴다. 파일이 없으면 null. */
export async function openUpload(
  relativePath: string,
): Promise<{ stream: ReadableStream<Uint8Array>; byteSize: number } | null> {
  const absolute = absolutePathOf(relativePath);

  let byteSize: number;
  try {
    const info = await stat(absolute);
    if (!info.isFile()) return null;
    byteSize = info.size;
  } catch {
    return null;
  }

  const stream = Readable.toWeb(
    createReadStream(absolute),
  ) as ReadableStream<Uint8Array>;
  return { stream, byteSize };
}

/** 주인 없는 파일 정리에서 쓴다. */
export async function removeUpload(relativePath: string): Promise<void> {
  await unlink(absolutePathOf(relativePath)).catch(() => {});
}

/**
 * 한글 파일명을 그대로 내려받게 한다.
 * ASCII 만 쓰는 옛 브라우저용 이름을 함께 붙인다.
 */
export function contentDisposition(
  mode: "inline" | "attachment",
  originalName: string,
): string {
  const ascii = originalName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(originalName);
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
