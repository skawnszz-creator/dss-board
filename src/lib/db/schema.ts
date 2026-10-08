import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* 코드값 — 실제 정의는 src/lib/codes.ts 에 있다                         */
/* DB 에는 영문 코드를 저장하고, 화면 글자는 src/lib/labels.ts 에서 붙인다. */
/* (psql 로 한글 리터럴을 넘기면 깨지는 문제를 피하려는 것이다)           */
/* ------------------------------------------------------------------ */

import { POST_TOPICS, USER_ROLES } from "@/lib/codes";

export { POST_TOPICS, USER_ROLES };
export type { PostTopic, UserRole } from "@/lib/codes";

/** SQL CHECK 제약에 넣을 `'A','B'` 형태의 목록 */
function codeList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(",");
}

/* ------------------------------------------------------------------ */
/* 공통 컬럼                                                            */
/* ------------------------------------------------------------------ */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/** 소프트 삭제 4컬럼 — 이름과 개수가 고정이다. 물리 삭제는 하지 않는다. */
const softDelete = {
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by"),
  deleteReason: text("delete_reason"),
};

/** 파일 크기(바이트). 10MB 제한이지만 자리는 넉넉히 둔다. */
const byteSize = (name: string) => bigint(name, { mode: "number" });

/* ------------------------------------------------------------------ */
/* web_users — 이 사이트의 로그인 계정                                   */
/* dss-auth 의 users 테이블과는 별개다. auth_sub 로만 이어진다.          */
/* ------------------------------------------------------------------ */

export const webUsers = pgTable(
  "web_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * dss-auth ID 토큰의 sub (= 포털 users.id).
     * 사람을 잇는 유일한 영구 식별자다. 이메일·이름으로 사람을 식별하지 않는다.
     */
    authSub: uuid("auth_sub").notNull(),

    /** 화면 표시용. 로그인할 때마다 토큰 값으로 갱신한다. */
    displayName: text("display_name").notNull(),

    /** 화면 표시용. 카카오에서 이메일이 안 올 수 있어 nullable 이다. */
    email: text("email"),

    role: text("role").notNull().default("MEMBER"),

    /** 쓸 수 있는 계정인가. 끊어야 할 계정은 false (기록은 남긴다) */
    isActive: boolean("is_active").notNull().default(true),

    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("web_users_auth_sub_uq").on(t.authSub),
    index("web_users_alive_idx")
      .on(t.displayName)
      .where(sql`${t.isDeleted} = false`),
    check("web_users_role_check", sql`${t.role} in (${sql.raw(codeList(USER_ROLES))})`),
  ],
);

/* ------------------------------------------------------------------ */
/* web_sessions — 이 사이트의 세션 (서버 저장형)                         */
/* 쿠키에는 랜덤 토큰 원문, 여기에는 그 sha256 만 둔다.                  */
/* 그래야 문제 계정을 즉시 끊을 수 있다.                                 */
/* ------------------------------------------------------------------ */

