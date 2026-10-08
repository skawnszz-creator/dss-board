/**
 * DB 에 저장하는 코드값.
 *
 * 이 파일은 **아무것도 불러오지 않는다.** 화면(클라이언트) 코드에서도 쓰기 때문에
 * 여기에 DB 라이브러리를 끌어들이면 브라우저로 같이 실려 나간다.
 * 화면에 보일 한글은 src/lib/labels.ts 에서 붙인다.
 */

/** 이 사이트 안에서의 역할. 처음 로그인하는 사람은 항상 MEMBER 로 시작한다. */
export const USER_ROLES = [
  "MEMBER", // 일반 직원 — 글 읽기·쓰기, 자기 글 수정·삭제
  "ADMIN", // 관리자 — 모든 글 수정·삭제, 직원 역할 변경
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * 글의 주제. 화면에서는 필독 · 공지 · 일반으로 보인다.
 * MUST_READ(필독)만 목록 맨 위에 고정되고 굵은 글씨로 표시된다.
 */
export const POST_TOPICS = [
  "MUST_READ", // 필독
  "NOTICE", // 공지
  "GENERAL", // 일반
] as const;
export type PostTopic = (typeof POST_TOPICS)[number];
