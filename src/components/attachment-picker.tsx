"use client";

import { useRef, useState } from "react";

import { MAX_FILES_PER_POST, MAX_FILE_BYTES, formatBytes } from "@/lib/limits";
import { FILE_EXTENSIONS } from "@/lib/uploads/sniff";

export type Attachment = {
  id: string;
  originalName: string;
  byteSize: number;
};

const ACCEPT = FILE_EXTENSIONS.map((e) => `.${e}`).join(",");

export function AttachmentPicker({
  files,
  onChange,
}: {
  files: Attachment[];
  onChange: (next: Attachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (picked: File[]) => {
    setError(null);

    let current = files;
    for (const file of picked) {
      if (current.length >= MAX_FILES_PER_POST) {
        setError(`첨부파일은 ${MAX_FILES_PER_POST}개까지 올릴 수 있습니다.`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(
          `${file.name} — 한 개에 ${formatBytes(MAX_FILE_BYTES)} 까지 올릴 수 있습니다.`,
        );
        continue;
      }

      setUploading((n) => n + 1);
      try {
        const res = await fetch(
          `/api/files?name=${encodeURIComponent(file.name)}`,
          { method: "POST", body: file },
        );
        const data = (await res.json()) as Partial<Attachment> & {
          error?: string;
        };
        if (!res.ok || !data.id) {
          setError(data.error ?? `${file.name} 을(를) 올리지 못했습니다.`);
          continue;
        }
        current = [
          ...current,
          {
            id: data.id,
            originalName: data.originalName ?? file.name,
            byteSize: data.byteSize ?? file.size,
          },
        ];
        onChange(current);
      } catch {
        setError("파일을 올리지 못했습니다. 네트워크를 확인해 주세요.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const picked = Array.from(e.dataTransfer.files);
        if (picked.length > 0) void upload(picked);
      }}
      className={`rounded border px-3 py-3 ${
        dragging ? "border-blue-700 bg-blue-50" : "border-gray-300"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="h-8 rounded border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
        >
          파일 선택
        </button>
        <span className="text-xs text-gray-500">
          끌어다 놓아도 됩니다 · 한 개 {formatBytes(MAX_FILE_BYTES)} 이내 ·{" "}
          {MAX_FILES_PER_POST}개까지
        </span>
        {uploading > 0 && (
          <span className="text-xs text-gray-500">
            올리는 중… ({uploading})
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length > 0) void upload(picked);
        }}
      />

      {files.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate text-gray-800">
                {file.originalName}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-gray-500 tabular">
                  {formatBytes(file.byteSize)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange(files.filter((f) => f.id !== file.id))
                  }
                  className="text-xs text-gray-500 hover:text-red-700 hover:underline"
                >
                  빼기
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <p className="mt-2 text-xs text-gray-400">
        올릴 수 있는 종류: {FILE_EXTENSIONS.join(" · ")}
      </p>
    </div>
  );
}
