interface Props {
  content: string;
}

export default function TextPreview({ content }: Props) {
  return (
    <pre
      className="text-xs whitespace-pre-wrap break-all overflow-y-auto p-4 rounded-lg leading-relaxed"
      style={{
        background: "var(--bg-surface-alt)",
        border: "1px solid var(--border-light)",
        color: "var(--text-secondary)",
        fontFamily: '"DM Mono", monospace',
        maxHeight: "calc(80vh - 120px)",
      }}
    >
      {content}
    </pre>
  );
}