export const webSessions = pgTable(
  "web_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => webUsers.id),

    /** 쿠키 토큰의 sha256. 원문은 어디에도 저장하지 않는다. */
    tokenHash: text("token_hash").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /** 로그아웃·강제 차단으로 끊긴 시각 */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("web_sessions_token_hash_uq").on(t.tokenHash),
    index("web_sessions_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* web_posts — 게시글. 이 사이트의 중심                                  */
/* ------------------------------------------------------------------ */

export const webPosts = pgTable(
  "web_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    authorId: uuid("author_id")
      .notNull()
      .references(() => webUsers.id),

    topic: text("topic").notNull(),

    title: varchar("title", { length: 200 }).notNull(),

    /**
     * 서식 있는 본문. HTML 문자열이 아니라 구조화된 문서(JSON)로 저장한다.
     * 화면에 그릴 때 우리가 아는 노드만 React 요소로 바꾸므로
     * dangerouslySetInnerHTML 을 쓸 일이 없다.
     */
    content: jsonb("content").notNull(),

    /** 검색용으로 본문에서 글자만 뽑아둔 것 */
    contentText: text("content_text").notNull().default(""),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    // 기본 목록: 최신순 (필독 고정은 쿼리에서 ORDER BY 로 얹는다)
    index("web_posts_live_created_idx")
      .on(t.createdAt)
      .where(sql`${t.isDeleted} = false`),
    // 주제로 걸러 볼 때
    index("web_posts_live_topic_idx")
      .on(t.topic, t.createdAt)
      .where(sql`${t.isDeleted} = false`),
    index("web_posts_author_idx").on(t.authorId),
    check("web_posts_topic_check", sql`${t.topic} in (${sql.raw(codeList(POST_TOPICS))})`),
  ],
);

/* ------------------------------------------------------------------ */
/* web_post_views — 누가 읽었는가 (요구사항 6)                           */
/* 관리자가 아니어도 누구나 명단을 볼 수 있다.                            */
/* ------------------------------------------------------------------ */

export const webPostViews = pgTable(
  "web_post_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => webPosts.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => webUsers.id),

    /** 명단 정렬 기준 */
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    viewCount: integer("view_count").notNull().default(1),
  },
  (t) => [
    // 같은 사람이 열 번 봐도 명단에는 한 번만 나온다
    uniqueIndex("web_post_views_post_user_uq").on(t.postId, t.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* web_post_images — 본문에 붙인 사진                                    */
/* ------------------------------------------------------------------ */

export const webPostImages = pgTable(
  "web_post_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** 글을 저장하기 전에 올린 사진은 아직 주인이 없다 */
    postId: uuid("post_id").references(() => webPosts.id),

    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => webUsers.id),

    /**
     * STORAGE_ROOT 아래의 상대경로. 예: images/2026/10/{uuid}.png
     * 절대경로를 넣지 않는다. 구분자는 항상 '/' 다.
     */
    storagePath: text("storage_path").notNull(),

    /** 원본 파일명. 화면 표시용으로만 쓴다 (디스크에는 UUID 로 저장) */
    originalName: text("original_name").notNull(),

    /** 서버가 파일 앞부분을 보고 판정한 값. 브라우저가 보낸 값이 아니다. */
    mimeType: text("mime_type").notNull(),
    byteSize: byteSize("byte_size").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...softDelete,
  },
  (t) => [
    index("web_post_images_post_idx")
      .on(t.postId)
      .where(sql`${t.isDeleted} = false`),
  ],
);

/* ------------------------------------------------------------------ */
/* web_post_files — 첨부파일                                            */
/* 항상 '내려받기'로만 내려준다. 브라우저에서 바로 열리지 않게 한다.       */
/* ------------------------------------------------------------------ */

export const webPostFiles = pgTable(
  "web_post_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** 글을 저장하기 전에 올린 첨부는 아직 주인이 없다 */
    postId: uuid("post_id").references(() => webPosts.id),

    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => webUsers.id),

    /** STORAGE_ROOT 아래의 상대경로. 예: files/2026/10/{uuid}.xlsx */
    storagePath: text("storage_path").notNull(),

    /** 화면에 보이는 이름이자 내려받을 때 붙는 이름 */
    originalName: text("original_name").notNull(),

    mimeType: text("mime_type").notNull(),
    byteSize: byteSize("byte_size").notNull(),

    downloadCount: integer("download_count").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...softDelete,
  },
  (t) => [
    index("web_post_files_post_idx")
      .on(t.postId, t.sortOrder)
      .where(sql`${t.isDeleted} = false`),
  ],
);

/* ------------------------------------------------------------------ */
/* web_audit_logs — 감사 기록. 추가만 한다 (append-only)                 */
/* UI 로 개별 기록을 지울 수 있게 만들지 않는다.                          */
/* ------------------------------------------------------------------ */

export const webAuditLogs = pgTable(
  "web_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** 누가. 로그인 실패처럼 주인이 없는 기록도 있다 */
    actorId: uuid("actor_id").references(() => webUsers.id),

    /** 무엇을. 예: LOGIN · POST_CREATE · POST_DELETE · FILE_DOWNLOAD */
    action: text("action").notNull(),

    /** 어디에. 예: POST · USER · FILE */
    targetType: text("target_type"),
    targetId: uuid("target_id"),

    /** 남길 세부 내용 (제목·바뀐 역할 등). 개인정보를 과하게 담지 않는다. */
    detail: jsonb("detail"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("web_audit_logs_created_idx").on(t.createdAt),
    index("web_audit_logs_target_idx").on(t.targetType, t.targetId),
  ],
);

/* ------------------------------------------------------------------ */
/* 타입                                                                */
/* ------------------------------------------------------------------ */

export type WebUser = typeof webUsers.$inferSelect;
export type WebSession = typeof webSessions.$inferSelect;
export type Post = typeof webPosts.$inferSelect;
export type PostView = typeof webPostViews.$inferSelect;
export type PostImage = typeof webPostImages.$inferSelect;
export type PostFile = typeof webPostFiles.$inferSelect;
export type AuditLog = typeof webAuditLogs.$inferSelect;
