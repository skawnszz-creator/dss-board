/**
 * 올라온 파일이 정말 그 종류인지 **파일 앞부분 바이트**로 확인한다.
 *
 * - 확장자를 믿지 않는다.
 * - 브라우저가 보낸 MIME 타입을 믿지 않는다.
 * - 실행 파일(MZ · ELF)은 어떤 확장자로 위장해도 거부한다.
 * - 허용 목록(화이트리스트)에 없는 확장자는 전부 거부한다.
 */

export type SniffResult =
  | { ok: true; mimeType: string }
  | { ok: false; reason: string };

/** 앞부분을 몇 바이트까지 보면 되는가 (webp 판정에 12바이트가 필요하다) */
export const HEAD_BYTES = 16;

/** 본문에 붙이는 사진 */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"] as const;

/**
 * 첨부파일 (요구사항: 1개 10MB 이내).
 * 매크로가 들어갈 수 있는 xlsm·docm·pptm 은 넣지 않는다.
 */
export const FILE_EXTENSIONS = [
  "pdf",
  "hwp",
  "hwpx",
  "txt",
  "xlsx",
  "xls",
  "csv",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "zip",
] as const;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  hwp: "application/x-hwp",
  hwpx: "application/hwp+zip",
  txt: "text/plain",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  zip: "application/zip",
};

const SIGNATURES = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38], // "GIF8"
  riff: [0x52, 0x49, 0x46, 0x46], // "RIFF"
  webp: [0x57, 0x45, 0x42, 0x50], // "WEBP" (8바이트 뒤)
  pdf: [0x25, 0x50, 0x44, 0x46], // "%PDF"
  ole2: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // 옛 오피스·한글
  zipLocal: [0x50, 0x4b, 0x03, 0x04],
  zipEmpty: [0x50, 0x4b, 0x05, 0x06],
  zipSpanned: [0x50, 0x4b, 0x07, 0x08],
  mz: [0x4d, 0x5a], // Windows 실행파일
  elf: [0x7f, 0x45, 0x4c, 0x46], // Linux 실행파일
} as const;

function matches(head: Buffer, bytes: readonly number[], offset = 0): boolean {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((b, i) => head[offset + i] === b);
}

/** 어떤 확장자로 위장해도 거부한다 */
function looksExecutable(head: Buffer): boolean {
  return matches(head, SIGNATURES.mz) || matches(head, SIGNATURES.elf);
}

function isZipLike(head: Buffer): boolean {
  return (
    matches(head, SIGNATURES.zipLocal) ||
    matches(head, SIGNATURES.zipEmpty) ||
    matches(head, SIGNATURES.zipSpanned)
  );
}

/** 파일명에서 확장자만 뽑는다 (소문자) */
export function extensionOf(name: string): string | null {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return match ? match[1].toLowerCase() : null;
}

function checkSignature(ext: string, head: Buffer): SniffResult {
  const fail = { ok: false as const, reason: "파일 내용이 확장자와 맞지 않습니다." };

  switch (ext) {
    case "png":
      return matches(head, SIGNATURES.png) ? { ok: true, mimeType: MIME.png } : fail;

    case "jpg":
    case "jpeg":
      return matches(head, SIGNATURES.jpeg) ? { ok: true, mimeType: MIME.jpg } : fail;

    case "gif":
      return matches(head, SIGNATURES.gif) ? { ok: true, mimeType: MIME.gif } : fail;

    case "webp":
      return matches(head, SIGNATURES.riff) && matches(head, SIGNATURES.webp, 8)
        ? { ok: true, mimeType: MIME.webp }
        : fail;

    case "pdf":
      return matches(head, SIGNATURES.pdf) ? { ok: true, mimeType: MIME.pdf } : fail;

    // ZIP 구조를 쓰는 형식들
    case "xlsx":
    case "docx":
    case "pptx":
    case "hwpx":
    case "zip":
      return isZipLike(head) ? { ok: true, mimeType: MIME[ext] } : fail;

    // OLE2 구조를 쓰는 옛 형식들
    case "xls":
    case "doc":
    case "ppt":
    case "hwp":
      return matches(head, SIGNATURES.ole2) ? { ok: true, mimeType: MIME[ext] } : fail;

    // 고정 서명이 없는 글자 파일 — 널바이트가 섞이면 글자 파일이 아니다
    case "txt":
    case "csv":
      return head.includes(0x00)
        ? { ok: false, reason: "글자 파일이 아닌 것 같습니다." }
        : { ok: true, mimeType: MIME[ext] };

    default:
      return { ok: false, reason: "허용하지 않는 종류입니다." };
  }
}

function sniff(
  ext: string | null,
  head: Buffer,
  allowed: readonly string[],
): SniffResult {
  if (!ext) return { ok: false, reason: "확장자가 없는 파일은 올릴 수 없습니다." };
  if (!allowed.includes(ext)) {
    return { ok: false, reason: `${ext} 파일은 올릴 수 없습니다.` };
  }
  if (looksExecutable(head)) {
    return { ok: false, reason: "실행 파일은 올릴 수 없습니다." };
  }
  return checkSignature(ext, head);
}

/** 본문 사진용 */
export function sniffImage(ext: string | null, head: Buffer): SniffResult {
  return sniff(ext, head, IMAGE_EXTENSIONS);
}

/** 첨부파일용 */
export function sniffAttachment(ext: string | null, head: Buffer): SniffResult {
  return sniff(ext, head, FILE_EXTENSIONS);
}
