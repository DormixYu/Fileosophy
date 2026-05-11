import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";

interface DropdownItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface Props {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  side?: "bottom" | "top";
}

export default function Dropdown({
  trigger,
  items,
  align = "left",
  side = "bottom",
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  // 键盘导航
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => {
            const next = Math.min(i + 1, items.length - 1);
            return items[next]?.disabled ? next + 1 : next;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => {
            const prev = Math.max(i - 1, 0);
            return items[prev]?.disabled ? prev - 1 : prev;
          });
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < items.length) {
            const item = items[activeIndex];
            if (!item.disabled) {
              item.onClick();
              close();
            }
          }
          break;
        case "Escape":
          close();
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, items, activeIndex, close]);

  // 自动聚焦菜单
  useEffect(() => {
    if (open) {
      setActiveIndex(-1);
      menuRef.current?.focus();
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <div onClick={() => setOpen(!open)}>{trigger}</div>

      {open && (
        <div
          ref={menuRef}
          tabIndex={-1}
          className={`absolute z-50 min-w-[160px] py-1 rounded-lg animate-scale-in outline-none ${
            side === "top" ? "bottom-full mb-1" : "top-full mt-1"
          } ${align === "right" ? "right-0" : "left-0"}`}
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2"
              disabled={item.disabled}
              style={{
                color: item.danger
                  ? "var(--color-danger)"
                  : item.disabled
                    ? "var(--text-muted)"
                    : "var(--text-secondary)",
                background:
                  index === activeIndex
                    ? "var(--gold-glow)"
                    : "transparent",
                cursor: item.disabled ? "default" : "pointer",
              }}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  close();
                }
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {item.icon && (
                <span style={{ flexShrink: 0 }}>{item.icon}</span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
