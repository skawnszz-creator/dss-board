/**
 * DB 에 저장된 영문 코드를 화면 글자로 바꾼다.
 *
 * DB 에 한글을 넣지 않는 이유: 계측기 시스템에서 psql 로 한글 리터럴을 넘기면
 * 깨지는 문제를 겪었다. 코드값은 영문으로 두고 화면 글자는 여기서만 붙인다.
 */
import type { PostTopic, UserRole } from "@/lib/codes";

export const TOPIC_LABELS: Record<PostTopic, string> = {
  MUST_READ: "필독",
  NOTICE: "공지",
  GENERAL: "일반",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  MEMBER: "일반",
  ADMIN: "관리자",
};
