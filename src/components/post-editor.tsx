"use client";

import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ALLOWED_FONT_SIZES,
  IMAGE_MIN_WIDTH,
  type PostDoc,
} from "@/lib/post-content/types";

/** 고를 수 있는 글자색 */
const COLORS: { label: string; value: string }[] = [
  { label: "검정", value: "#111827" },
  { label: "회색", value: "#6b7280" },
  { label: "빨강", value: "#dc2626" },
  { label: "주황", value: "#ea580c" },
  { label: "초록", value: "#16a34a" },
  { label: "파랑", value: "#1d4ed8" },
  { label: "남색", value: "#1e3a8a" },
  { label: "보라", value: "#7e22ce" },
];

function imageFilesOf(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((f) => f.type.startsWith("image/"));
}

export function PostEditor({
  initialContent,
  onChange,
}: {
  initialContent: PostDoc;
  onChange: (doc: PostDoc) => void;
}) {
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /** 사진을 서버에 올리고 본문에 넣는다 */
  const uploadImages = useCallback(async (files: File[]) => {
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const res = await fetch(
          `/api/images?name=${encodeURIComponent(file.name)}`,
          { method: "POST", body: file },
        );
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setError(data.error ?? "사진을 올리지 못했습니다.");
          continue;
        }
        editorRef.current
          ?.chain()
          .focus()
          .setImage({ src: data.url, alt: file.name })
          .run();
        setError(null);
      } catch {
        setError("사진을 올리지 못했습니다. 네트워크를 확인해 주세요.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }, []);

  const editor = useEditor({
    // App Router 에서 서버 렌더 중에 바로 그리면 경고가 난다
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // 본문 저장 형식이 지원하지 않는 서식은 아예 끈다.
        // (켜 두면 단축키로 쓴 서식이 저장될 때 조용히 사라진다)
        strike: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: { openOnClick: false },
      }),
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ["paragraph"] }),
      Image.configure({
        allowBase64: false,
        // 모서리를 끌어 크기 조절. 비율은 항상 유지한다 (높이는 저장하지 않는다)
        resize: {
          enabled: true,
          directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
          minWidth: IMAGE_MIN_WIDTH,
          minHeight: 30,
          alwaysPreserveAspectRatio: true,
        },
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "post-body min-h-[320px] px-3 py-3",
      },
      // 붙여넣기로 들어온 사진 (요구사항 4)
      handlePaste: (_view, event) => {
        const files = imageFilesOf(event.clipboardData);
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadImages(files);
        return true;
      },
      // 끌어다 놓은 사진
      handleDrop: (_view, event) => {
        const files = imageFilesOf((event as DragEvent).dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadImages(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as PostDoc),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  if (!editor) {
    return (
      <div className="min-h-[380px] rounded border border-gray-300 bg-gray-50" />
    );
  }

  const btn = (active: boolean) =>
    `h-8 min-w-8 rounded border px-2 text-sm leading-none ${
      active
        ? "border-blue-700 bg-blue-700 text-white"
        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
    }`;

  return (
    <div className="rounded border border-gray-300">
      {/* 도구 모음 */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-2">
        <select
          aria-label="글자 크기"
          value={editor.getAttributes("textStyle").fontSize ?? "16px"}
          onChange={(e) => {
            const size = e.target.value;
            editor.chain().focus().setFontSize(size).run();
          }}
          className="h-8 rounded border border-gray-300 bg-white px-1 text-sm"
        >
          {ALLOWED_FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size.replace("px", "")}
            </option>
          ))}
        </select>

        <select
          aria-label="글자 색"
          value={editor.getAttributes("textStyle").color ?? "#111827"}
          onChange={(e) =>
            editor.chain().focus().setColor(e.target.value).run()
          }
          className="h-8 rounded border border-gray-300 bg-white px-1 text-sm"
        >
          {COLORS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <span className="mx-1 h-5 w-px bg-gray-300" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btn(editor.isActive("bold"))}
          title="굵게"
        >
          <b>B</b>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btn(editor.isActive("italic"))}
          title="기울임"
        >
          <i>I</i>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={btn(editor.isActive("underline"))}
          title="밑줄"
        >
          <u>U</u>
        </button>

        <span className="mx-1 h-5 w-px bg-gray-300" />

        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={btn(editor.isActive({ textAlign: "left" }))}
          title="왼쪽 정렬"
        >
          ≡
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={btn(editor.isActive({ textAlign: "center" }))}
          title="가운데 정렬"
        >
          ☰
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className={btn(editor.isActive({ textAlign: "right" }))}
          title="오른쪽 정렬"
        >
          ≣
        </button>

        <span className="mx-1 h-5 w-px bg-gray-300" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btn(editor.isActive("bulletList"))}
          title="글머리 기호"
        >
          • 목록
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btn(editor.isActive("orderedList"))}
          title="번호 목록"
        >
          1. 목록
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btn(editor.isActive("blockquote"))}
          title="인용"
        >
          인용
        </button>

        <span className="mx-1 h-5 w-px bg-gray-300" />

        <button
          type="button"
          onClick={() => {
            const previous = editor.getAttributes("link").href as
              | string
              | undefined;
            const url = window.prompt("링크 주소", previous ?? "https://");
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().unsetLink().run();
              return;
            }
            if (!/^https?:\/\//i.test(url)) {
              setError("링크는 http:// 또는 https:// 로 시작해야 합니다.");
              return;
            }
            editor.chain().focus().setLink({ href: url }).run();
          }}
          className={btn(editor.isActive("link"))}
          title="링크"
        >
          링크
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={btn(false)}
          title="사진 넣기"
        >
          사진
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) void uploadImages(files);
          }}
        />

        {uploading > 0 && (
          <span className="ml-1 text-xs text-gray-500">
            사진 올리는 중… ({uploading})
          </span>
        )}
      </div>

      <EditorContent editor={editor} />

      {error && (
        <p className="border-t border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
