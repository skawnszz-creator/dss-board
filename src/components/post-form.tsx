"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { savePost, type PostFormState } from "@/app/actions/posts";
import { POST_TOPICS, type PostTopic } from "@/lib/codes";
import { TOPIC_LABELS } from "@/lib/labels";
import { TITLE_MAX_LENGTH } from "@/lib/limits";
import type { PostDoc } from "@/lib/post-content/types";
import { AttachmentPicker, type Attachment } from "./attachment-picker";
import { PostEditor } from "./post-editor";

export function PostForm({
  postId,
  initialTitle,
  initialTopic,
  initialContent,
  initialFiles,
  cancelHref,
}: {
  postId?: string;
  initialTitle: string;
  initialTopic: PostTopic;
  initialContent: PostDoc;
  initialFiles: Attachment[];
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(
    savePost,
    { error: null },
  );

  const [content, setContent] = useState<PostDoc>(initialContent);
  const [files, setFiles] = useState<Attachment[]>(initialFiles);
  const [topic, setTopic] = useState<PostTopic>(initialTopic);

  return (
    <form action={formAction} className="space-y-4">
      {postId && <input type="hidden" name="postId" value={postId} />}
      <input type="hidden" name="content" value={JSON.stringify(content)} />
      <input
        type="hidden"
        name="fileIds"
        value={JSON.stringify(files.map((f) => f.id))}
      />
      <input type="hidden" name="topic" value={topic} />

      {/* 주제 (요구사항 3) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 shrink-0 text-sm text-gray-600">주제</span>
        {POST_TOPICS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTopic(value)}
            className={
              topic === value
                ? "h-9 rounded border border-blue-700 bg-blue-700 px-4 text-sm font-semibold text-white"
                : "h-9 rounded border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50"
            }
          >
            {TOPIC_LABELS[value]}
          </button>
        ))}
      </div>

      {/* 제목 */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="title"
          className="w-12 shrink-0 text-sm text-gray-600"
        >
          제목
        </label>
        <input
          id="title"
          name="title"
          defaultValue={initialTitle}
          maxLength={TITLE_MAX_LENGTH}
          required
          placeholder="제목을 입력하세요"
          className="h-9 w-full rounded border border-gray-300 px-3 text-sm outline-none focus:border-blue-700"
        />
      </div>

      {/* 내용 (요구사항 4) */}
      <div>
        <PostEditor initialContent={initialContent} onChange={setContent} />
        <p className="mt-1 text-xs text-gray-400">
          사진은 복사해서 붙여넣기(Ctrl+V)하거나 끌어다 놓으면 본문에 들어갑니다.
        </p>
      </div>

      {/* 첨부파일 */}
      <div>
        <p className="mb-1 text-sm text-gray-600">첨부파일</p>
        <AttachmentPicker files={files} onChange={setFiles} />
      </div>

      {state.error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
        <Link
          href={cancelHref}
          className="h-9 rounded border border-gray-300 px-4 text-sm leading-9 text-gray-700 hover:bg-gray-50"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-gray-300"
        >
          {pending ? "저장 중…" : postId ? "수정" : "등록"}
        </button>
      </div>
    </form>
  );
}
