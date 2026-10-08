/**
 * 한곳에서 정한 상한값. 화면과 서버가 같은 값을 본다.
 * 화면에서 미리 걸러주더라도 실제 차단은 반드시 서버에서 한다.
 */

/** 목록 한 페이지에 보이는 글 수 (요구사항 10) */
export const POSTS_PER_PAGE = 20;

/** 제목 길이 */
export const TITLE_MAX_LENGTH = 200;

/* 본문에 붙이는 사진 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGES_PER_POST = 20;

/* 첨부파일 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_FILES_PER_POST = 10;

/** 사람이 읽는 크기 표시 (1.2MB) */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
