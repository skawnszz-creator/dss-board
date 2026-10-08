/**
 * 글 목록 조회 (요구사항 5·7·8·10·11).
 *
 * SQL 은 반드시 Drizzle 의 파라미터 바인딩으로만 만든다. 문자열을 이어붙이지 않는다.
 */
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  POST_TOPICS,
  webPostFiles,
  webPosts,
  webUsers,
  type PostTopic,
} from "@/lib/db/schema";
import { POSTS_PER_PAGE } from "@/lib/limits";

export type PostListItem = {
  id: string;
  topic: PostTopic;
  title: string;
  authorName: string;
  createdAt: Date;
  fileCount: number;
};

export type ListPostsParams = {
  topic?: PostTopic | null;
  q?: string | null;
  page?: number;
};

export type ListPostsResult = {
  items: PostListItem[];
  total: number;
  page: number;
  totalPages: number;
  /** 필독 고정이 적용된 목록인가 (기본 목록일 때만 true) */
  pinned: boolean;
};

/** 주소로 들어온 주제값이 우리가 아는 값일 때만 받아들인다. */
export function parseTopic(value: string | undefined | null): PostTopic | null {
  if (!value) return null;
  return (POST_TOPICS as readonly string[]).includes(value)
    ? (value as PostTopic)
    : null;
}

/** 1 이상 정수만. 아니면 1쪽. */
export function parsePage(value: string | undefined | null): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

/** ILIKE 패턴에서 사용자가 넣은 % _ \ 를 글자 그대로 찾게 한다. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function listPosts(
  params: ListPostsParams,
): Promise<ListPostsResult> {
  const topic = params.topic ?? null;
  const q = params.q?.trim() || null;

  const conditions: SQL[] = [eq(webPosts.isDeleted, false)];

  if (topic) conditions.push(eq(webPosts.topic, topic));

  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    // 제목 · 본문 글자 · 작성자 이름에서 찾는다
    const match = or(
      ilike(webPosts.title, pattern),
      ilike(webPosts.contentText, pattern),
      ilike(webUsers.displayName, pattern),
    );
    if (match) conditions.push(match);
  }

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(webPosts)
    .innerJoin(webUsers, eq(webUsers.id, webPosts.authorId))
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const page = Math.min(Math.max(1, params.page ?? 1), totalPages);

  /*
   * 정렬 (DESIGN 4절)
   * - 기본      : 필독을 맨 위에 고정하고 그 안에서 최신순
   * - 주제 필터 : 이미 한 주제만 보므로 고정 없이 최신순
   * - 검색      : 찾는 글이 위에 오게 최신순만
   */
  const pinned = !topic && !q;
  const orderBy = pinned
    ? [sql`(${webPosts.topic} = 'MUST_READ') desc`, desc(webPosts.createdAt)]
    : [desc(webPosts.createdAt)];

  const fileCount = sql<number>`(
    select count(*) from ${webPostFiles}
    where ${webPostFiles.postId} = ${webPosts.id}
      and ${webPostFiles.isDeleted} = false
  )`.mapWith(Number);

  const rows = await db
    .select({
      id: webPosts.id,
      topic: webPosts.topic,
      title: webPosts.title,
      authorName: webUsers.displayName,
      createdAt: webPosts.createdAt,
      fileCount,
    })
    .from(webPosts)
    .innerJoin(webUsers, eq(webUsers.id, webPosts.authorId))
    .where(where)
    .orderBy(...orderBy)
    .limit(POSTS_PER_PAGE)
    .offset((page - 1) * POSTS_PER_PAGE);

  return {
    items: rows.map((r) => ({ ...r, topic: r.topic as PostTopic })),
    total,
    page,
    totalPages,
    pinned,
  };
}
