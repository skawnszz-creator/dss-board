"use client";

import { deletePost } from "@/app/actions/posts";

/** 삭제는 되살릴 수 없다. 그래서 지우기 전에 한 번 더 묻는다. */
export function DeletePostButton({ postId }: { postId: string }) {
  return (
    <form
      action={deletePost}
      onSubmit={(event) => {
        const ok = window.confirm(
          "정말 삭제하시겠습니까?\n삭제한 글은 되살릴 수 없습니다.",
        );
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        className="h-8 rounded border border-gray-300 px-3 text-sm text-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
      >
        삭제
      </button>
    </form>
  );
}
