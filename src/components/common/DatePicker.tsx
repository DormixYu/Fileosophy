import { useRef } from "react";

interface DatePickerProps {
  value: string;           // YYYY-MM-DD
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

function formatDateCN(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

export default function DatePicker({ value, onChange, placeholder = "选择日期", className, style }: DatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.showPicker();
  };

  const defaultStyle: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    color: value ? "var(--text-primary)" : "var(--text-muted)",
  };

  return (
    <div
      className={`relative cursor-pointer ${className || ""}`}
      style={{ ...defaultStyle, ...style, borderRadius: "6px" }}
      onClick={handleClick}
    >
      {/* 可见的格式化文本 */}
      <div className="px-3 py-1.5 text-sm select-none" style={{ color: value ? "var(--text-primary)" : "var(--text-muted)" }}>
        {value ? formatDateCN(value) : placeholder}
      </div>

      {/* 不可见的原生 date input，仅用于选择器弹窗 */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        style={{ fontSize: "16px" }}
        tabIndex={-1}
      />
    </div>
  );
}