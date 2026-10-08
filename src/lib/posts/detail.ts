/** 글 한 건 · 첨부 목록 · 열람자 명단 */
import { and, asc, eq } from "drizzle-orm";

import type { PostTopic } from "@/lib/codes";
import { db } from "@/lib/db";
import {
  webPostFiles,
  webPostViews,
  webPosts,
  webUsers,
} from "@/lib/db/schema";
import { UUID_RE } from "@/lib/http";

export type PostDetail = {
  id: string;
  authorId: string;
  authorName: string;
  topic: PostTopic;
  title: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export async function getPost(id: string): Promise<PostDetail | null> {
  if (!UUID_RE.test(id)) return null;

  const rows = await db
    .select({
      id: webPosts.id,
      authorId: webPosts.authorId,
      authorName: webUsers.displayName,
      topic: webPosts.topic,
      title: webPosts.title,
      content: webPosts.content,
      createdAt: webPosts.createdAt,
      updatedAt: webPosts.updatedAt,
    })
    .from(webPosts)
    .innerJoin(webUsers, eq(webUsers.id, webPosts.authorId))
    .where(and(eq(webPosts.id, id), eq(webPosts.isDeleted, false)))
    .limit(1);

  const row = rows[0];
  return row ? { ...row, topic: row.topic as PostTopic } : null;
}

export type PostFileItem = {
  id: string;
  originalName: string;
  byteSize: number;
};

export async function listPostFiles(postId: string): Promise<PostFileItem[]> {
  if (!UUID_RE.test(postId)) return [];

  return db
    .select({
      id: webPostFiles.id,
      originalName: webPostFiles.originalName,
      byteSize: webPostFiles.byteSize,
    })
    .from(webPostFiles)
    .where(
      and(eq(webPostFiles.postId, postId), eq(webPostFiles.isDeleted, false)),
    )
    .orderBy(asc(webPostFiles.sortOrder), asc(webPostFiles.createdAt));
}

export type PostViewer = { userId: string; name: string };

/** 열람자 명단 — 처음 읽은 순서. 관리자가 아니어도 누구나 볼 수 있다. */
export async function listPostViewers(postId: string): Promise<PostViewer[]> {
  if (!UUID_RE.test(postId)) return [];

  return db
    .select({ userId: webPostViews.userId, name: webUsers.displayName })
    .from(webPostViews)
    .innerJoin(webUsers, eq(webUsers.id, webPostViews.userId))
    .where(eq(webPostViews.postId, postId))
    .orderBy(asc(webPostViews.firstViewedAt));
}
