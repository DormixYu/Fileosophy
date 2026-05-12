import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, RotateCw } from "lucide-react";

interface Props {
  src: string;
  alt: string;
}

export default function ImagePreview({ src, alt }: Props) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.25));
  const rotateLeft = () => setRotation((r) => r - 90);
  const rotateRight = () => setRotation((r) => r + 90);
  const reset = () => {
    setScale(1);
    setRotation(0);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 工具栏 */}
      <div
        className="flex items-center gap-1 px-2 py-1 rounded-lg"
        style={{ background: "var(--bg-surface-alt)" }}
      >
        <button
          onClick={zoomOut}
          className="p-1.5 rounded transition-colors hover:bg-[var(--bg-elevated)]"
          style={{ color: "var(--text-secondary)" }}
          title="缩小"
        >
          <ZoomOut size={14} strokeWidth={1.5} />
        </button>
        <span
          className="text-xs w-12 text-center tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-1.5 rounded transition-colors hover:bg-[var(--bg-elevated)]"
          style={{ color: "var(--text-secondary)" }}
          title="放大"
        >
          <ZoomIn size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={rotateLeft}
          className="p-1.5 rounded transition-colors hover:bg-[var(--bg-elevated)]"
          style={{ color: "var(--text-secondary)" }}
          title="逆时针旋转"
        >
          <RotateCcw size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={rotateRight}
          className="p-1.5 rounded transition-colors hover:bg-[var(--bg-elevated)]"
          style={{ color: "var(--text-secondary)" }}
          title="顺时针旋转"
        >
          <RotateCw size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={reset}
          className="p-1.5 rounded transition-colors hover:bg-[var(--bg-elevated)]"
          style={{ color: "var(--text-secondary)" }}
          title="重置缩放和旋转"
        >
          <RotateCcw size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* 图片 */}
      <div
        className="overflow-auto rounded-lg"
        style={{ maxHeight: "calc(80vh - 160px)" }}
      >
        <img
          src={src}
          alt={alt}
          className="transition-transform duration-200"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
            maxWidth: scale <= 1 ? "100%" : "none",
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
