import { useEffect, useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FolderClosed,
  FileIcon,
} from "lucide-react";
import type { FolderEntry } from "@/types";
import { fileApi, projectApi } from "@/lib/tauri-api";
import { useNotificationStore } from "@/stores/useNotificationStore";

interface Props {
  folderPath: string;
}

function FolderTree({ folderPath }: { folderPath: string }) {
  const [root, setRoot] = useState<FolderEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const addToast = useNotificationStore((s) => s.addToast);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const tree = await fileApi.listFolderContents(folderPath);
      setRoot(tree);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleOpenFile = async (filePath: string) => {
    try {
      await projectApi.openFile(filePath);
    } catch (e) {
      addToast({ type: "error", title: "打开失败", message: String(e) });
    }
  };

  if (loading) {
    return (
      <div className="text-center py-6 text-xs" style={{ color: "var(--text-muted)" }}>
        加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-xs" style={{ color: "var(--color-danger)" }}>
        {error}
      </div>
    );
  }

  if (!root || root.children.length === 0) {
    return (
      <div className="text-center py-6 text-xs" style={{ color: "var(--text-muted)" }}>
        空文件夹
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {root.children.map((child) => (
        <TreeNode key={child.path} entry={child} depth={0} onOpenFile={handleOpenFile} />
      ))}
    </div>
  );
}

function TreeNode({
  entry,
  depth,
  onOpenFile,
}: {
  entry: FolderEntry;
  depth: number;
  onOpenFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (entry.is_dir) {
    return (
      <div>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-colors select-none"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alt)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {expanded ? (
            <ChevronDown size={13} strokeWidth={1.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          ) : (
            <ChevronRight size={13} strokeWidth={1.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          )}
          {expanded ? (
            <FolderOpen size={14} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
          ) : (
            <FolderClosed size={14} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
          )}
          <span className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
            {entry.name}
          </span>
        </div>
        {expanded && (
          <div>
            {entry.children.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} onOpenFile={onOpenFile} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors select-none group"
      style={{ paddingLeft: `${depth * 16 + 8 + 13 + 4}px` }}
      onDoubleClick={() => onOpenFile(entry.path)}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alt)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <FileIcon size={14} strokeWidth={1.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span className="flex-1 text-xs truncate" style={{ color: "var(--text-primary)" }}>
        {entry.name}
      </span>
      <span className="text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }}>
        {formatSize(entry.size)}
      </span>
    </div>
  );
}

export default function FileExplorer({ folderPath }: Props) {
  return <FolderTree folderPath={folderPath} />;
}