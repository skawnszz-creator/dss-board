import type { PostTopic } from "@/lib/codes";

/** 목록 화면의 상태는 주소로 나타낸다: /?topic=MUST_READ&q=안전&page=2 */
export function listHref(params: {
  topic?: PostTopic | null;
  q?: string | null;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.topic) sp.set("topic", params.topic);
  if (params.q) sp.set("q", params.q);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const query = sp.toString();
  return query ? `/?${query}` : "/";
}
