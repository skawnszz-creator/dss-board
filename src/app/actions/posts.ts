"use server";

import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { canEditPost, getViewer, requireSession } from "@/lib/auth/guards";
import { db, type Tx } from "@/lib/db";
import {
  POST_TOPICS,
  webPostFiles,
  webPostImages,
  webPostViews,
  webPosts,
  type PostTopic,
} from "@/lib/db/schema";
import { UUID_RE } from "@/lib/http";
import { MAX_FILES_PER_POST, TITLE_MAX_LENGTH } from "@/lib/limits";
import {
  collectImageIds,
  extractText,
  isEmptyDoc,
  sanitizePostDoc,
} from "@/lib/post-content/sanitize";

export type PostFormState = { error: string | null };

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function parseTopicStrict(value: string): PostTopic | null {
  return (POST_TOPICS as readonly string[]).includes(value)
    ? (value as PostTopic)
    : null;
}

function parseIdList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is string => typeof v === "string" && UUID_RE.test(v),
    );
  } catch {
    return [];
  }
}

/**
 * 첨부파일을 글에 붙인다.
 *
 * - 목록에서 빠진 첨부는 소프트 삭제한다 (물리 삭제하지 않는다)
 * - 내가 올린, 아직 주인이 없는 파일만 붙일 수 있다
 */
async function attachFiles(
  tx: Tx,
  postId: string,
  userId: string,
  fileIds: string[],
): Promise<void> {
  const now = new Date();

  await tx
    .update(webPostFiles)
    .set({
      isDeleted: true,
      deletedAt: now,
      deletedBy: userId,
      deleteReason: "글 수정에서 제거",
    })
    .where(
      and(
        eq(webPostFiles.postId, postId),
        eq(webPostFiles.isDeleted, false),
        fileIds.length > 0 ? notInArray(webPostFiles.id, fileIds) : undefined,
      ),
    );

  for (const [index, id] of fileIds.entries()) {
    await tx
      .update(webPostFiles)
      .set({ postId, sortOrder: index })
      .where(
        and(
          eq(webPostFiles.id, id),
          eq(webPostFiles.uploadedBy, userId),
          eq(webPostFiles.isDeleted, false),
          or(isNull(webPostFiles.postId), eq(webPostFiles.postId, postId)),
        ),
      );
  }
}

/** 본문에 실제로 쓰인 사진만 글에 붙이고, 빠진 사진은 소프트 삭제한다. */
async function attachImages(
  tx: Tx,
  postId: string,
  userId: string,
  imageIds: string[],
): Promise<void> {
  const now = new Date();

  await tx
    .update(webPostImages)
    .set({
      isDeleted: true,
      deletedAt: now,
      deletedBy: userId,
      deleteReason: "본문에서 빠짐",
    })
    .where(
      and(
        eq(webPostImages.postId, postId),
        eq(webPostImages.isDeleted, false),
        imageIds.length > 0
          ? notInArray(webPostImages.id, imageIds)
          : undefined,
      ),
    );

  if (imageIds.length > 0) {
    await tx
      .update(webPostImages)
      .set({ postId })
      .where(
        and(
          inArray(webPostImages.id, imageIds),
          eq(webPostImages.uploadedBy, userId),
          eq(webPostImages.isDeleted, false),
          or(isNull(webPostImages.postId), eq(webPostImages.postId, postId)),
        ),
      );
  }
}

/**
 * 글 쓰기 · 수정 (요구사항 3·4·9).
 * postId 가 있으면 수정, 없으면 새 글이다.
 */
