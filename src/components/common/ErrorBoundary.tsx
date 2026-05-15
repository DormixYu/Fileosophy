import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center h-full gap-4 p-6"
          style={{
            background: "var(--bg-void)",
            backgroundImage: "radial-gradient(ellipse at 50% 0%, var(--gold-glow) 0%, transparent 60%)",
          }}
        >
          {/* Logo SVG */}
          <svg
            viewBox="0 0 100 100"
            fill="none"
            className="w-12 h-12"
            style={{ color: "var(--text-tertiary)" }}
          >
            <path d="M26,8 L64,8 L82,26 L82,92 L26,92 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M64,8 L64,26 L82,26" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            <line x1="36" y1="36" x2="56" y2="36" stroke="currentColor" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
            <line x1="36" y1="78" x2="54" y2="78" stroke="currentColor" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
            <line x1="36" y1="86" x2="46" y2="86" stroke="currentColor" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
            <path
              d="M34,57 C40,36 52,36 52,53 C52,70 64,70 66,50"
              stroke="var(--gold)"
              strokeWidth="2.4"
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 3px rgba(201,168,76,0.35))" }}
            />
          </svg>

          {/* 标题 — font-serif */}
          <h2
            className="font-serif text-lg tracking-wide"
            style={{ color: "var(--text-primary)" }}
          >
            页面出现了问题
          </h2>

          {/* 鎏金装饰线 */}
          <div
            className="w-16 h-px"
            style={{ background: "var(--gold)", opacity: 0.35 }}
          />

          {/* 错误信息 */}
          <p className="text-xs font-mono text-center max-w-md" style={{ color: "var(--text-muted)" }}>
            {this.state.error?.message}
          </p>

          {/* 重试按钮 — btn-primary */}
          <button className="btn btn-primary" onClick={this.handleRetry}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}