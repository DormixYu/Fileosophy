import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-md",
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className={`w-full ${width} mx-4 animate-scale-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-xl shadow-xl max-h-[85vh] flex flex-col"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
          }}
        >
          {/* 头部 */}
          {title && (
            <div
              className="flex items-center justify-between px-5 py-3.5 border-b"
              style={{ borderColor: "var(--border-light)" }}
            >
              <h2
                className="text-base font-serif tracking-wide"
                style={{ color: "var(--text-primary)" }}
              >
                {title}
              </h2>
              <button
                onClick={onClose}
                className="p-1 rounded-md transition-colors hover:bg-[var(--bg-surface-alt)]"
                style={{ color: "var(--text-tertiary)" }}
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}

          {/* 内容 */}
          <div className="px-5 py-4 overflow-y-auto">{children}</div>

          {/* 底部 */}
          {footer && (
            <div
              className="flex items-center justify-end gap-2 px-5 py-3 border-t"
              style={{ borderColor: "var(--border-light)" }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