export async function savePost(
  _previous: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const viewer = await requireSession();

  const postId = str(formData.get("postId")).trim();
  const title = str(formData.get("title")).trim();
  const topic = parseTopicStrict(str(formData.get("topic")));

  if (!title) return { error: "제목을 입력해 주세요." };
  if (title.length > TITLE_MAX_LENGTH) {
    return { error: `제목은 ${TITLE_MAX_LENGTH}자까지 쓸 수 있습니다.` };
  }
  if (!topic) return { error: "주제를 골라 주세요." };

  let rawContent: unknown;
  try {
    rawContent = JSON.parse(str(formData.get("content")) || "null");
  } catch {
    return { error: "내용을 읽지 못했습니다. 다시 시도해 주세요." };
  }

  // 클라이언트가 보낸 본문은 그대로 믿지 않는다 — 아는 모양만 남긴다.
  const content = sanitizePostDoc(rawContent);
  if (isEmptyDoc(content)) return { error: "내용을 입력해 주세요." };

  const fileIds = parseIdList(str(formData.get("fileIds")));
  if (fileIds.length > MAX_FILES_PER_POST) {
    return { error: `첨부파일은 ${MAX_FILES_PER_POST}개까지 올릴 수 있습니다.` };
  }

  const contentText = extractText(content);
  const imageIds = collectImageIds(content);
  const now = new Date();

  let savedId: string;

  if (postId) {
    if (!UUID_RE.test(postId)) return { error: "글을 찾을 수 없습니다." };

    const rows = await db
      .select({
        id: webPosts.id,
        authorId: webPosts.authorId,
        isDeleted: webPosts.isDeleted,
      })
      .from(webPosts)
      .where(eq(webPosts.id, postId))
      .limit(1);

    const post = rows[0];
    if (!post || post.isDeleted) return { error: "글을 찾을 수 없습니다." };

    // 화면에서 버튼을 숨기는 것과 별개로, 여기서 반드시 다시 판정한다.
    if (!canEditPost(viewer, post)) {
      return { error: "이 글을 수정할 권한이 없습니다." };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(webPosts)
        .set({ topic, title, content, contentText, updatedAt: now })
        .where(eq(webPosts.id, postId));
      await attachFiles(tx, postId, viewer.user.id, fileIds);
      await attachImages(tx, postId, viewer.user.id, imageIds);
    });

    savedId = postId;
    await writeAudit({
      actorId: viewer.user.id,
      action: AUDIT_ACTIONS.POST_UPDATE,
      targetType: "POST",
      targetId: savedId,
      detail: { title, topic, files: fileIds.length },
    });
  } else {
    savedId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(webPosts)
        .values({
          authorId: viewer.user.id,
          topic,
          title,
          content,
          contentText,
        })
        .returning({ id: webPosts.id });

      await attachFiles(tx, created.id, viewer.user.id, fileIds);
      await attachImages(tx, created.id, viewer.user.id, imageIds);
      return created.id;
    });

    await writeAudit({
      actorId: viewer.user.id,
      action: AUDIT_ACTIONS.POST_CREATE,
      targetType: "POST",
      targetId: savedId,
      detail: { title, topic, files: fileIds.length },
    });
  }

  revalidatePath("/");
  revalidatePath(`/posts/${savedId}`);
  redirect(`/posts/${savedId}`);
}

/**
 * 글 삭제 (요구사항 9).
 * 작성자와 관리자만 가능하고, **되살리는 기능은 만들지 않는다**(사용자 결정).
 */
export async function deletePost(formData: FormData): Promise<void> {
  const viewer = await requireSession();
  const postId = str(formData.get("postId")).trim();
  if (!UUID_RE.test(postId)) redirect("/");

  const rows = await db
    .select({
      id: webPosts.id,
      authorId: webPosts.authorId,
      title: webPosts.title,
      isDeleted: webPosts.isDeleted,
    })
    .from(webPosts)
    .where(eq(webPosts.id, postId))
    .limit(1);

  const post = rows[0];
  if (!post || post.isDeleted) redirect("/");
  if (!canEditPost(viewer, post)) redirect(`/posts/${postId}`);

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(webPosts)
      .set({
        isDeleted: true,
        deletedAt: now,
        deletedBy: viewer.user.id,
        deleteReason: "작성자 또는 관리자 삭제",
        updatedAt: now,
      })
      .where(eq(webPosts.id, postId));

    // 첨부와 사진도 같이 접는다
    for (const table of [webPostFiles, webPostImages]) {
      await tx
        .update(table)
        .set({
          isDeleted: true,
          deletedAt: now,
          deletedBy: viewer.user.id,
          deleteReason: "글 삭제",
        })
        .where(and(eq(table.postId, postId), eq(table.isDeleted, false)));
    }
  });

  await writeAudit({
    actorId: viewer.user.id,
    action: AUDIT_ACTIONS.POST_DELETE,
    targetType: "POST",
    targetId: postId,
    detail: { title: post.title, byAdmin: post.authorId !== viewer.user.id },
  });

  revalidatePath("/");
  redirect("/");
}

/**
 * 열람 기록 (요구사항 6).
 *
 * 글 보기 화면이 실제로 열린 뒤에 한 번만 부른다.
 * 서버 렌더 중에 기록하면 목록에서 마우스만 올려도(미리 불러오기) 명단에 들어간다.
 */
export async function recordPostView(
  postId: string,
): Promise<{ userId: string; name: string } | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (!UUID_RE.test(postId)) return null;

  const rows = await db
    .select({ id: webPosts.id })
    .from(webPosts)
    .where(and(eq(webPosts.id, postId), eq(webPosts.isDeleted, false)))
    .limit(1);
  if (rows.length === 0) return null;

  await db
    .insert(webPostViews)
    .values({ postId, userId: viewer.user.id })
    .onConflictDoUpdate({
      target: [webPostViews.postId, webPostViews.userId],
      set: {
        lastViewedAt: new Date(),
        viewCount: sql`${webPostViews.viewCount} + 1`,
      },
    });

  return { userId: viewer.user.id, name: viewer.user.displayName };
}
