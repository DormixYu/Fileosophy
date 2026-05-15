import { useEffect, useCallback } from "react";
import Modal from "@/components/common/Modal";
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
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
    },
    [onPrev, onNext, hasPrev, hasNext],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

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

  return (
    <Modal open={open} onClose={onClose} fullScreen>
      {/* 顶栏 — 品牌化 */}
      <div
        className="flex items-center justify-between px-5 py-2.5 shrink-0"
        style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* 鎏金装饰竖线 */}
          <div
            className="w-1 h-4 shrink-0 rounded-full"
            style={{ background: "var(--gold)" }}
          />
          <FileText size={16} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
          <span
            className="text-sm font-serif truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {fileName}
          </span>
          {preview && (
            <span
              className="text-xs shrink-0 font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              {formatSize(preview.size)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="p-1.5 rounded-md transition-all hover-gold-bg disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
            title="上一个文件 (←)"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="p-1.5 rounded-md transition-all hover-gold-bg disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
            title="下一个文件 (→)"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>

          <div className="w-px h-4 mx-1" style={{ background: "var(--border-default)" }} />

          <button
            onClick={onOpenExternal}
            className="p-1.5 rounded-md transition-all hover-gold-bg hover-gold-text"
            style={{ color: "var(--text-secondary)" }}
            title="用系统默认应用打开"
          >
            <ExternalLink size={16} strokeWidth={1.5} />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md transition-all hover-gold-bg"
            style={{ color: "var(--text-tertiary)" }}
            title="关闭 (Esc)"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 预览内容 */}
      <div className="flex-1 overflow-hidden p-4 flex flex-col">{renderPreview()}</div>
    </Modal>
  );
}
