import Markdown from "react-markdown";

interface Props {
  content: string;
}

export default function MarkdownPreview({ content }: Props) {
  return (
    <div
      className="overflow-y-auto p-4 rounded-lg prose prose-sm max-w-none"
      style={{
        background: "var(--bg-surface-alt)",
        border: "1px solid var(--border-light)",
        color: "var(--text-secondary)",
        maxHeight: "calc(80vh - 120px)",
      }}
    >
      <Markdown
        components={{
          h1: ({ children }) => (
            <h1
              className="text-xl font-bold mb-3 pb-1"
              style={{
                color: "var(--text-primary)",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className="text-lg font-bold mb-2 pb-1"
              style={{
                color: "var(--text-primary)",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className="text-base font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {children}
            </p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--gold)" }}
            >
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code
                  className="block text-xs p-3 rounded-md overflow-x-auto"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    fontFamily: '"DM Mono", monospace',
                    color: "var(--text-secondary)",
                  }}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  fontFamily: '"DM Mono", monospace',
                }}
              >
                {children}
              </code>
            );
          },
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{ color: "var(--text-secondary)" }}>{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="pl-3 mb-3 italic"
              style={{
                borderLeft: "3px solid var(--gold)",
                color: "var(--text-tertiary)",
              }}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table
                className="w-full text-xs"
                style={{ borderCollapse: "collapse" }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              className="px-3 py-2 text-left font-medium"
              style={{
                background: "var(--bg-elevated)",
                borderBottom: "2px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className="px-3 py-1.5"
              style={{
                borderBottom: "1px solid var(--border-light)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </td>
          ),
          hr: () => (
            <hr
              className="my-4"
              style={{ borderColor: "var(--border-default)" }}
            />
          ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="max-w-full rounded-md my-2"
            />
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
