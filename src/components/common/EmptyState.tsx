import type { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="text-center py-10 animate-fade-in">
      {icon && (
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
          style={{ background: "var(--gold-glow)" }}
        >
          <span style={{ color: "var(--gold)" }}>{icon}</span>
        </div>
      )}
      {title && (
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </p>
      )}
      {description && (
        <p
          className="text-xs mb-4 max-w-xs mx-auto"
          style={{ color: "var(--text-muted)" }}
        >
          {description}
        </p>
      )}
      {action && (
        <button className="btn btn-primary btn-sm" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
