import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  AlertCircle,
} from "lucide-react";
import type { FilePreview } from "@/types";
import TextPreview from "./previews/TextPreview";
import ImagePreview from "./previews/ImagePreview";
import MarkdownPreview from "./previews/MarkdownPreview";

interface Props {
  open: boolean;
  onClose: () => void;
  preview: FilePreview | null;
  loading: boolean;
  error: string | null;
  fileName: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenExternal: () => void;
}

export default function FilePreviewModal({
  open,
  onClose,
  preview,
  loading,
  error,
  fileName,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onOpenExternal,
}: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          if (hasPrev) onPrev();
          break;
        case "ArrowRight":
          if (hasNext) onNext();
          break;
      }
    },
    [onClose, onPrev, onNext, hasPrev, hasNext],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
              style={{
                borderColor: "var(--border-default)",
                borderTopColor: "var(--gold)",
              }}
            />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              加载中…
            </p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle
              size={32}
              strokeWidth={1}
              className="mx-auto mb-2"
              style={{ color: "var(--color-danger)" }}
            />
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          </div>
        </div>
      );
    }

    if (!preview) return null;

    const { mime_type, content, original_name } = preview;

    if (mime_type.startsWith("image/")) {
      return <ImagePreview src={content} alt={original_name} />;
    }

    if (mime_type === "text/markdown") {
      return <MarkdownPreview content={content} />;
    }

    // 其他文本类型
    return <TextPreview content={content} />;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col animate-fade-in"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      {/* 顶栏 */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
          <span
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {fileName}
          </span>
          {preview && (
            <span
              className="text-xs shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {formatSize(preview.size)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* 上一个 */}
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="p-1.5 rounded transition-colors hover:bg-[var(--bg-surface-alt)] disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
            title="上一个文件 (←)"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          {/* 下一个 */}
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="p-1.5 rounded transition-colors hover:bg-[var(--bg-surface-alt)] disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
            title="下一个文件 (→)"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>

          <div className="w-px h-4 mx-1" style={{ background: "var(--border-default)" }} />

          {/* 用系统应用打开 */}
          <button
            onClick={onOpenExternal}
            className="p-1.5 rounded transition-colors hover:bg-[var(--bg-surface-alt)]"
            style={{ color: "var(--text-secondary)" }}
            title="用系统默认应用打开"
          >
            <ExternalLink size={16} strokeWidth={1.5} />
          </button>

          {/* 关闭 */}
          <button
            onClick={onClose}
            className="p-1.5 rounded transition-colors hover:bg-[var(--bg-surface-alt)]"
            style={{ color: "var(--text-tertiary)" }}
            title="关闭 (Esc)"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 预览内容 */}
      <div className="flex-1 overflow-hidden p-4 flex flex-col">{renderPreview()}</div>
    </div>,
    document.body,
  );
}
